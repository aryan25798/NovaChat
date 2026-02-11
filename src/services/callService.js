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
import { listenerManager } from "../utils/ListenerManager";

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
    const listenerKey = `call-${callId}`;
    const unsubscribe = onSnapshot(doc(db, "calls", callId), (snap) => {
        if (snap.exists()) {
            onUpdate(snap.data());
        }
    }, (error) => {
        listenerManager.handleListenerError(error, 'SubscribeToCall');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

export const subscribeToIncomingCalls = (userId, onCallReceived) => {
    const q = query(
        collection(db, "calls"),
        where("receiverId", "==", userId),
        where("status", "==", "ringing")
    );

    const listenerKey = `incoming-calls-${userId}`;
    const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                onCallReceived(change.doc.id, change.doc.data());
            }
        });
    }, (error) => {
        listenerManager.handleListenerError(error, 'IncomingCalls');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
};

export const subscribeToCandidates = (callId, type, onCandidate) => {
    const collectionName = type === 'caller' ? 'calleeCandidates' : 'callerCandidates';
    const listenerKey = `candidates-${callId}-${type}`;

    const unsubscribe = onSnapshot(collection(db, "calls", callId, collectionName), (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                onCandidate(change.doc.data());
            }
        });
    }, (error) => {
        listenerManager.handleListenerError(error, 'CallCandidates');
    });

    listenerManager.subscribe(listenerKey, unsubscribe);
    return () => listenerManager.unsubscribe(listenerKey);
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
