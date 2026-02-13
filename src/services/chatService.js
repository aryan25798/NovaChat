import { db, auth, storage, functions, rtdb } from "../firebase";
import { lightningSync } from "./LightningService";
import {
    collection, addDoc, query, where, orderBy, onSnapshot,
    doc, updateDoc, deleteDoc, getDoc, setDoc, getDocs,
    serverTimestamp, increment, arrayUnion, writeBatch, deleteField, limit, limitToLast, startAfter // added limit/limitToLast
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { listenerManager } from "../utils/ListenerManager";
import PQueue from 'p-queue';

import { GEMINI_BOT_ID } from '../constants';

// Official Gemini Logo
const GEMINI_LOGO_URL = "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png";

// Constants
export const CHATS_COLLECTION = "chats";
export const MESSAGES_COLLECTION = "messages";
const MAX_RESULTS = 20;

// Cloud Functions
const initializeGeminiChatFn = httpsCallable(functions, 'initializeGeminiChat');
const clearChatHistoryFn = httpsCallable(functions, 'clearChatHistory');
const deleteChatFn = httpsCallable(functions, 'deleteChat');

/**
 * Subscribes to messages for a specific chat.
 * @param {string} chatId
 * @param {function} callback - Function to update state with messages
 * @param {function} onUnreadUpdate - Optional callback when unread messages are detected
 * @returns {function} unsubscribe function
 */
export const subscribeToMessages = (chatId, currentUserId, callback, updateReadStatus = true, limitCount = 20) => {
    if (!chatId) return () => { };

    const listenerKey = `messages-${chatId}`;
    let messageCache = new Map();
    let lastEmittedJson = "";

    const q = query(
        collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION),
        orderBy("timestamp", "asc"),
        limitToLast(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {

        // 1. Update Cache
        if (messageCache.size === 0 && snapshot.docs.length > 0) {
            snapshot.docs.forEach(doc => {
                const data = doc.data({ serverTimestamps: 'estimate' });
                messageCache.set(doc.id, {
                    id: doc.id,
                    ...data,
                    status: doc.metadata.hasPendingWrites ? 'pending' : (data.read ? 'read' : (data.delivered ? 'delivered' : 'sent')),
                    _doc: doc
                });
            });
        } else {
            snapshot.docChanges().forEach((change) => {
                const doc = change.doc;
                const data = doc.data({ serverTimestamps: 'estimate' });

                if (change.type === "added" || change.type === "modified") {
                    messageCache.set(doc.id, {
                        id: doc.id,
                        ...data,
                        status: doc.metadata.hasPendingWrites ? 'pending' : (data.read ? 'read' : (data.delivered ? 'delivered' : 'sent')),
                        _doc: doc
                    });
                }
                if (change.type === "removed") {
                    messageCache.delete(doc.id);
                }
            });
        }

        // 2. Emit ONLY if changed (Deep Compare)
        const currentMessages = Array.from(messageCache.values());
        // Simple optimization: only stringify relevant fields if performance needed, but for 20 msgs JSON is fine.
        // We strip _doc to avoid circular structure in stringify if it exists (it's a complex object)
        const safeForStringify = currentMessages.map(m => ({ ...m, _doc: null, timestamp: m.timestamp?.toString() }));
        const currentJson = JSON.stringify(safeForStringify);

        if (currentJson !== lastEmittedJson) {
            callback(currentMessages);
            lastEmittedJson = currentJson;
        } else {
            // console.log("[ChatService] Snapshot fired but no relevant changes. Ignoring.");
        }

        // 3. Mark Read/Delivered (Debounced)
        if (currentUserId && updateReadStatus) {
            const serverDocs = snapshot.docs.filter(d =>
                !d.metadata.hasPendingWrites &&
                d.data().senderId !== currentUserId &&
                (!d.data().read || !d.data().delivered)
            );

            if (serverDocs.length > 0) {
                markMessagesAsRead(chatId, currentUserId, serverDocs);
                markMessagesAsDelivered(chatId, currentUserId, serverDocs);
            }
        }
    }, (error) => {
        listenerManager.handleListenerError(error, `Messages-${chatId}`);
    }, { includeMetadataChanges: true }); // Re-enabled for native optimism

    listenerManager.subscribe(listenerKey, unsubscribe);

    return () => {
        listenerManager.unsubscribe(listenerKey);
    };
};

/**
 * Load older messages for pagination (Cursor-Based)
 */
export const loadOlderMessages = async (chatId, lastDoc, limitCount = 50) => {
    if (!chatId || !lastDoc) return [];

    try {
        const q = query(
            collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION),
            orderBy("timestamp", "desc"), // DESC for older
            startAfter(lastDoc),
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            status: doc.data().read ? 'read' : (doc.data().delivered ? 'delivered' : 'sent'),
            _doc: doc // Keep ref for next cursor
        })).reverse(); // Reverse back to ASC for display
    } catch (error) {
        console.error("Error loading older messages:", error);
        return [];
    }
};

