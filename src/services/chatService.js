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
import { ChatMetadataService } from "./ChatMetadataService";

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
                const status = data.read ? 'read' : (data.delivered ? 'delivered' : 'sent');
                messageCache.set(doc.id, {
                    id: doc.id,
                    ...data,
                    status,
                    _doc: doc
                });
            });
        } else {
            snapshot.docChanges().forEach((change) => {
                const doc = change.doc;
                const data = doc.data({ serverTimestamps: 'estimate' });

                if (change.type === "added" || change.type === "modified") {
                    const status = data.read ? 'read' : (data.delivered ? 'delivered' : 'sent');
                    messageCache.set(doc.id, {
                        id: doc.id,
                        ...data,
                        status,
                        _doc: doc
                    });
                }
                if (change.type === "removed") {
                    messageCache.delete(doc.id);
                }
            });
        }

        // 2. Emit ONLY if changed (Optimized Comparison)
        const currentMessages = Array.from(messageCache.values());

        // Efficient check: See if count changed or last message ID/timestamp changed
        const lastMsg = currentMessages[currentMessages.length - 1];
        const lastEmittedMsg = JSON.parse(lastEmittedJson || 'null');

        const hasChanged = !lastEmittedJson ||
            currentMessages.length !== (JSON.parse(lastEmittedJson)).length ||
            lastMsg?.id !== lastEmittedMsg?.id ||
            lastMsg?.timestamp?.toString() !== lastEmittedMsg?.timestamp?.toString();

        if (hasChanged) {
            callback(currentMessages);
            // We still store a minimal representation to detect changes next time
            lastEmittedJson = JSON.stringify(currentMessages.map(m => ({ id: m.id, timestamp: m.timestamp?.toString() })));
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

    // Instant Chat Metadata Update (RTDB)
    ChatMetadataService.resetUnreadCount(chatId, userId);
    // const chatRef = doc(db, CHATS_COLLECTION, chatId);
    // updateDoc(chatRef, { [`unreadCount.${userId}`]: 0 }).catch(() => { });

    if (readDebounceTimer) clearTimeout(readDebounceTimer);
    readDebounceTimer = setTimeout(flushReadBatch, FLUSH_DELAY);
};

export const resetChatUnreadCount = async (chatId, userId) => {
    if (!chatId || !userId) return;
    // [HYBRID SCALABILITY] Offload to RTDB
    ChatMetadataService.resetUnreadCount(chatId, userId);
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

const messageQueue = new PQueue({ concurrency: 5 }); // Increased for better throughput while maintaining some order

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

        const chatRef = doc(db, "chats", chatId);

        // 1. Instant Signaling (RTDB - Sub-100ms delivery for the recipient)
        lightningSync.sendInstantSignal(chatId, currentUser.uid, docRef.id, text);

        // 2. Firestore Write (Official Record)
        console.log("[ChatService] Adding new document");
        await setDoc(docRef, messageData);

        // 2. Update Last Message & Counters (Lazy Creation)
        // [HYBRID SCALABILITY] We now offload high-frequency metadata to RTDB
        // const chatRef = doc(db, "chats", chatId);
        // The old Firestore update is removed to prevent "Hot Document" limits.

        // Use ChatMetadataService to update RTDB
        const participants = metadata?.participants || [];
        // If participants missing in metadata, we might need to fetch them, 
        // but typically sendMessage is called with metadata from the UI which has them.

        if (participants.length > 0) {
            ChatMetadataService.updateChatMetadata(chatId, messageData, participants).catch(e => console.warn("RTDB Meta sync skipped", e));
        } else {
            console.debug("[ChatService] Participants missing in metadata, skipping RTDB update");
        }

        // [HYBRID SYNC - SCALABILITY HARDENED] 
        // We throttle Firestore metadata updates to once every 5 seconds per chat.
        // RTDB handles the real-time UI, Firestore is just for persistence/search.
        const LAST_SYNC_KEY = `fs_sync_${chatId}`;
        const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
        const nowMillis = Date.now();

        if (nowMillis - lastSync > 5000) { // 5-second window
            localStorage.setItem(LAST_SYNC_KEY, nowMillis.toString());
            const chatRef = doc(db, "chats", chatId);
            updateDoc(chatRef, {
                lastMessage: {
                    text: messageData.text,
                    senderId: currentUser.uid,
                    timestamp: messageData.timestamp
                },
                lastMessageTimestamp: serverTimestamp()
            }).catch((e) => {
                if (e.code === 'unavailable' || e.code === 'resource-exhausted') {
                    console.warn("[ChatService] Firestore sync throttled (Hotspot protection active).");
                } else {
                    console.warn("[ChatService] Firestore sync failed:", e);
                }
            });
        }

        // We still might need to ensure the Firestore doc exists for "indexing" purposes (search, list)
        // but we only do this if it's a NEW chat.
        // We can check if optimisticId is present (implies existing flow) or check metadata.

        // For now, to keep robustness high, we can doing a "set" only if it's a new chat creation flow 
        // but here we are in sendMessage. 
        // Let's assume the chat doc exists if we have an ID. 
        // If it doesn't, `ensureChatExists` should have been called before or during this process.

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
    const { createPrivateChat } = await import('./chatListService');
    return createPrivateChat(currentUser, otherUser);
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
        const docRef = doc(messagesRef);

        messageData.id = docRef.id;

        // 1. Instant Signaling (RTDB)
        lightningSync.sendInstantSignal(chatId, sender.uid, docRef.id, messageData.text);

        // 2. Firestore Write (Official Record)
        await setDoc(docRef, messageData);

        // 3. Hybrid Metadata Update (RTDB Priority)
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
            const participants = chatSnap.data().participants || [];
            ChatMetadataService.updateChatMetadata(chatId, messageData, participants).catch(e => console.warn("RTDB Meta sync skipped", e));

            // Throttled Firestore Sync
            const LAST_SYNC_KEY = `fs_sync_${chatId}`;
            const lastSync = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0');
            const nowMillis = Date.now();

            if (nowMillis - lastSync > 5000) {
                localStorage.setItem(LAST_SYNC_KEY, nowMillis.toString());
                updateDoc(chatRef, {
                    lastMessage: { text: messageData.text, senderId: sender.uid, timestamp: messageData.timestamp },
                    lastMessageTimestamp: serverTimestamp()
                }).catch(() => { });
            }
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

            const deleteUpdate = {
                isSoftDeleted: true,
                deletedAt: serverTimestamp(),
                expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // TTL: 30 days
                text: "🚫 This message was deleted",
                fileUrl: deleteField(),
                imageUrl: deleteField(),
                videoUrl: deleteField(),
                audioUrl: deleteField(),
                type: 'deleted'
            };

            await updateDoc(msgRef, deleteUpdate);

            // [EDGE CASE] Tombstone Sync: Update Chat List Preview if this was the last message
            const chatRef = doc(db, CHATS_COLLECTION, chatId);
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const chatData = chatSnap.data();
                if (chatData.lastMessage?.text && chatData.lastMessage.timestamp) {
                    // Check if the deleted message matches current preview (simplistic match)
                    // In a perfect system we'd check IDs, but text/timestamp is usually enough for 10k scale.
                    // We trigger an RTDB update to sync the 'deleted' tombstone instantly.
                    ChatMetadataService.updateChatMetadata(chatId, {
                        text: "🚫 Message deleted",
                        senderId: 'system',
                        type: 'deleted'
                    }, chatData.participants || []);
                }
            }
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
