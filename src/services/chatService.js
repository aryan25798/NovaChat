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
export const subscribeToMessages = (chatId, currentUserId, callback, updateReadStatus = true, limitCount = 50) => {
    if (!chatId) return () => { };

    const listenerKey = `messages-${chatId}`;
    let messageCache = new Map();

    const q = query(
        collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION),
        orderBy("timestamp", "asc"),
        limitToLast(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        let hasChanges = false;

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
            hasChanges = true;
            // Immediate FIRST callback for snappiness
            callback(Array.from(messageCache.values()));
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
                    hasChanges = true;
                }
                if (change.type === "removed") {
                    messageCache.delete(doc.id);
                    hasChanges = true;
                }
            });
        }

        if (hasChanges || snapshot.docChanges().length === 0) {
            callback(Array.from(messageCache.values()));
        }

        if (currentUserId && updateReadStatus) {
            // Only update read/delivered status for SERVER messages that we haven't read yet
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

export const sendMessage = async (chatId, sender, text, replyTo = null, manualMessageId = null, metadata = {}) => {
    if (!text.trim()) return;
    checkRateLimit();

    try {
        let finalChatId = chatId;
        const isGeminiChat = metadata.type === 'gemini' || chatId === GEMINI_BOT_ID || chatId.startsWith('gemini_');

        const messagesRef = collection(db, "chats", finalChatId, "messages");
        const messageId = manualMessageId || doc(messagesRef).id;
        const messageRef = doc(db, "chats", finalChatId, "messages", messageId);
        const chatRef = doc(db, "chats", finalChatId);

        const messageData = {
            text,
            senderId: sender.uid,
            senderName: sender.displayName || sender.email,
            timestamp: serverTimestamp(),
            read: isGeminiChat,
            delivered: isGeminiChat,
            type: 'text',
            textLower: text.toLowerCase(),
            replyTo: replyTo ? {
                id: replyTo.id,
                text: replyTo.text,
                senderName: replyTo.senderName
            } : null
        };

        const batch = writeBatch(db);

        // 1. Create the message
        // Lightning Signal (Instant)
        lightningSync.sendInstantSignal(finalChatId, sender.uid, messageId, text);

        batch.set(messageRef, messageData);

        // 2. Update Chat Metadata (Atomic)
        const updates = {
            lastMessage: { text, senderId: sender.uid, timestamp: new Date() },
            lastMessageTimestamp: serverTimestamp(),
        };

        // If we have participants metadata, we can increment unread count atomically in the same batch
        if (metadata.participants) {
            metadata.participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = increment(1);
                }
            });
        }

        batch.update(chatRef, updates);

        // Commit the batch. This is robust and ensures all or nothing.
        // It resolves as soon as the local write is successful.
        await batch.commit();

        return messageId;

    } catch (error) {
        // If batch fails (e.g. chat doesn't exist yet), fallback to non-atomic for first message
        if (error.code === 'not-found' || error.message?.includes('No document to update')) {
            console.log("[ChatService] Chat doesn't exist, falling back to sequential create/send");
            // ... non-blocking background creation logic from before ...
            // (I'll keep the previous sequential logic as a fallback for first-time chats)
            return await sendMessageSequential(chatId, sender, text, replyTo, manualMessageId, metadata);
        }
        console.error("Error sending message:", error);
        throw error;
    }
};

const sendMessageSequential = async (chatId, sender, text, replyTo, manualMessageId, metadata) => {
    const isGeminiChat = metadata.type === 'gemini' || chatId === GEMINI_BOT_ID || chatId.startsWith('gemini_');
    const messageData = {
        text,
        senderId: sender.uid,
        senderName: sender.displayName || sender.email,
        timestamp: serverTimestamp(),
        read: isGeminiChat,
        delivered: isGeminiChat,
        type: 'text',
        textLower: text.toLowerCase(),
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName } : null
    };

    const messagesRef = collection(db, "chats", chatId, "messages");
    const messageId = manualMessageId || doc(messagesRef).id;
    const messageRef = doc(db, "chats", chatId, "messages", messageId);

    // Initial message write (resolves instantly)
    await setDoc(messageRef, messageData);

    // Background chat creation/update
    (async () => {
        try {
            const chatRef = doc(db, "chats", chatId);
            let snap = await getDoc(chatRef);
            if (!snap.exists()) {
                // ... handle chat creation (same as previous implementation) ...
                if (isGeminiChat) {
                    const newChatData = {
                        id: chatId,
                        participants: [sender.uid, GEMINI_BOT_ID],
                        participantInfo: {
                            [sender.uid]: { displayName: sender.displayName, photoURL: sender.photoURL },
                            [GEMINI_BOT_ID]: { displayName: "Gemini AI", photoURL: GEMINI_LOGO_URL, isGemini: true }
                        },
                        type: 'gemini',
                        createdAt: serverTimestamp(),
                        lastMessage: null,
                        unreadCount: {},
                        mutedBy: {},
                        options: { isGeminiChat: true }
                    };
                    await setDoc(chatRef, newChatData);
                } else {
                    // Handle private chat creation... (simplified to avoid blocking)
                    const parts = chatId.split('_');
                    if (parts.length === 2) {
                        const otherUid = parts.find(uid => uid !== sender.uid);
                        const otherUserSnap = await getDoc(doc(db, "users", otherUid));
                        const otherUserData = otherUserSnap.exists() ? otherUserSnap.data() : { displayName: "User" };
                        const newChatData = {
                            id: chatId,
                            participants: [sender.uid, otherUid],
                            participantInfo: {
                                [sender.uid]: { displayName: sender.displayName, photoURL: sender.photoURL },
                                [otherUid]: { displayName: otherUserData.displayName || "User", photoURL: otherUserData.photoURL }
                            },
                            type: 'private',
                            createdAt: serverTimestamp(),
                            lastMessage: null,
                            unreadCount: {},
                            mutedBy: {}
                        };
                        await setDoc(chatRef, newChatData);
                    }
                }
                snap = await getDoc(chatRef); // Re-fetch after creation
            }

            if (snap.exists()) {
                const data = snap.data();
                const updates = {
                    lastMessage: { text, senderId: sender.uid, timestamp: new Date() },
                    lastMessageTimestamp: serverTimestamp(),
                };
                data.participants?.forEach(uid => {
                    if (uid !== sender.uid) updates[`unreadCount.${uid}`] = increment(1);
                });
                await updateDoc(chatRef, updates);
            }
        } catch (e) {
            console.warn("Background heavy sync failed:", e);
        }
    })();

    return messageId;
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
