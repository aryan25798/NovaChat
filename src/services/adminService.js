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
    getDoc,
    startAfter,
    limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { listenerManager } from '../utils/ListenerManager';

// --- Statistics & Real-time Monitoring ---

// --- Pagination Helpers ---
const DEFAULT_LIMIT = 50;

/**
 * Generic Paginated Fetcher
 * @param {string} collectionName 
 * @param {object} lastDoc - The last document from the previous fetch (for cursor)
 * @param {number} limitCount 
 * @returns {Promise<{data: Array, lastDoc: object}>}
 */
const fetchPaginatedData = async (collectionName, lastDoc = null, limitCount = DEFAULT_LIMIT) => {
    try {
        let q = query(
            collection(db, collectionName),
            orderBy('createdAt', 'desc'), // Ensure you have this index or use a field that exists on all docs
            limit(limitCount)
        );

        if (lastDoc) {
            q = query(
                collection(db, collectionName),
                orderBy('createdAt', 'desc'),
                startAfter(lastDoc),
                limit(limitCount)
            );
        }

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const newLastDoc = snapshot.docs[snapshot.docs.length - 1];

        return { data, lastDoc: newLastDoc };
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        throw error;
    }
};

export const fetchUsers = async (lastDoc = null) => {
    // Users might not have 'createdAt' indexed reliably in all legacy docs, 
    // so we might default to 'uid' or 'email' if needed, but 'createdAt' is best for "newest users".
    // For now, let's assume 'createdAt' exists or fallback to a simpler query if needed.
    // Actually, 'users' usually orders by joined date.

    try {
        let constraints = [orderBy('createdAt', 'desc'), limit(DEFAULT_LIMIT)];
        if (lastDoc) constraints.push(startAfter(lastDoc));

        const q = query(collection(db, "users"), ...constraints);
        const snapshot = await getDocs(q);
        return {
            users: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
            lastDoc: snapshot.docs[snapshot.docs.length - 1]
        };
    } catch (e) {
        // Fallback: If 'createdAt' is missing on some docs, Firestore might throw.
        // Try ordering by 'uid' as a stable fallback.
        console.warn("Fetch users by createdAt failed, falling back to basic list", e);
        const q = query(collection(db, "users"), limit(DEFAULT_LIMIT));
        const snapshot = await getDocs(q);
        return {
            users: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
            lastDoc: snapshot.docs[snapshot.docs.length - 1]
        };
    }
};

export const fetchChats = async (lastDoc = null) => {
    try {
        let constraints = [orderBy('lastMessageTimestamp', 'desc'), limit(DEFAULT_LIMIT)];
        if (lastDoc) constraints.push(startAfter(lastDoc));

        const q = query(collection(db, "chats"), ...constraints);
        const snapshot = await getDocs(q);
        return {
            chats: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
            lastDoc: snapshot.docs[snapshot.docs.length - 1]
        };
    } catch (error) {
        console.error("Error fetching chats:", error);
        return { chats: [], lastDoc: null };
    }
};

export const fetchStatuses = async (lastDoc = null) => {
    try {
        let constraints = [orderBy('timestamp', 'desc'), limit(DEFAULT_LIMIT)];
        if (lastDoc) constraints.push(startAfter(lastDoc));

        const q = query(collection(db, "statuses"), ...constraints);
        const snapshot = await getDocs(q);
        return {
            statuses: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
            lastDoc: snapshot.docs[snapshot.docs.length - 1]
        };
    } catch (error) {
        console.error("Error fetching statuses:", error);
        return { statuses: [], lastDoc: null };
    }
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

// --- Content Moderation (Permanent Deletions) ---

export const deleteChatPermanently = async (chatId) => {
    const adminDeleteChatFn = httpsCallable(functions, 'adminDeleteChat');
    return adminDeleteChatFn({ chatId });
};

export const deleteMessagePermanently = async (chatId, messageId) => {
    const adminHardDeleteMessageFn = httpsCallable(functions, 'adminHardDeleteMessage');
    return adminHardDeleteMessageFn({ chatId, messageId });
};

export const deleteStatus = async (statusId) => {
    const adminDeleteStatusFn = httpsCallable(functions, 'adminDeleteStatus');
    return adminDeleteStatusFn({ statusId });
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
