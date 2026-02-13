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
    limit,
    runTransaction
} from "firebase/firestore";
import { listenerManager } from "../utils/ListenerManager";

export const subscribeToUserChats = (userId, callback, limitCount = 30, componentId = 'default') => {
    if (!userId) return () => { };

    const listenerKey = `chats-${userId}-${componentId}`;
    let activeUnsubscribe = null;
    let chatCache = new Map();

    const setupListener = (useComplexQuery) => {
        // Cleanup previous if exists (though usually we are here because it failed or hasn't started)
        if (activeUnsubscribe) {
            activeUnsubscribe();
            activeUnsubscribe = null;
        }

        let q;
        if (useComplexQuery) {
            q = query(
                collection(db, "chats"),
                where("participants", "array-contains", userId),
                orderBy("lastMessageTimestamp", "desc"),
                limit(limitCount)
            );
        } else {
            // Fallback: No ordering, just get chats and sort client-side
            console.log("[ChatList] Using fallback query (no server sort)");
            q = query(
                collection(db, "chats"),
                where("participants", "array-contains", userId),
                limit(limitCount)
            );
        }

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                let hasChanges = false;
                if (chatCache.size === 0 && snapshot.docs.length > 0) {
                    snapshot.docs.forEach(doc => {
                        chatCache.set(doc.id, { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) });
                    });
                    hasChanges = true;
                } else {
                    snapshot.docChanges().forEach((change) => {
                        const doc = change.doc;
                        const data = { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) };
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
                if (useComplexQuery && error.code === 'failed-precondition') {
                    console.warn("[ChatList] Missing index, switching to fallback query...");
                    // Retry with simple query
                    setupListener(false);
                } else {
                    console.error("[ChatList] Listener error:", error);
                    listenerManager.handleListenerError(error, 'ChatList');
                    callback([]);
                }
            }, { includeMetadataChanges: true }
        );

        activeUnsubscribe = unsubscribe;
        listenerManager.subscribe(listenerKey, unsubscribe);
    };

    // Start with complex query, will fallback if index missing
    setupListener(true);

    // Return current cleanup
    return () => {
        if (activeUnsubscribe) activeUnsubscribe();
        listenerManager.unsubscribe(listenerKey);
    };
};

export const createPrivateChat = async (currentUser, otherUser) => {
    const combinedId = [currentUser.uid, otherUser.uid].sort().join('_');

    try {
        await runTransaction(db, async (transaction) => {
            const chatRef = doc(db, "chats", combinedId);
            const chatSnap = await transaction.get(chatRef);

            if (!chatSnap.exists()) {
                transaction.set(chatRef, {
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
        });
        return combinedId;
    } catch (error) {
        console.error("Error creating chat:", error);
        throw error;
    }
};
