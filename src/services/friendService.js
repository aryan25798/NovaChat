import { db, functions } from "../firebase";
import {
    collection, query, where, onSnapshot, doc, limit, orderBy
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { listenerManager } from "../utils/ListenerManager";

// --- Cloud Function References ---
const sendFriendRequestFn = httpsCallable(functions, 'sendFriendRequest');
const acceptFriendRequestFn = httpsCallable(functions, 'acceptFriendRequest');
const rejectFriendRequestFn = httpsCallable(functions, 'rejectFriendRequest');
const cancelFriendRequestFn = httpsCallable(functions, 'cancelFriendRequest');
const removeFriendFn = httpsCallable(functions, 'removeFriend');

// --- Real-time Listeners (client-side, read-only) ---

export const subscribeToFriends = (userId, callback) => {
    const listenerKey = `friends-${userId}`;

    const unsubscribe = onSnapshot(doc(db, "users", userId),
        (docSnap) => {
            if (docSnap.exists()) {
                callback(docSnap.data().friends || []);
            } else {
                callback([]);
            }
        },
        (error) => {
            listenerManager.handleListenerError(error, 'Friends');
            callback([]);
        }
    );

    listenerManager.subscribe(listenerKey, unsubscribe);

    return () => {
        listenerManager.unsubscribe(listenerKey);
    };
};

export const subscribeToIncomingRequests = (userId, callback) => {
    const q = query(
        collection(db, "friend_requests"),
        where("to", "==", userId),
        where("status", "==", "pending"),
        orderBy("timestamp", "desc"),
        limit(50)
    );

    const listenerKey = `friend-requests-incoming-${userId}`;

    const unsubscribe = onSnapshot(q,
        (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        },
        (error) => {
            listenerManager.handleListenerError(error, 'IncomingFriendRequests');
            callback([]);
        }
    );

    listenerManager.subscribe(listenerKey, unsubscribe);

    return () => {
        listenerManager.unsubscribe(listenerKey);
    };
};

export const subscribeToOutgoingRequests = (userId, callback) => {
    const q = query(
        collection(db, "friend_requests"),
        where("from", "==", userId),
        where("status", "==", "pending"),
        orderBy("timestamp", "desc"),
        limit(50)
    );

    const listenerKey = `friend-requests-outgoing-${userId}`;

    const unsubscribe = onSnapshot(q,
        (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        },
        (error) => {
            listenerManager.handleListenerError(error, 'OutgoingFriendRequests');
            callback([]);
        }
    );

    listenerManager.subscribe(listenerKey, unsubscribe);

    return () => {
        listenerManager.unsubscribe(listenerKey);
    };
};

// --- Actions (All via Cloud Functions) ---

/**
 * Send a friend request via Cloud Function.
 * Server validates: auth, rate limit, blocks, duplicates, super admin.
 */
export const sendFriendRequest = async (currentUserId, currentUserData, toUserId) => {
    const result = await sendFriendRequestFn({ toUserId });
    return result.data;
};

/**
 * Accept a friend request via Cloud Function.
 * Server validates: request exists, is pending, current user is recipient.
 * Atomically adds to both friend lists and deletes request.
 */
export const acceptFriendRequest = async (requestId, fromUserId, currentUserId) => {
    const result = await acceptFriendRequestFn({ requestId });
    return result.data;
};

/**
 * Cancel a friend request via Cloud Function.
 * Server validates: request exists, current user is sender.
 */
export const cancelFriendRequest = async (requestId) => {
    const result = await cancelFriendRequestFn({ requestId });
    return result.data;
};

/**
 * Reject a friend request via Cloud Function.
 * Server validates: request exists, current user is recipient.
 */
export const rejectFriendRequest = async (requestId) => {
    const result = await rejectFriendRequestFn({ requestId });
    return result.data;
};

/**
 * Remove a friend via Cloud Function.
 * Server validates: friendship exists.
 * Atomically removes from both friend lists.
 */
export const removeFriend = async (currentUserId, friendId) => {
    const result = await removeFriendFn({ friendId });
    return result.data;
};
