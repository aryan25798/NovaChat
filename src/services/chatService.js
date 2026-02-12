import { db, auth, storage } from "../firebase"; // Ensure storage is exported from firebase.js
import {
    collection, addDoc, query, where, orderBy, onSnapshot,
    doc, updateDoc, deleteDoc, getDoc, setDoc, getDocs,
    serverTimestamp, increment, arrayUnion, writeBatch, deleteField, limit, limitToLast, startAfter // added limit/limitToLast
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { listenerManager } from "../utils/ListenerManager";

import { GEMINI_BOT_ID } from '../constants';

// Official Gemini Logo
const GEMINI_LOGO_URL = "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png";

// Constants
export const CHATS_COLLECTION = "chats";
export const MESSAGES_COLLECTION = "messages";

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

    const q = query(
        collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION),
        orderBy("timestamp", "asc"),
        limitToLast(limitCount)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => {
            const data = doc.data({ serverTimestamps: 'estimate' });
            const source = doc.metadata.hasPendingWrites ? 'Local' : 'Server';
            return {
                id: doc.id,
                ...data,
                // Status Logic: Pending if local write, otherwise check delivered/read
                status: doc.metadata.hasPendingWrites ? 'pending' : (data.read ? 'read' : (data.delivered ? 'delivered' : 'sent')),
                _doc: doc // Expose doc snapshot for pagination cursor (hidden property)
            };
        });

        callback(messages);

        if (currentUserId) {
            // Only update read/delivered status for SERVER messages
            const serverDocs = snapshot.docs.filter(d => !d.metadata.hasPendingWrites);
            if (updateReadStatus) {
                markMessagesAsRead(chatId, currentUserId, serverDocs);
            }
            markMessagesAsDelivered(chatId, currentUserId, serverDocs);
        }
    }, (error) => {
        listenerManager.handleListenerError(error, `Messages-${chatId}`);
    }, { includeMetadataChanges: true }); // CRITICAL: Listen for local changes

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

/**
 * Marks unread messages as read for the current user.
 */
const markMessagesAsRead = async (chatId, currentUserId, messageDocs) => {
    if (!messageDocs || messageDocs.length === 0) return;

    // Identify messages to mark as read
    const unreadMsgs = messageDocs.filter(d => {
        const data = d.data();
        return !data.read && data.senderId !== currentUserId;
    });

    if (unreadMsgs.length === 0) return;

    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    const batch = writeBatch(db);

    // 1. Reset unread count for the current user
    batch.update(chatRef, {
        [`unreadCount.${currentUserId}`]: 0
    });

    // 2. Mark individual messages as read (limit to 100 for batch safety and performance)
    unreadMsgs.slice(-100).forEach(mDoc => {
        batch.update(mDoc.ref, { read: true });
    });

    try {
        await batch.commit();
    } catch (error) {
        // If it's just a permission issue (e.g. logging out), silenty fail
        if (error.code !== 'permission-denied') {
            console.warn("Atomic markRead batch failed:", error.code);
        }
    }
};

/**
 * Sends a text message to a chat.
 */




export const markMessagesAsDelivered = async (chatId, currentUserId, messageDocs) => {
    if (!messageDocs || messageDocs.length === 0) return;

    const undeliveredMsgs = messageDocs.filter(d =>
        !d.data().delivered &&
        d.data().senderId !== currentUserId
    );

    if (undeliveredMsgs.length > 0) {
        const batch = writeBatch(db);
        undeliveredMsgs.slice(-50).forEach(mDoc => {
            batch.update(mDoc.ref, { delivered: true });
        });
        try {
            await batch.commit();
        } catch (error) {
            console.error("Error marking messages as delivered:", error);
        }
    }
};

// Rate Limiting Helper
const checkRateLimit = () => {
    const RATE_LIMIT_WINDOW = 10000; // 10 seconds
    const MAX_MESSAGES_PER_WINDOW = 15; // Fairly generous for legitimate fast typers
    const RATE_LIMIT_KEY = 'whatsapp_clone_msg_limit';

    const now = Date.now();
    let timestamps = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
    // Filter old
    timestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

    if (timestamps.length >= MAX_MESSAGES_PER_WINDOW) {
        throw new Error("You are sending messages too fast. Please slow down.");
    }

    timestamps.push(now);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(timestamps));
};


