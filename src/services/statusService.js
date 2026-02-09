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
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";

const STATUS_COLLECTION = "statuses";

// --- Post Status ---
export const postStatus = async (user, type, contentFileOrText, caption = "", background = "") => {
    try {
        let contentUrl = contentFileOrText;

        if (type !== 'text' && contentFileOrText instanceof File) {
            const storageRef = ref(storage, `status/${user.uid}/${Date.now()}_${contentFileOrText.name}`);
            await uploadBytes(storageRef, contentFileOrText);
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

        if (statusDoc.exists()) {
            await updateDoc(statusRef, {
                items: arrayUnion(newItem),
                userPhoto: user.photoURL,
                userName: user.displayName,
                lastUpdated: serverTimestamp()
            });
        } else {
            await setDoc(statusRef, {
                userId: user.uid,
                userName: user.displayName,
                userPhoto: user.photoURL,
                items: [newItem],
                lastUpdated: serverTimestamp()
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
    return onSnapshot(doc(db, STATUS_COLLECTION, userId), (docSnap) => {
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
        console.error("Error subscribing to my status:", error);
    });
};

// --- Subscribe to Contact Updates ---
export const subscribeToRecentUpdates = (userId, friendIds, onUpdate) => {
    // If no friends, return empty
    if (!friendIds || friendIds.length === 0) {
        onUpdate({ recent: [], viewed: [] });
        return () => { };
    }

    // Firestore has a limit of 10-30 in the 'in' query. 
    // For many friends, we listen to the whole collection and filter client-side, 
    // which is better for "all updates from friends" logic.
    const q = query(collection(db, STATUS_COLLECTION));

    return onSnapshot(q, (snap) => {
        const updates = [];
        const viewed = [];
        const now = Date.now();

        snap.forEach(docSnap => {
            const data = docSnap.data();
            // FILTER: Must be a friend and NOT the current user
            if (data.userId === userId || !friendIds.includes(data.userId)) return;

            const activeItems = (data.items || []).filter(item => {
                const ts = item.timestamp?.toMillis ? item.timestamp.toMillis() : (item.timestamp instanceof Date ? item.timestamp.getTime() : 0);
                return now - ts < 24 * 60 * 60 * 1000;
            });

            if (activeItems.length > 0) {
                const hasUnviewed = activeItems.some(item => !item.viewers?.includes(userId));
                // Match the structure expected by StatusViewer and StatusPage
                const statusObj = {
                    user: { uid: data.userId, displayName: data.userName, photoURL: data.userPhoto },
                    statuses: activeItems.map(item => ({
                        ...item,
                        // Convert internal Date/ms back to Firestore-like object for compatibility
                        timestamp: { toDate: () => (item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp)) }
                    }))
                };

                if (hasUnviewed) updates.push(statusObj);
                else viewed.push(statusObj);
            }
        });

        onUpdate({ recent: updates, viewed: viewed });
    }, (error) => {
        console.error("Error subscribing to recent updates:", error);
    });
};

// --- Mark Status Viewed ---
export const markStatusAsViewed = async (statusDocId, itemIndex, userId, currentItems, currentViewersOfItem) => {
    if (currentViewersOfItem?.includes(userId)) return;

    try {
        const statusRef = doc(db, STATUS_COLLECTION, statusDocId);

        // We need to update the specific item in the array. 
        // Firestore doesn't support updating an item at an index easily without reading whole array.
        // We assume currentItems is passed correctly from the component state.

        const newItems = [...currentItems];
        if (!newItems[itemIndex].viewers) newItems[itemIndex].viewers = [];
        newItems[itemIndex].viewers.push(userId);

        await updateDoc(statusRef, { items: newItems });
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
