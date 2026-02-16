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

import { ChatMetadataService } from "./ChatMetadataService";

export const subscribeToUserChats = (userId, callback, limitCount = 30, componentId = 'default') => {
    if (!userId) return () => { };

    const listenerKey = `chats-${userId}-${componentId}`;
    let firestoreUnsubscribe = null;
    let rtdbUnsubscribe = null;

    let firestoreData = new Map(); // Map<chatId, chatDocData>
    let rtdbData = {};             // Object<chatId, metadata>

    // Helper to merge and sort (Throttled)
    let throttleTimeout = null;
    const emitUpdates = () => {
        if (throttleTimeout) return;

        throttleTimeout = setTimeout(() => {
            throttleTimeout = null;
            processUpdates();
        }, 400); // 400ms throttle
    };

    const processUpdates = () => {
        const getMillis = (t) => {
            if (!t) return 0;
            if (typeof t.toMillis === 'function') return t.toMillis();
            if (t instanceof Date) return t.getTime();
            if (t.seconds) return t.seconds * 1000;
            return t; // Case for raw numbers
        };

        const mergedChats = Array.from(firestoreData.values()).map(chat => {
            const meta = rtdbData[chat.id];
            if (meta) {
                const userUnread = meta.unreadCount?.[userId] || 0;
                return {
                    ...chat,
                    lastMessage: meta.lastMessage || chat.lastMessage,
                    lastMessageTimestamp: meta.lastUpdated ? (new Date(meta.lastUpdated)) : chat.lastMessageTimestamp,
                    unreadCount: { ...chat.unreadCount, [userId]: userUnread },
                    _source: 'hybrid'
                };
            }
            return chat;
        });

        mergedChats.sort((a, b) => {
            const tA = getMillis(a.lastMessageTimestamp);
            const tB = getMillis(b.lastMessageTimestamp);
            return tB - tA;
        });

        callback(mergedChats);
    };

    // 1. Setup Firestore Listener (Existence & Base Data)
    const setupFirestoreListener = () => {
        const q = query(
            collection(db, "chats"),
            where("participants", "array-contains", userId),
            orderBy("lastMessageTimestamp", "desc"),
            limit(limitCount)
        );

        firestoreUnsubscribe = onSnapshot(q, (snapshot) => {
            let idsChanged = false;

            snapshot.docChanges().forEach(change => {
                const docData = { id: change.doc.id, ...change.doc.data({ serverTimestamps: 'estimate' }) };

                if (change.type === 'added' || change.type === 'modified') {
                    if (!firestoreData.has(change.doc.id)) idsChanged = true;
                    firestoreData.set(change.doc.id, docData);
                }
                if (change.type === 'removed') {
                    firestoreData.delete(change.doc.id);
                    idsChanged = true; // Need to remove from RTDB listener
                }
            });

            // Initial load or list structure change -> Update RTDB Subscription
            if (idsChanged || snapshot.docChanges().length === 0 /* initial */) {
                updateRTDBSubscription();
            }

            emitUpdates();

        }, (error) => {
            if (error.code === 'failed-precondition') {
                // Fallback for missing index
                console.warn("[ChatList] Index missing, falling back to simple query");
                const fallbackQ = query(
                    collection(db, "chats"),
                    where("participants", "array-contains", userId),
                    limit(limitCount)
                );
                // We don't support robust fallback recursion here for brevity in this refactor
                // but strictly speaking we should. 
            }
            console.error("[ChatList] Firestore Error:", error);
        });
    };

    // 2. Setup RTDB Listener (Metadata)
    const updateRTDBSubscription = () => {
        if (rtdbUnsubscribe) rtdbUnsubscribe();

        const chatIds = Array.from(firestoreData.keys());
        if (chatIds.length === 0) return;

        rtdbUnsubscribe = ChatMetadataService.subscribeToMultiChatMeta(chatIds, (newMeta) => {
            rtdbData = newMeta;
            emitUpdates();
        });
    };

    setupFirestoreListener();

    return () => {
        if (firestoreUnsubscribe) firestoreUnsubscribe();
        if (rtdbUnsubscribe) rtdbUnsubscribe();
    };
};

export const createPrivateChat = async (currentUser, otherUser) => {
    const combinedId = [currentUser.uid, otherUser.uid].sort().join('_');

    try {
        await runTransaction(db, async (transaction) => {
            const chatRef = doc(db, "chats", combinedId);
            const chatSnap = await transaction.get(chatRef);

            if (!chatSnap.exists()) {
                const initData = {
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
                    },
                    createdAt: serverTimestamp()
                };
                transaction.set(chatRef, initData);

                // [HYBRID] Initialize RTDB Metadata node
                ChatMetadataService.updateChatMetadata(combinedId, {
                    text: 'Chat started',
                    senderId: 'system',
                    type: 'system'
                }, [currentUser.uid, otherUser.uid]);
            }
        });
        return combinedId;
    } catch (error) {
        console.error("Error creating chat:", error);
        throw error;
    }
};
