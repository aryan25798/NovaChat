import { db, storage } from "../firebase";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    serverTimestamp,
    query,
    where,
    onSnapshot
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
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
            const storageRef = ref(storage, `status/${user.uid}/${Date.now()}_${content.name}`);
            const uploadTask = uploadBytesResumable(storageRef, content);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed', null, reject, resolve);
            });
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

        if (statusDoc.exists()) {
            await updateDoc(statusRef, {
                items: arrayUnion(newItem),
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

// --- Subscribe to Contact Updates ---
export const subscribeToRecentUpdates = (userId, friendIds, onUpdate) => {
    // 1. Scalability Guard: If no friends, return empty immediately.
    if (!friendIds || friendIds.length === 0) {
        onUpdate({ recent: [], viewed: [] });
        return () => { };
    }

    // 2. Scalability Fix: Chunk friendIds into groups of 30 (Firestore 'in' limit)
    const CHUNK_SIZE = 30;
    const chunks = [];
    for (let i = 0; i < friendIds.length; i += CHUNK_SIZE) {
        chunks.push(friendIds.slice(i, i + CHUNK_SIZE));
    }

    const unsubscribers = [];
    // Store results from each chunk to merge them
    const resultsMap = new Map(); // chunkIndex -> { recent: [], viewed: [] }

    const mergeAndEmit = () => {
        let allRecent = [];
        let allViewed = [];
        resultsMap.forEach(res => {
            allRecent = [...allRecent, ...res.recent];
            allViewed = [...allViewed, ...res.viewed];
        });

        // Sort by timestamp desc
        const sortFn = (a, b) => {
            // Use latest status timestamp in the user's stack
            const getTs = (s) => s.statuses[s.statuses.length - 1]?.timestamp?.toDate?.() || new Date(0);
            return getTs(b) - getTs(a);
        };

        onUpdate({
            recent: allRecent.sort(sortFn),
            viewed: allViewed.sort(sortFn)
        });
    };

    chunks.forEach((chunk, index) => {
        const listenerKey = `friends-status-${userId}-chunk-${index}`;

        const q = query(
            collection(db, STATUS_COLLECTION),
            where("userId", "in", chunk),
            where("allowedUIDs", "array-contains", userId)
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const updates = [];
            const viewed = [];
            const now = Date.now();

            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.userId === userId) return;

                const activeItems = (data.items || []).filter(item => {
                    const ts = item.timestamp?.toMillis ? item.timestamp.toMillis() : (item.timestamp instanceof Date ? item.timestamp.getTime() : 0);
                    return now - ts < 24 * 60 * 60 * 1000;
                });

                if (activeItems.length > 0) {
                    const hasUnviewed = activeItems.some(item => !item.viewers?.includes(userId));
                    const statusObj = {
                        id: docSnap.id,
                        user: { uid: data.userId, displayName: data.userName, photoURL: data.userPhoto },
                        statuses: activeItems.map(item => ({
                            ...item,
                            timestamp: { toDate: () => (item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp)) }
                        }))
                    };

                    if (hasUnviewed) updates.push(statusObj);
                    else viewed.push(statusObj);
                }
            });

            resultsMap.set(index, { recent: updates, viewed: viewed });
            mergeAndEmit();

        }, (error) => {
            listenerManager.handleListenerError(error, `FriendsStatus-Chunk-${index}`);
        });

        unsubscribers.push({ key: listenerKey, unsub: unsubscribe });
        listenerManager.subscribe(listenerKey, unsubscribe);
    });

    return () => {
        unsubscribers.forEach(({ key, unsub }) => {
            unsub();
            listenerManager.unsubscribe(key);
        });
    };
};

// --- Mark Status Viewed ---
export const markStatusAsViewed = async (statusDocId, itemIndex, userId, currentItems, currentViewersOfItem) => {
    // 🛡️ Guard: Early exit if already viewed
    if (currentViewersOfItem?.includes(userId)) return;

    try {
        const statusRef = doc(db, STATUS_COLLECTION, statusDocId);

        // OPTIMIZATION: Instead of full array replacement from client state,
        // we could potentially use a transaction for high-traffic apps.
        // For current scope, we ensure the update is localized.
        const newItems = [...currentItems];
        if (newItems[itemIndex]) {
            if (!newItems[itemIndex].viewers) newItems[itemIndex].viewers = [];
            if (!newItems[itemIndex].viewers.includes(userId)) {
                newItems[itemIndex].viewers.push(userId);
                await updateDoc(statusRef, { items: newItems });
            }
        }
    } catch (err) {
        console.error("Error marking status as viewed:", err);
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