// --- Batched Write Helpers (Debounced) ---
let readBatchBuffer = new Map(); // chatId -> Set<doc>
let deliveredBatchBuffer = new Map(); // chatId -> Set<doc>
let readDebounceTimer = null;
let deliveredDebounceTimer = null;

const FLUSH_DELAY = 1500; // Increased speed
const BATCH_LIMIT = 20; // This constant is not used in the provided new code, keeping it for consistency if it was intended to be used.

const flushReadBatch = async () => {
    if (readBatchBuffer.size === 0) return;

    const batch = writeBatch(db);
    let opCount = 0;

    readBatchBuffer.forEach((docs) => {
        docs.forEach(d => {
            if (opCount < 450) { // Firestore batch limit is 500
                batch.update(d.ref, { read: true, delivered: true });
                opCount++;
            }
        });
    });

    readBatchBuffer.clear();
    readDebounceTimer = null;

    if (opCount > 0) {
        try {
            await batch.commit();
        } catch (error) {
            console.warn("Batch read update failed:", error);
        }
    }
};

const flushDeliveredBatch = async () => {
    if (deliveredBatchBuffer.size === 0) return;

    const batch = writeBatch(db);
    let opCount = 0;

    deliveredBatchBuffer.forEach((docs) => {
        docs.forEach(d => {
            if (opCount < 450) {
                batch.update(d.ref, { delivered: true });
                opCount++;
            }
        });
    });

    deliveredBatchBuffer.clear();
    deliveredDebounceTimer = null;

    if (opCount > 0) {
        try {
            await batch.commit();
        } catch (error) {
            console.warn("Batch delivery update failed:", error);
        }
    }
};

export const markMessagesAsRead = async (chatId, userId, messageDocs) => {
    if (!messageDocs || messageDocs.length === 0) return;

    const unreadMsgs = messageDocs.filter(d => !d.data().read && d.data().senderId !== userId);

    if (unreadMsgs.length === 0) return;

    if (!readBatchBuffer.has(chatId)) {
        readBatchBuffer.set(chatId, new Set());
    }
    unreadMsgs.forEach(d => {
        readBatchBuffer.get(chatId).add(d);
        lightningSync.updateStatusSignal(chatId, d.id, 'read');
    });

    // Instant Chat Metadata Update
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    updateDoc(chatRef, { [`unreadCount.${userId}`]: 0 }).catch(() => { });

    if (readDebounceTimer) clearTimeout(readDebounceTimer);
    readDebounceTimer = setTimeout(flushReadBatch, FLUSH_DELAY);
};

export const resetChatUnreadCount = async (chatId, userId) => {
    if (!chatId || !userId) return;
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    try {
        await updateDoc(chatRef, { [`unreadCount.${userId}`]: 0 });
    } catch (error) {
        // console.error("Failed to reset unread count:", error);
        // Ignore errors (e.g. permission or network) - it's a UI helper
    }
};