export const sendMediaMessage = async (chatId, sender, fileData, replyTo = null) => {
    // 🛡️ ANTI-SPAM PROTECTED
    checkRateLimit();

    const type = fileData.fileType.startsWith('image/') ? 'image' :
        fileData.fileType.startsWith('video/') ? 'video' :
            fileData.fileType.startsWith('audio/') ? 'audio' : 'file';

    const isGeminiChat = chatId.startsWith('gemini_') || chatId.includes(GEMINI_BOT_ID);

    const messageData = {
        senderId: sender.uid,
        senderName: sender.displayName || sender.email,
        timestamp: serverTimestamp(),
        read: isGeminiChat,
        delivered: isGeminiChat,
        type: type,
        fileUrl: fileData.url, // Standard key
        imageUrl: type === 'image' ? fileData.url : null, // Legacy/Fallback key
        videoUrl: type === 'video' ? fileData.url : null, // Legacy/Fallback key
        audioUrl: type === 'audio' ? fileData.url : null, // Legacy/Fallback key
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        fileType: fileData.fileType,
        text: type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File',
        textLower: (type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '📎 File').toLowerCase(),
        replyTo: replyTo ? {
            id: replyTo.id,
            text: replyTo.text,
            senderName: replyTo.senderName
        } : null
    };

    try {
        const messagesRef = collection(db, "chats", chatId, "messages");
        await addDoc(messagesRef, messageData);

        const chatRef = doc(db, "chats", chatId);
        const updates = {
            lastMessage: {
                text: messageData.text,
                senderId: sender.uid,
                timestamp: new Date(),
            },
            lastMessageTimestamp: serverTimestamp(),
        };

        // Efficient Atomic Increments
        if (sender.uid) {
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const participants = chatSnap.data().participants || [];
                participants.forEach(uid => {
                    if (uid !== sender.uid) {
                        updates[`unreadCount.${uid}`] = increment(1);
                    }
                });
            }
        }

        await updateDoc(chatRef, updates);

    } catch (error) {
        console.error("Error sending media message:", error);
        throw error;
    }
};

export const sendMessage = async (chatId, sender, text, replyTo = null, chatType = 'private') => {
    if (!text.trim()) return;

    // 🛡️ ANTI-SPAM PROTECTED
    checkRateLimit();

    try {
        const chatRef = doc(db, "chats", chatId);
        let chatSnap = await getDoc(chatRef);

        // GHOST CHAT AUTO-CREATION logic
        if (!chatSnap.exists()) {
            const isGemini = chatId === GEMINI_BOT_ID || chatId.startsWith('gemini_');

            let newChatData;
            if (isGemini) {
                newChatData = {
                    id: chatId,
                    participants: [sender.uid, GEMINI_BOT_ID],
                    participantInfo: {
                        [sender.uid]: { displayName: sender.displayName, photoURL: sender.photoURL },
                        [GEMINI_BOT_ID]: { displayName: "Gemini AI", photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" }
                    },
                    type: 'gemini',
                    createdAt: serverTimestamp(),
                    lastMessage: null,
                    unreadCount: {},
                    mutedBy: {}
                };
            } else {
                const participants = chatId.split('_');
                if (participants.length === 2 && participants.includes(sender.uid)) {
                    const otherUid = participants.find(uid => uid !== sender.uid);
                    const otherUserSnap = await getDoc(doc(db, "users", otherUid));
                    const otherUserData = otherUserSnap.exists() ? otherUserSnap.data() : { displayName: "User" };

                    newChatData = {
                        id: chatId,
                        participants,
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
                }
            }

            if (newChatData) {
                await setDoc(chatRef, newChatData);
                chatSnap = await getDoc(chatRef);
            }
        }

        const isGeminiChat = chatId.includes(GEMINI_BOT_ID) || (chatSnap.exists() && chatSnap.data().type === 'gemini');

        const messageData = {
            text,
            senderId: sender.uid,
            senderName: sender.displayName || sender.email,
            timestamp: serverTimestamp(),
            read: isGeminiChat, // Auto-read for Gemini
            delivered: isGeminiChat, // Auto-deliver for Gemini
            type: 'text',
            textLower: text.toLowerCase(), // For Search
            replyTo: replyTo ? {
                id: replyTo.id,
                text: replyTo.text,
                senderName: replyTo.senderName
            } : null
        };

        const messagesRef = collection(db, "chats", chatId, "messages");
        await addDoc(messagesRef, messageData);

        // Update Chat Metadata
        const updates = {
            lastMessage: {
                text,
                senderId: sender.uid,
                timestamp: new Date(),
            },
            lastMessageTimestamp: serverTimestamp(),
        };

        if (chatSnap.exists()) {
            const chatData = chatSnap.data();
            (chatData.participants || []).forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = increment(1);
                }
            });
            await updateDoc(chatRef, updates);
        }

    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
};




