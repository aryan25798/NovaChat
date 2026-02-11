import { db } from "../firebase";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDocs, getDoc } from "firebase/firestore";

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
    if (currentUserId === toUserId) throw new Error("You cannot send a friend request to yourself.");

    // 1. Check if recipient is a Super Admin
    const toUserSnap = await getDoc(doc(db, "users", toUserId));
    if (!toUserSnap.exists()) throw new Error("User does not exist.");
    if (toUserSnap.data().superAdmin) throw new Error("Cannot send friend requests to system administrators.");

    // 2. Check if already friends
    const fromUserSnap = await getDoc(doc(db, "users", currentUserId));
    if (fromUserSnap.data().friends?.includes(toUserId)) {
        throw new Error("You are already friends with this user.");
    }

    // 3. Check for existing pending request (either direction)
    const q1 = query(collection(db, "friend_requests"),
        where("from", "==", currentUserId),
        where("to", "==", toUserId),
        where("status", "==", "pending"));
    const q2 = query(collection(db, "friend_requests"),
        where("from", "==", toUserId),
        where("to", "==", currentUserId),
        where("status", "==", "pending"));

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    if (!snap1.empty || !snap2.empty) {
        throw new Error("A friend request is already pending between you and this user.");
    }

    // 4. Add request
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
        const { writeBatch, doc, updateDoc, deleteDoc, arrayUnion } = await import("firebase/firestore");
        const batch = writeBatch(db);

        // 1. Add to both users' friend lists
        const userRef = doc(db, "users", currentUserId);
        const friendRef = doc(db, "users", fromUserId);

        batch.update(userRef, { friends: arrayUnion(fromUserId) });
        batch.update(friendRef, { friends: arrayUnion(currentUserId) });

        // 2. Delete the request
        const requestRef = doc(db, "friend_requests", requestId);
        batch.delete(requestRef);

        await batch.commit();
    } catch (e) {
        console.error("Error accepting request:", e);
        throw e;
    }
};

export const rejectFriendRequest = async (requestId) => {
    await deleteDoc(doc(db, "friend_requests", requestId));
};

export const removeFriend = async (currentUserId, friendId) => {
    const { writeBatch, doc, arrayRemove } = await import("firebase/firestore");
    const batch = writeBatch(db);

    batch.update(doc(db, "users", currentUserId), { friends: arrayRemove(friendId) });
    batch.update(doc(db, "users", friendId), { friends: arrayRemove(currentUserId) });

    await batch.commit();
};