export const markMessagesAsDelivered = (chatId, userId, messageDocs) => {
    if (!messageDocs || messageDocs.length === 0) return;

    const undeliveredMsgs = messageDocs.filter(d =>
        !d.data().delivered &&
        d.data().senderId !== userId
    );

    if (undeliveredMsgs.length === 0) return;

    if (!deliveredBatchBuffer.has(chatId)) {
        deliveredBatchBuffer.set(chatId, new Set());
    }
    undeliveredMsgs.forEach(d => {
        deliveredBatchBuffer.get(chatId).add(d);
        lightningSync.updateStatusSignal(chatId, d.id, 'delivered');
    });

    if (deliveredDebounceTimer) clearTimeout(deliveredDebounceTimer);
    deliveredDebounceTimer = setTimeout(flushDeliveredBatch, FLUSH_DELAY);
};

// Rate Limiting
const checkRateLimit = () => {
    const RATE_LIMIT_WINDOW = 10000; // 10 seconds
    const MAX_MESSAGES_PER_WINDOW = 50;
    const RATE_LIMIT_KEY = 'whatsapp_clone_msg_limit';

    const now = Date.now();
    let timestamps = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
    timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

    if (timestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        throw new Error("Sending too fast. Please slow down.");
    }

    timestamps.push(now);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(timestamps));
};

const messageQueue = new PQueue({ concurrency: 1 });

/**
 * Sends a text message
 */
export const sendMessage = async (chatId, currentUser, text, replyTo = null, optimisticId = null, metadata = null) => {
    if (!chatId || !currentUser || !text) return;

    console.log(`[ChatService] Enqueueing message: ${text.substring(0, 10)}... to ${chatId}`);
    return messageQueue.add(() => sendMessageSequential(chatId, currentUser, text, replyTo, optimisticId, metadata));
};

