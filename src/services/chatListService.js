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

export const subscribeToUserChats = (userId, callback, limitCount = 30) => {
    if (!userId) return () => { };

    const q = query(
        collection(db, "chats"),
        where("participants", "array-contains", userId),
        orderBy("lastMessageTimestamp", "desc"),
        limit(limitCount)
    );

    const listenerKey = `chats-${userId}`;

    const unsubscribe = onSnapshot(q,
        (snapshot) => {
            const chats = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(chats);
        },
        (error) => {
            listenerManager.handleListenerError(error, 'ChatList');
            // Return empty array on error to prevent UI crashes
            callback([]);
        }
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