import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

// ... existing imports ...

// Cloud Functions
const initializeGeminiChatFn = httpsCallable(functions, 'initializeGeminiChat');
const clearChatHistoryFn = httpsCallable(functions, 'clearChatHistory');
const deleteChatFn = httpsCallable(functions, 'deleteChat');

// ... existing code ...

export const createGeminiChat = async (currentUserId) => {
    try {
        const result = await initializeGeminiChatFn();
        return result.data.chatId;
    } catch (error) {
        console.error("Failed to initialize Gemini chat:", error);
        throw error;
    }
};

// ... existing code ...

/**
 * Soft deletes all messages for a specific user in a chat.
 */
export const clearChat = async (chatId, userId) => {
    try {
        await clearChatHistoryFn({ chatId });
    } catch (error) {
        console.error("Error clearing chat:", error);
        throw error;
    }
};

/**
 * Hides a chat from the user's view (Soft Delete).
 */
export const hideChat = async (chatId, userId) => {
    try {
        await deleteChatFn({ chatId });
    } catch (error) {
        console.error("Error deleting chat:", error);
        throw error;
    }
};


export const deleteMessage = async (chatId, messageId, deleteFor = 'everyone') => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    if (deleteFor === 'everyone') {
        try {
            const msgSnap = await getDoc(msgRef);
            if (msgSnap.exists()) {
                const data = msgSnap.data();
                // 🗑️ HARD DELETE: Remove file from Storage to prevent orphaned data
                const url = data.fileUrl || data.imageUrl || data.videoUrl || data.audioUrl;
                if (url) {
                    try {
                        const fileRef = ref(storage, url);
                        await deleteObject(fileRef);
                        console.log("File deleted from storage:", url);
                    } catch (storageError) {
                        console.warn("Failed to delete file from storage (might already be gone):", storageError);
                    }
                }
            }

            await updateDoc(msgRef, {
                isSoftDeleted: true,
                deletedAt: serverTimestamp(),
                // WIPE CONTENT for security/privacy
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
        // Soft Delete for current user only
        await updateDoc(msgRef, {
            hiddenBy: arrayUnion(auth.currentUser.uid)
        });
    }
};

export const addReaction = async (chatId, messageId, emoji, userId) => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    // We store reactions as a map: { "uid1": "👍", "uid2": "❤️" }
    // Firestore dot notation allows updating specific map fields
    await updateDoc(msgRef, {
        [`reactions.${userId}`]: emoji
    });
};

export const removeReaction = async (chatId, messageId, userId) => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    await updateDoc(msgRef, {
        [`reactions.${userId}`]: deleteField()
    });
};

export const toggleMuteChat = async (chatId, userId, currentMuteStatus) => {
    const chatRef = doc(db, CHATS_COLLECTION, chatId);
    await updateDoc(chatRef, {
        [`mutedBy.${userId}`]: !currentMuteStatus
    });
};

/**
 * Search messages on server (Prefix search)
 */
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

