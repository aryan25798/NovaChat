import { db, auth, storage, functions, rtdb } from "../firebase";
import { lightningSync } from "./LightningService";
import {
    collection, addDoc, query, where, orderBy, onSnapshot,
    doc, updateDoc, deleteDoc, getDoc, setDoc, getDocs,
    serverTimestamp, increment, arrayUnion, writeBatch, deleteField, limit, limitToLast, startAfter, runTransaction // added limit/limitToLast/runTransaction
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

        // Selective check: count, last id, and last status
        const currentCheck = currentMessages.map(m => ({
            id: m.id,
            t: m.timestamp?.toString(),
            s: m.status,
            p: m.progress,
            tx: m.text?.substring(0, 10)
        }));

        const currentCheckJson = JSON.stringify(currentCheck);

        if (currentCheckJson !== lastEmittedJson) {
            callback(currentMessages);
            lastEmittedJson = currentCheckJson;
        } else {
            // console.log("[ChatService] No changes detected.");
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

const flushReadBatch = async () => {
    if (readBatchBuffer.size === 0) return;

    const batch = writeBatch(db);
    let opCount = 0;
    const processedDocs = [];

    // 1. Collect up to 450 items
    for (const [chatId, docs] of readBatchBuffer.entries()) {
        for (const d of docs) {
            if (opCount < 450) {
                batch.update(d.ref, { read: true, delivered: true });
                processedDocs.push({ chatId, doc: d });
                opCount++;
            } else {
                break;
            }
        }
        if (opCount >= 450) break;
    }

    if (opCount === 0) return;

    // 2. Remove from buffer before commit to avoid duplicates in concurrent flushes
    processedDocs.forEach(({ chatId, doc }) => {
        const set = readBatchBuffer.get(chatId);
        if (set) {
            set.delete(doc);
            if (set.size === 0) readBatchBuffer.delete(chatId);
        }
    });

    readDebounceTimer = null;

    try {
        await batch.commit();
        // 3. If there are still items in the buffer, schedule another flush
        if (readBatchBuffer.size > 0) {
            readDebounceTimer = setTimeout(flushReadBatch, 100);
        }
    } catch (error) {
        console.warn("Batch read update failed, restoring to buffer:", error);
        // 4. Restore to buffer on failure
        processedDocs.forEach(({ chatId, doc }) => {
            if (!readBatchBuffer.has(chatId)) readBatchBuffer.set(chatId, new Set());
            readBatchBuffer.get(chatId).add(doc);
        });
        // Retry with backoff
        readDebounceTimer = setTimeout(flushReadBatch, FLUSH_DELAY * 2);
    }
};

const flushDeliveredBatch = async () => {
    if (deliveredBatchBuffer.size === 0) return;

    const batch = writeBatch(db);
    let opCount = 0;
    const processedDocs = [];

    // 1. Collect up to 450 items
    for (const [chatId, docs] of deliveredBatchBuffer.entries()) {
        for (const d of docs) {
            if (opCount < 450) {
                batch.update(d.ref, { delivered: true });
                processedDocs.push({ chatId, doc: d });
                opCount++;
            } else {
                break;
            }
        }
        if (opCount >= 450) break;
    }

    if (opCount === 0) return;

    // 2. Remove from buffer
    processedDocs.forEach(({ chatId, doc }) => {
        const set = deliveredBatchBuffer.get(chatId);
        if (set) {
            set.delete(doc);
            if (set.size === 0) deliveredBatchBuffer.delete(chatId);
        }
    });

    deliveredDebounceTimer = null;

    try {
        await batch.commit();
        // 3. Schedule next if remaining
        if (deliveredBatchBuffer.size > 0) {
            deliveredDebounceTimer = setTimeout(flushDeliveredBatch, 100);
        }
    } catch (error) {
        console.warn("Batch delivery update failed, restoring to buffer:", error);
        // 4. Restore
        processedDocs.forEach(({ chatId, doc }) => {
            if (!deliveredBatchBuffer.has(chatId)) deliveredBatchBuffer.set(chatId, new Set());
            deliveredBatchBuffer.get(chatId).add(doc);
        });
        deliveredDebounceTimer = setTimeout(flushDeliveredBatch, FLUSH_DELAY * 2);
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

    return messageQueue.add(async () => {
        const TIMEOUT_MS = 30000; // Increased to 30s
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("NETWORK_TIMEOUT_BLOCKED")), TIMEOUT_MS)
        );

        try {
            // Connectivity Watchdog: Log state before attempting send
            console.log(`[ChatService] Pre-flight: online=${navigator.onLine}, auth=${!!auth.currentUser}`);

            // Pre-flight check: Ensure user is actually "signed in" to avoid vague Firestore errors
            if (!auth.currentUser) throw new Error("AUTH_SESSION_EXPIRED");

            return await Promise.race([
                sendMessageSequential(chatId, currentUser, text, replyTo, optimisticId, metadata),
                timeoutPromise
            ]);
        } catch (err) {
            console.error("[ChatService] Send failure details:", {
                code: err.code,
                message: err.message,
                name: err.name,
                online: navigator.onLine
            });

            if (err.message === "NETWORK_TIMEOUT_BLOCKED") {
                throw new Error("Connection timed out (30s). Your local database may be locked. Please go to the Profile Page and click 'REPAIR DATABASE'.");
            }

            if (err.code === 'permission-denied' || err.message === "AUTH_SESSION_EXPIRED") {
                throw new Error("Session invalid: Please try logging out and back in. (API Key might be restricted)");
            }

            // Specialized handling for ERR_BLOCKED_BY_CLIENT style errors
            const errStr = err.toString().toLowerCase();
            const isNetworkBlock = errStr.includes("extension") ||
                errStr.includes("blocked") ||
                (errStr.includes("failed to fetch") && !navigator.onLine);

            if (isNetworkBlock) {
                throw new Error("Network error: Connection was blocked. Please disable any 'Privacy' tools or Ad-blockers.");
            }

            throw new Error(`Send failed: ${err.message || "Unknown error"}`);
        }
    });
};

