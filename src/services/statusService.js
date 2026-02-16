import { db, storage, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { v4 as uuidv4 } from "uuid";
import { listenerManager } from "../utils/ListenerManager";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { sendMessage } from "./chatService";

const STATUS_COLLECTION = "statuses";

// --- Post Status ---
/**
 * @param {object} user - Current user object.
 * @param {string} type - 'text', 'image', or 'video'.
 * @param {string|File} content - The URL or File object.
 * @param {string} caption - Optional caption.
 * @param {string} background - Background color for text status.
 */
export const postStatus = async (user, type, content, caption = "", background = "") => {
    try {
        let contentUrl = content;

        // If content is a File, handle upload (Legacy/Fallback mode)
        if (type !== 'text' && content instanceof File) {
            let fileToUpload = content;

            // If it's an image, attempt compression
            if (type === 'image') {
                try {
                    const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                    fileToUpload = await imageCompression(content, options);
                } catch (e) {
                    console.warn("Status image compression failed:", e);
                    // If compression fails, proceed with the original file
                }
            }

            const storageRef = ref(storage, `status/${user.uid}/${Date.now()}_${fileToUpload.name}`);
            await uploadBytes(storageRef, fileToUpload); // Use uploadBytes for simpler upload
            contentUrl = await getDownloadURL(storageRef);
        }

        const newItem = {
            id: uuidv4(),
            type,
            content: contentUrl,
            caption: caption || "",
            background: type === 'text' ? background : null,
            timestamp: new Date(),
            // viewers: [] // REMOVED: Viewers are now in subcollection
        };

        const statusRef = doc(db, STATUS_COLLECTION, user.uid);
        const statusDoc = await getDoc(statusRef);

        // DENORMALIZATION: Include the current friend list in the status doc
        // This allows the Firestore rules to perform a secure "in" query for friends
        // without doing an expensive get() call per status.
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const currentFriends = userSnap.exists() ? (userSnap.data().friends || []) : [];

        // WRITE-TIME CLEANUP (TTL Simulation)
        // Filter out items older than 24 hours to prevent document bloat
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        let existingItems = [];
        if (statusDoc.exists()) {
            existingItems = (statusDoc.data().items || []).filter(item => {
                const ts = item.timestamp?.toMillis ? item.timestamp.toMillis() : (item.timestamp instanceof Date ? item.timestamp.getTime() : 0);
                return now - ts < ONE_DAY_MS;
            });
        }

        const updatedItems = [...existingItems, newItem];

        if (statusDoc.exists()) {
            await updateDoc(statusRef, {
                items: updatedItems, // semantic replacement instead of arrayUnion
                userPhoto: user.photoURL,
                userName: user.displayName,
                lastUpdated: serverTimestamp(),
                allowedUIDs: currentFriends // Update the "who can see" list
            });
        } else {
            await setDoc(statusRef, {
                userId: user.uid,
                userName: user.displayName,
                userPhoto: user.photoURL,
                items: [newItem],
                lastUpdated: serverTimestamp(),
                allowedUIDs: currentFriends
            });
        }
        return true;
    } catch (error) {
        console.error("Error posting status:", error);
        throw error;
    }
};

// --- Subscribe to My Status ---
export const subscribeToMyStatus = (userId, onUpdate) => {
    const listenerKey = `my-status-${userId}`;
    const unsubscribe = onSnapshot(doc(db, STATUS_COLLECTION, userId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = Date.now();
            const active = (data.items || []).filter(item => {
                const ts = item.timestamp?.toMillis ? item.timestamp.toMillis() : (item.timestamp instanceof Date ? item.timestamp.getTime() : 0);
                return now - ts < 24 * 60 * 60 * 1000;
            });
            onUpdate(active.length > 0 ? { ...data, items: active } : null);
        } else {
            onUpdate(null);
        }
    }, (error) => {
        listenerManager.handleListenerError(error, 'MyStatus');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

// --- EFFICIENCY UPGRADE: Single-Listener Feed + Sync ---
// Replaces the old O(N) listener loop.

/**
 * 1. Listen to the "Feed Signal" document.
 * This document contains lightweight timestamps of friends who updated their status.
 * Path: users/{uid}/feed/status_signals
 */
export const subscribeToStatusFeed = (userId, onSignal) => {
    const listenerKey = `status-feed-${userId}`;
    const feedRef = doc(db, "users", userId, "feed", "status_signals");

    const unsubscribe = onSnapshot(feedRef, (docSnap) => {
        if (docSnap.exists()) {
            // Signals: { [friendId]: { timestamp, userName, count, latestId } }
            onSignal(docSnap.data());
        } else {
            onSignal({});
        }
    }, (error) => {
        // Silent fail or retry
        console.warn("Status feed listener error", error);
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

export const syncStatuses = async (knownState = {}) => {
    // RESILIENCE UPGRADE: Replace infinite session-block with a timed backoff (Cooling Off)
    if (typeof sessionStorage !== 'undefined') {
        // Migration: Remove legacy boolean key if it exists
        if (sessionStorage.getItem('nova_fcm_backoff_active')) {
            sessionStorage.removeItem('nova_fcm_backoff_active');
        }
    }

    const backoffUntil = typeof sessionStorage !== 'undefined' ?
        parseInt(sessionStorage.getItem('nova_status_backoff_until') || '0', 10) : 0;

    if (Date.now() < backoffUntil) {
        const remaining = Math.ceil((backoffUntil - Date.now()) / 1000);
        console.warn(`Status sync: Skipping sync (Backoff Active for ${remaining}s due to previous throttling)`);
        return { updates: [] };
    }

    try {
        const syncFn = httpsCallable(functions, 'syncStatusFeed');

        // TIMEOUT SAFETY: Cloud Functions can sometimes hang or be extremely slow.
        // We race the function call against a 10s timeout to keep the UI responsive.
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("SYNC_TIMEOUT")), 10000)
        );

        const result = await Promise.race([syncFn({ knownState }), timeoutPromise]);

        // Success: Clear backoff if it existed
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.removeItem('nova_status_backoff_until');
        }

        return result.data; // { updates: [ ... ], hasMore: bool }
    } catch (error) {
        const errStr = error.toString();
        // Trigger 5-minute cooldown if we hit rate limits or timeouts
        if (errStr.includes('401') || errStr.includes('429') || errStr.includes('SYNC_TIMEOUT')) {
            const COOLDOWN_MS = 300000; // 5 Minutes
            console.warn(`Status sync: ${errStr.includes('TIMEOUT') ? 'Timeout' : 'Throttling'} detected. Activating 5m Backoff.`);
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('nova_status_backoff_until', (Date.now() + COOLDOWN_MS).toString());
            }
        }
        console.error("Sync Statuses Failed", error);
        return { updates: [] };
    }
};

// Deprecated: Old O(N) Loop (Kept for reference if rollback needed, but commented out in spirit)
// export const subscribeToRecentUpdates = ... (Deleted)

// --- Mark Status Viewed (Scalable Subcollection) ---
export const markStatusAsViewed = async (statusDocId, itemId, currentUserId) => {
    if (!statusDocId || !itemId || !currentUserId) return;

    try {
        // SCALABLE FIX: Write to subcollection 'views' instead of updating the main doc array.
        // Path: statuses/{statusDocId}/views/{itemId}_{viewerId}
        // This avoids the 1MB document limit and reduces write contention.
        const viewId = `${itemId}_${currentUserId}`;
        const viewRef = doc(db, STATUS_COLLECTION, statusDocId, "views", viewId);

        await setDoc(viewRef, {
            itemId: itemId,
            viewerId: currentUserId,
            timestamp: serverTimestamp()
        });

    } catch (err) {
        console.error("Error marking status as viewed:", err);
    }
};

// --- Reply to Status ---
export const replyToStatus = async (currentUser, statusUser, statusItem, text) => {
    try {
        const { getChatId } = await import('../utils/chatUtils');
        const { sendMessage } = await import('./chatService');

        const chatId = getChatId(currentUser.uid, statusUser.uid);
        if (!chatId) throw new Error("Could not resolve chat ID for status reply.");

        // Create a "reply" context object attached to the message
        const replyContext = {
            id: statusItem.id,
            text: statusItem.caption || (statusItem.type === 'text' ? statusItem.content : 'Status'),
            senderId: statusUser.uid,
            senderName: statusUser.displayName,
            type: statusItem.type,
            mediaUrl: statusItem.type !== 'text' ? statusItem.content : null,
            isStatusReply: true
        };

        // Ensure the chat document exists before sending
        const { doc, getDoc, setDoc, serverTimestamp: fsTimestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const chatRef = doc(db, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                id: chatId,
                participants: [currentUser.uid, statusUser.uid],
                participantInfo: {
                    [currentUser.uid]: { displayName: currentUser.displayName || 'User', photoURL: currentUser.photoURL || null },
                    [statusUser.uid]: { displayName: statusUser.displayName || 'User', photoURL: statusUser.photoURL || null }
                },
                type: 'private',
                createdAt: fsTimestamp(),
                unreadCount: { [currentUser.uid]: 0, [statusUser.uid]: 0 }
            });
        }

        await sendMessage(chatId, text, currentUser, replyContext);

    } catch (error) {
        console.error("Error replying to status:", error);
        throw error;
    }
};
