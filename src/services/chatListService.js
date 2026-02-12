import { db } from "../firebase";
import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    limit
} from "firebase/firestore";
import { listenerManager } from "../utils/ListenerManager";

export const subscribeToUserChats = (userId, callback, limitCount = 30, componentId = 'default') => {
    if (!userId) return () => { };

    const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", userId),
        orderBy("lastMessageTimestamp", "desc"),
        limit(limitCount)
    );

    const listenerKey = `chats-${userId}-${componentId}`;

    // Local cache to preserve object references (Structural Sharing)
    // This ensures React.memo works for unchanged items in the list
    let chatCache = new Map();

    const unsubscribe = onSnapshot(q,
        (snapshot) => {
            let hasChanges = false;

            // Initial load or full refresh
            if (chatCache.size === 0 && snapshot.docs.length > 0) {
                snapshot.docs.forEach(doc => {
                    chatCache.set(doc.id, { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }); // Add this option
                });
                hasChanges = true;
            } else {
                snapshot.docChanges().forEach((change) => {
                    const doc = change.doc;
                    const data = { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }; // Add this option

                    if (change.type === "added" || change.type === "modified") {
                        chatCache.set(doc.id, data);
                        hasChanges = true;
                    }
                    if (change.type === "removed") {
                        chatCache.delete(doc.id);
                        hasChanges = true;
                    }
                });
            }

            if (hasChanges || snapshot.docChanges().length === 0) {
                const getMillis = (t) => {
                    if (!t) return 0;
                    if (typeof t.toMillis === 'function') return t.toMillis();
                    if (t instanceof Date) return t.getTime();
                    if (t.seconds) return t.seconds * 1000;
                    return 0;
                };

                const sortedChats = Array.from(chatCache.values()).sort((a, b) => {
                    const tA = getMillis(a.lastMessageTimestamp);
                    const tB = getMillis(b.lastMessageTimestamp);
                    return tB - tA;
                });
                callback(sortedChats);
            }
        },
        (error) => {
            listenerManager.handleListenerError(error, 'ChatList');
            // Return empty array on error to prevent UI crashes
            callback([]);
        }, { includeMetadataChanges: true }
    );

    // Register with manager
    listenerManager.subscribe(listenerKey, unsubscribe);

    // Return cleanup function
    return () => {
        listenerManager.unsubscribe(listenerKey);
    };
};

export const createPrivateChat = async (currentUser, otherUser) => {
    const combinedId = [currentUser.uid, otherUser.uid].sort().join('_');

    try {
        const chatRef = doc(db, "chats", combinedId);
        const chatSnap = await getDoc(chatRef);

        if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                participants: [currentUser.uid, otherUser.uid],
                participantInfo: {
                    [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL },
                    [otherUser.uid]: { displayName: otherUser.displayName, photoURL: otherUser.photoURL }
                },
                lastMessage: null,
                lastMessageTimestamp: serverTimestamp(),
                type: 'private',
                unreadCount: {
                    [currentUser.uid]: 0,
                    [otherUser.uid]: 0
                }
            });
        }
        return combinedId;
    } catch (error) {
        console.error("Error creating chat:", error);
        throw error;
    }
};