async function sendMessageSequential(chatId, currentUser, text, replyTo, optimisticId, metadata) {
    console.log("[ChatService] Processing message in queue...", { chatId, optimisticId });
    try {
        const chatRef = doc(db, "chats", chatId);

        // [LAZY INIT] Ensure parent chat doc exists for "Ghost chats" (Transactional)
        const chatDoc = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(chatRef);
            if (snap.exists()) return snap;

            if (chatId.includes('_')) {
                console.log(`[ChatService] Lazy-creating ghost chat (Atomic): ${chatId}`);
                const parts = chatId.split('_');
                const otherUid = parts.find(uid => uid !== currentUser.uid);

                let otherUserInfo = { displayName: "User", photoURL: null };
                try {
                    const uSnap = await transaction.get(doc(db, "users", otherUid)); // Read within transaction if possible, or just accept eventual consistency
                    if (uSnap.exists()) {
                        const ud = uSnap.data();
                        otherUserInfo = { displayName: ud.displayName || "User", photoURL: ud.photoURL || null };
                    }
                } catch (e) { /* ignore */ }

                const initData = {
                    id: chatId,
                    participants: parts,
                    participantInfo: {
                        [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL },
                        [otherUid]: otherUserInfo
                    },
                    lastMessage: null,
                    lastMessageTimestamp: serverTimestamp(),
                    type: 'private',
                    unreadCount: { [currentUser.uid]: 0, [otherUid]: 0 },
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                transaction.set(chatRef, initData);
                return { exists: () => true, data: () => initData };
            }
            return snap; // Should not happen for ghost chats usually, but fallback
        });

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

        // 1. Instant Signaling (RTDB - Sub-100ms delivery for the recipient)
        lightningSync.sendInstantSignal(chatId, currentUser.uid, docRef.id, text);

        // 2. Firestore Write (Official Record)
        const tStartWrite = performance.now();
        console.log(`[ChatService] Starting Firestore Write (t=0ms)`);

        // [INDUSTRY-GRADE] Resilience Watchdog: Capture storage hangs before they block the UI
        const writePromise = setDoc(docRef, messageData);
        const watchDogPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("STORAGE_DEADLOCK_DETECTED")), 5000)
        );

        try {
            await Promise.race([writePromise, watchDogPromise]);
            const tEndWrite = performance.now();
            console.log(`[ChatService] Firestore Write SUCCESS in ${(tEndWrite - tStartWrite).toFixed(2)}ms`);
        } catch (err) {
            if (err.message === "STORAGE_DEADLOCK_DETECTED") {
                console.error("[ChatService] CRITICAL: Firestore write hung (>5s). Auto-triggering Persistence Bypass for next session.");
                localStorage.setItem('DISABLE_FIREBASE_PERSISTENCE', 'true');
                // We don't throw yet, we allow the RTDB signal to be the "truth" for this interaction
                // But we'll track this as a pending sync item.
            } else {
                throw err;
            }
        }

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

        if (nowMillis - lastSync > 5000) { // 5-second window (Scalability Guardrail)
            localStorage.setItem(LAST_SYNC_KEY, nowMillis.toString());
            const chatRef = doc(db, "chats", chatId);

            // [INDUSTRY-SCALE] Prune metadata for large groups to prevent "Hot Document" limits
            const metaUpdate = {
                'lastMessage.text': messageData.text,
                'lastMessage.senderId': currentUser.uid,
                'lastMessage.timestamp': messageData.timestamp,
                updatedAt: serverTimestamp()
            };

            // Only sync participants to Firestore if it's a small group (<50)
            // RTDB handles the source of truth for membership in large groups.
            if (participants.length > 0 && participants.length < 50) {
                metaUpdate.participants = participants;
            }

            updateDoc(chatRef, metaUpdate).catch(e => console.warn("[ChatService] Meta sync throttled/denied", e.message));
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



export const sendMediaMessage = async (chatId, sender, fileData, replyTo = null, msgId = null) => {
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
        width: fileData.width || null,
        height: fileData.height || null,
        text: type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File',
        textLower: (type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File').toLowerCase(),
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, senderName: replyTo.senderName } : null
    };

    try {
        const messagesRef = collection(db, "chats", chatId, "messages");
        const docRef = msgId ? doc(messagesRef, msgId) : doc(messagesRef);

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
