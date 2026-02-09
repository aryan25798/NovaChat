import { db } from "../firebase";
import {
    collection,
    addDoc,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    where,
    getDoc,
    setDoc
} from "firebase/firestore";

// --- Signaling & Call Management ---

export const createCallDoc = async (caller, receiver, type, chatId) => {
    const callDocRef = doc(collection(db, "calls"));
    const callId = callDocRef.id;

    await setDoc(callDocRef, {
        callerId: caller.uid,
        callerName: caller.displayName,
        callerPhoto: caller.photoURL,
        receiverId: receiver.uid,
        type,
        status: 'ringing',
        timestamp: serverTimestamp(),
        chatId: chatId || null
    });

    return callId;
};

export const updateCallStatus = async (callId, status, data = {}) => {
    const callRef = doc(db, "calls", callId);
    await updateDoc(callRef, {
        status,
        ...data
    });
};

export const addCandidate = async (callId, type, candidate) => {
    const collectionName = type === 'caller' ? 'callerCandidates' : 'calleeCandidates';
    await addDoc(collection(db, "calls", callId, collectionName), candidate.toJSON());
};

export const subscribeToCall = (callId, onUpdate) => {
    return onSnapshot(doc(db, "calls", callId), (snap) => {
        if (snap.exists()) {
            onUpdate(snap.data());
        }
    }, (error) => {
        console.error("Error subscribing to call:", error);
    });
};

export const subscribeToIncomingCalls = (userId, onCallReceived) => {
    const q = query(
        collection(db, "calls"),
        where("receiverId", "==", userId),
        where("status", "==", "ringing")
    );

    return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                onCallReceived(change.doc.id, change.doc.data());
            }
        });
    }, (error) => {
        console.error("Error subscribing to incoming calls:", error);
    });
};

export const subscribeToCandidates = (callId, type, onCandidate) => {
    const collectionName = type === 'caller' ? 'calleeCandidates' : 'callerCandidates';
    return onSnapshot(collection(db, "calls", callId, collectionName), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                onCandidate(change.doc.data());
            }
        });
    }, (error) => {
        console.error("Error subscribing to candidates:", error);
    });
};

export const setLocalDescription = async (callId, description, type) => {
    // type is 'offer' or 'answer'
    const callRef = doc(db, "calls", callId);
    await updateDoc(callRef, {
        [type]: { type: description.type, sdp: description.sdp }
    });
};

export const getCallDoc = async (callId) => {
    const snap = await getDoc(doc(db, "calls", callId));
    return snap.exists() ? snap.data() : null;
};
