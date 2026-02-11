import { db, functions } from '../firebase';
import {
    collection,
    onSnapshot,
    doc,
    deleteDoc,
    getDocs,
    query,
    where,
    writeBatch,
    orderBy,
    getDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { listenerManager } from '../utils/ListenerManager';

// --- Statistics & Real-time Monitoring ---

export const subscribeToDashboardStats = (callback) => {
    // We'll return an object with unsubscribe functions to allow individual cleanup if needed, 
    // or a single function that calls all of them.

    // For simplicity, we can fetch these in the component, or abstract here. 
    // Given the real-time nature, passing callbacks for each stream is cleaner.

    // However, to keep the service pattern consistent, let's export individual subscribers
    return;
};

export const subscribeToUsers = (callback) => {
    const listenerKey = 'admin-users';
    const unsubscribe = onSnapshot(collection(db, "users"), (snap) => {
        const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(users);
    }, (error) => {
        listenerManager.handleListenerError(error, 'AdminUsers');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

export const subscribeToChats = (callback) => {
    const listenerKey = 'admin-chats';
    const unsubscribe = onSnapshot(collection(db, "chats"), (snap) => {
        const chats = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(chats);
    }, (error) => {
        listenerManager.handleListenerError(error, 'AdminChats');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

export const subscribeToStatuses = (callback) => {
    const listenerKey = 'admin-statuses';
    const unsubscribe = onSnapshot(collection(db, "statuses"), (snap) => {
        const statuses = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(statuses);
    }, (error) => {
        listenerManager.handleListenerError(error, 'AdminStatuses');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

// --- User Management ---

export const toggleUserBan = async (userId, currentStatus) => {
    try {
        // Use Cloud Function to set both Firestore field AND Custom Claim
        const banUser = httpsCallable(functions, 'banUser');
        await banUser({ targetUid: userId, isBanned: !currentStatus });
    } catch (error) {
        console.error("Error toggling ban:", error);
        throw error;
    }
};

export const deleteUserAndData = async (userId) => {
    try {
        // Use Cloud Function for complete user deletion (auth + data + storage)
        const nukeUser = httpsCallable(functions, 'nukeUser');
        await nukeUser({ targetUid: userId });
    } catch (error) {
        console.error("Error deleting user:", error);
        throw error;
    }
};

// --- Content Moderation (Permanent Deletions) ---

export const deleteChatPermanently = async (chatId) => {
    await deleteDoc(doc(db, "chats", chatId));
};

export const deleteMessagePermanently = async (chatId, messageId) => {
    await deleteDoc(doc(db, "chats", chatId, "messages", messageId));
};

export const deleteStatus = async (statusId) => {
    await deleteDoc(doc(db, "statuses", statusId));
};

// --- Spy Mode ---

export const subscribeToChatMessages = (chatId, callback) => {
    if (!chatId) return () => { };
    const listenerKey = `admin-chat-msgs-${chatId}`;
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(messages);
    }, (error) => {
        listenerManager.handleListenerError(error, 'AdminSpyMode');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

// --- Admin Verification ---

export const checkIsAdmin = async (userId) => {
    if (!userId) return false;
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() && userDoc.data().isAdmin === true;
};
export const checkIsSuperAdmin = async (userId) => {
    if (!userId) return false;
    const userDoc = await getDoc(doc(db, "users", userId));
    return userDoc.exists() && userDoc.data().superAdmin === true;
};