async function sendMessageSequential(chatId, currentUser, text, replyTo, optimisticId, metadata) {
    console.log("[ChatService] Processing message in queue...", { chatId, optimisticId });
    try {
        const messagesRef = collection(db, "chats", chatId, "messages");
        const docRef = optimisticId ? doc(messagesRef, optimisticId) : doc(messagesRef);

        const messageData = {
            id: docRef.id,
            text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email, // Denormalize for performance
            senderPhoto: currentUser.photoURL || null,
            timestamp: serverTimestamp(),
            status: 'sent', // Initially sent
            type: 'text',
            read: false,
            delivered: false,
            replyTo: replyTo ? {
                id: replyTo.id,
                text: replyTo.text,
                senderName: replyTo.senderName
            } : null
        };

        if (optimisticId) {
            console.log("[ChatService] Writing optimistic document:", docRef.id);
            await setDoc(docRef, messageData);
        } else {
            console.log("[ChatService] Adding new document");
            await setDoc(docRef, messageData);
        }

        // 2. Update Last Message & Counters (Lazy Creation)
        const chatRef = doc(db, "chats", chatId);
        const updates = {
            lastMessage: {
                text,
                senderId: currentUser.uid,
                timestamp: new Date(), // Client-side estim for immediate sort
                read: false
            },
            lastMessageTimestamp: serverTimestamp(),
        };

        const otherUid = metadata?.participants?.find(p => p !== currentUser.uid);
        if (otherUid) {
            updates[`unreadCount.${otherUid}`] = increment(1);
            // REMOVED: Updating participants is restricted by Security Rules.
            // participants are set on creation. To support "undelete", we need Admin SDK or rule changes.
        }

        console.log("[ChatService] Updating chat metadata...");

        try {
            await updateDoc(chatRef, updates);
        } catch (updateError) {
            // Lazy Creation: If chat doesn't exist, create it now
            if (updateError.code === 'not-found') {
                console.log("[ChatService] Chat doc missing during update. Creating now...", chatId);

                if (otherUid) {
                    let otherUser = metadata?.participantInfo?.[otherUid]
                        ? { uid: otherUid, ...metadata.participantInfo[otherUid] }
                        : { uid: otherUid };

                    // Fetch user if missing info
                    if (!otherUser.displayName) {
                        const userSnap = await getDoc(doc(db, "users", otherUid));
                        if (userSnap.exists()) {
                            otherUser = { uid: otherUid, ...userSnap.data() };
                        } else {
                            otherUser.displayName = "User";
                        }
                    }

                    // Create the structure
                    await ensureChatExists(currentUser, otherUser);

                    // Retry the update
                    await updateDoc(chatRef, updates);
                }
            } else if (updateError.code === 'permission-denied') {
                console.warn("[ChatService] Metadata update blocked by rules. Message sent but chat list might not update.", updateError);
                // Swallow error to allow message to show as sent
            } else {
                console.error("[ChatService] Metadata update failed:", updateError);
                // Don't throw, just let the message succeed
            }
        }

        console.log("[ChatService] Message cycle complete.");
        return messageData.id;

    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
}

/**
 * Ensures a chat exists with complete participant metadata.
 * Self-healing: Updates metadata if missing.
 */
export const ensureChatExists = async (currentUser, otherUser) => {
    const combinedId = [currentUser.uid, otherUser.uid].sort().join('_');
    const chatRef = doc(db, CHATS_COLLECTION, combinedId);

    console.log(`[ChatService] ensureChatExists start. CID: ${combinedId}`);

    // Sanitize Inputs
    const currentData = {
        displayName: currentUser.displayName || "User",
        photoURL: currentUser.photoURL || null,
        email: currentUser.email || null
    };
    const otherData = {
        displayName: otherUser.displayName || "User",
        photoURL: otherUser.photoURL || null,
        email: otherUser.email || null
    };

    // 1. Try to update (Optimization: Optimistic repair)
    try {
        console.log("[ChatService] Attempting optimistic update...");
        await updateDoc(chatRef, {
            [`participantInfo.${otherUser.uid}`]: otherData,
            [`participantInfo.${currentUser.uid}`]: currentData,
            participants: [currentUser.uid, otherUser.uid] // Ensure participants array exists
        });
        console.log("[ChatService] Chat exists and updated.");
        return combinedId;
    } catch (error) {
        // 2. If not found, create it
        if (error.code === 'not-found') {
            console.log("[ChatService] Chat not found, creating new...");
            try {
                await setDoc(chatRef, {
                    participants: [currentUser.uid, otherUser.uid],
                    participantInfo: {
                        [currentUser.uid]: currentData,
                        [otherUser.uid]: otherData
                    },
                    lastMessage: null,
                    lastMessageTimestamp: serverTimestamp(),
                    type: 'private',
                    unreadCount: { [currentUser.uid]: 0, [otherUser.uid]: 0 },
                    mutedBy: {},
                    createdAt: serverTimestamp()
                });
                console.log("[ChatService] New chat created.");
                return combinedId;
            } catch (createError) {
                console.error("Failed to create chat:", createError);
                throw createError;
            }
        } else {
            console.error("ensureChatExists update failed:", error);
            throw error;
        }
    }
};



/**
 * Repairs a chat document by fetching latest user details.
 */
export const repairChatMetadata = async (chatId, currentUserId) => {
    try {
        const chatRef = doc(db, CHATS_COLLECTION, chatId);
        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) return;

        const data = chatSnap.data();
        if (data.type === 'group' || data.type === 'gemini') return;

        const otherUserId = data.participants?.find(uid => uid !== currentUserId);
        if (!otherUserId) return;

        // Fetch latest user details
        const userSnap = await getDoc(doc(db, "users", otherUserId));
        if (userSnap.exists()) {
            const userData = userSnap.data();
            await updateDoc(chatRef, {
                [`participantInfo.${otherUserId}`]: {
                    displayName: userData.displayName || "User",
                    photoURL: userData.photoURL || null,
                    email: userData.email || null // Added email for search
                }
            });
            console.log(`[ChatService] Repaired chat ${chatId} for user ${otherUserId}`);
        }
    } catch (e) {
        console.error("Chat repair failed:", e);
    }
};



