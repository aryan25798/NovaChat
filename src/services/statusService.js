import { db, storage, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion, deleteDoc, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { v4 as uuidv4 } from "uuid";
import { listenerManager } from "../utils/ListenerManager";

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
            viewers: []
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

import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

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
    const isFcmBlocked = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nova_fcm_backoff_active') === 'true';
    if (isFcmBlocked) {
        console.warn("Status sync: Skipping sync (Backoff Active due to previous throttling)");
        return { updates: [] };
    }

    try {
        const syncFn = httpsCallable(functions, 'syncStatusFeed');
        const result = await syncFn({ knownState });
        return result.data; // { updates: [ ... ], hasMore: bool }
    } catch (error) {
        const errStr = error.toString();
        if (errStr.includes('401') || errStr.includes('429')) {
            console.warn("Status sync: FCM/Auth Throttling detected. Activating Backoff.");
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('nova_fcm_backoff_active', 'true');
            }
        }
        console.error("Sync Statuses Failed", error);
        return { updates: [] };
    }
};

// Deprecated: Old O(N) Loop (Kept for reference if rollback needed, but commented out in spirit)
// export const subscribeToRecentUpdates = ... (Deleted)

// --- Mark Status Viewed ---
import { runTransaction } from 'firebase/firestore';

export const markStatusAsViewed = async (statusDocId, itemId, currentUserId) => {
    if (!statusDocId || !itemId || !currentUserId) return;

    try {
        const statusRef = doc(db, STATUS_COLLECTION, statusDocId);

        await runTransaction(db, async (transaction) => {
            const statusDoc = await transaction.get(statusRef);
            if (!statusDoc.exists()) return;

            const data = statusDoc.data();
            const items = data.items || [];

            // Find the item by its unique ID (instead of index for safety)
            const itemIndex = items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) return;

            const item = items[itemIndex];
            if (!item.viewers) item.viewers = [];

            // If already viewed, do nothing
            if (item.viewers.includes(currentUserId)) return;

            // Update local array clone
            item.viewers.push(currentUserId);

            // Write back the whole array (Transactions guarantee the read hasn't changed)
            transaction.update(statusRef, { items });
        });
    } catch (err) {
        console.error("Error marking status as viewed (transaction):", err);
    }
};

// --- Reply to Status ---
import { sendMessage } from "./chatService";

export const replyToStatus = async (currentUser, statusUser, statusItem, text) => {
    try {
        // Create a "reply" context object
        const replyContext = {
            id: statusItem.id, // Status ID as the message ID we are replying to
            text: statusItem.caption || (statusItem.type === 'text' ? statusItem.content : 'Status'),
            senderId: statusUser.uid,
            senderName: statusUser.displayName,
            type: statusItem.type,
            mediaUrl: statusItem.type !== 'text' ? statusItem.content : null,
            isStatusReply: true // Marker to handle UI differently if needed
        };

        // We need a chat ID between current user and status user.
        // For simplicity, we'll let sendMessage handle or find the chat, 
        // BUT sendMessage usually requires a `chatId`. 
        // We might need to find or create the chat first. 
        // Let's import `createPrivateChat` from chatListService if needed, 
        // OR assuming we can pass a special flag.

        // Actually, we should probably fetch the Chat ID first.
        // Let's use a helper or modify this to assume we can get it.
        // For now, let's try to find the chat.

        // BETTER: The UI calling this should probably provide the Chat ID if known, 
        // but StatusViewer doesn't know Chat ID.
        // We'll search for the chat.
    } catch (error) {
        console.error("Error replying to status:", error);
        throw error;
    }
};
