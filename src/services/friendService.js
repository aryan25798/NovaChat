import { db } from "../firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";

// --- Real-time Listeners ---

export const subscribeToFriends = (userId, callback) => {
    return onSnapshot(doc(db, "users", userId), (docSnap) => {
        if (docSnap.exists()) {
            callback(docSnap.data().friends || []);
        } else {
            callback([]);
        }
    }, (error) => {
        console.error("Error subscribing to friends:", error);
    });
};

export const subscribeToIncomingRequests = (userId, callback) => {
    const q = query(
        collection(db, "friend_requests"),
        where("to", "==", userId),
        where("status", "==", "pending")
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
        console.error("Error subscribing to incoming friend requests:", error);
    });
};

export const subscribeToOutgoingRequests = (userId, callback) => {
    const q = query(
        collection(db, "friend_requests"),
        where("from", "==", userId),
        where("status", "==", "pending")
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
        console.error("Error subscribing to outgoing friend requests:", error);
    });
};

// --- Actions ---

export const sendFriendRequest = async (currentUserId, currentUserData, toUserId) => {
    // Add request
    await addDoc(collection(db, "friend_requests"), {
        from: currentUserId,
        to: toUserId,
        status: "pending",
        fromName: currentUserData.displayName,
        fromPhoto: currentUserData.photoURL,
        timestamp: serverTimestamp()
    });
};

export const cancelFriendRequest = async (requestId) => {
    await deleteDoc(doc(db, "friend_requests", requestId));
};

export const acceptFriendRequest = async (requestId, fromUserId, currentUserId) => {
    try {
        // 1. Add to both users' friend lists
        const batchPromise = [
            updateDoc(doc(db, "users", currentUserId), { friends: arrayUnion(fromUserId) }),
            updateDoc(doc(db, "users", fromUserId), { friends: arrayUnion(currentUserId) }),
            // 2. Delete the request
            deleteDoc(doc(db, "friend_requests", requestId))
        ];
        await Promise.all(batchPromise);
    } catch (e) {
        console.error("Error accepting request:", e);
        throw e;
    }
};

export const rejectFriendRequest = async (requestId) => {
    await deleteDoc(doc(db, "friend_requests", requestId));
};

export const removeFriend = async (currentUserId, friendId) => {
    await Promise.all([
        updateDoc(doc(db, "users", currentUserId), { friends: arrayRemove(friendId) }),
        updateDoc(doc(db, "users", friendId), { friends: arrayRemove(currentUserId) })
    ]);
};