export const sendMediaMessage = async (chatId, sender, fileData, replyTo = null) => {
    checkRateLimit();
    const type = fileData.fileType.startsWith('image/') ? 'image' :
        fileData.fileType.startsWith('video/') ? 'video' :
            fileData.fileType.startsWith('audio/') ? 'audio' : 'file';

    const messageData = {
        senderId: sender.uid,
        senderName: sender.displayName || sender.email,
        timestamp: serverTimestamp(),
        read: false,
        delivered: false,
        type,
        fileUrl: fileData.url,
        imageUrl: type === 'image' ? fileData.url : null,
        videoUrl: type === 'video' ? fileData.url : null,
        audioUrl: type === 'audio' ? fileData.url : null,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileType: fileData.fileType,
        text: type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File',
        textLower: (type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File').toLowerCase(),
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName } : null
    };

    try {
        const messagesRef = collection(db, "chats", chatId, "messages");
        const docRef = await addDoc(messagesRef, messageData);

        const updates = {
            lastMessage: { text: messageData.text, senderId: sender.uid, timestamp: new Date() },
            lastMessageTimestamp: serverTimestamp(),
        };

        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
            const participants = chatSnap.data().participants || [];
            participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = increment(1);
                }
            });
            updateDoc(chatRef, updates).catch(() => { });
        }
        return docRef.id;
    } catch (error) {
        console.error("Media send failed:", error);
        throw error;
    }
};

export const createGeminiChat = async (currentUserId) => {
    return initializeGeminiChatFn().then(r => r.data.chatId);
};

export const clearChat = async (chatId, userId) => clearChatHistoryFn({ chatId });

export const hideChat = async (chatId, userId) => deleteChatFn({ chatId });

export const deleteMessage = async (chatId, messageId, mode = 'me') => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    if (mode === 'everyone') {
        try {
            const msgSnap = await getDoc(msgRef);
            if (msgSnap.exists()) {
                const data = msgSnap.data();
                const url = data.fileUrl || data.imageUrl || data.videoUrl || data.audioUrl;
                if (url) {
                    try {
                        const fileRef = ref(storage, url);
                        await deleteObject(fileRef);
                    } catch (storageError) {
                        console.warn("Storage delete failed:", storageError);
                    }
                }
            }

            await updateDoc(msgRef, {
                isSoftDeleted: true,
                deletedAt: serverTimestamp(),
                text: "🚫 This message was deleted",
                fileUrl: deleteField(),
                imageUrl: deleteField(),
                videoUrl: deleteField(),
                audioUrl: deleteField(),
                type: 'deleted'
            });
        } catch (error) {
            console.error("Error deleting message:", error);
            throw error;
        }
    } else {
        await updateDoc(msgRef, {
            hiddenBy: arrayUnion(auth.currentUser.uid)
        });
    }
};

export const addReaction = async (chatId, messageId, emoji, userId) => {
    updateDoc(doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId), { [`reactions.${userId}`]: emoji });
};

export const removeReaction = async (chatId, messageId, userId) => {
    updateDoc(doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId), { [`reactions.${userId}`]: deleteField() });
};

export const toggleMuteChat = async (chatId, userId, currentMuteStatus) => {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    await updateDoc(chatRef, {
        [`mutedBy.${userId}`]: !currentMuteStatus
    });
};

export const searchMessages = async (chatId, queryText) => {
    if (!queryText) return [];
    try {
        const messagesRef = collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION);
        const q = query(
            messagesRef,
            where('textLower', '>=', queryText.toLowerCase()),
            where('textLower', '<=', queryText.toLowerCase() + '\uf8ff'),
            limit(MAX_RESULTS)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Search failed:", error);
        return [];
    }
};
