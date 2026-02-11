import { db, auth, storage } from "../firebase"; // Ensure storage is exported from firebase.js
import {
    collection, addDoc, query, where, orderBy, onSnapshot,
    doc, updateDoc, deleteDoc, getDoc, setDoc, getDocs,
    serverTimestamp, increment, arrayUnion, writeBatch, deleteField, limit, limitToLast // added limit/limitToLast
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

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

    const q = query(
        collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION),
        orderBy("timestamp", "asc"),
        limitToLast(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        callback(messages);

        if (currentUserId) {
            if (updateReadStatus) {
                markMessagesAsRead(chatId, currentUserId, snapshot.docs);
            }
            markMessagesAsDelivered(chatId, currentUserId, snapshot.docs);
        }
    }, (error) => {
        console.error("Error subscribing to messages:", error);
    });
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

    // Resetting count and marking messages as read should be ATOMIC to prevent sync issues.
    const batch = writeBatch(db);
    const chatRef = doc(db, CHATS_COLLECTION, chatId);

    // 1. Reset unread count on the chat document
    batch.update(chatRef, {
        [`unreadCount.${currentUserId}`]: 0
    });

    // 2. Mark individual messages as read (limit to 50 for batch safety)
    if (unreadMsgs.length > 0) {
        unreadMsgs.slice(-50).forEach(mDoc => {
            batch.update(mDoc.ref, { read: true });
        });
    }

    try {
        await batch.commit();
    } catch (error) {
        console.error("Atomic markRead batch failed:", error);
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
        undeliveredMsgs.forEach(mDoc => {
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
            timestamp: serverTimestamp(),
        };

        const chatSnap = await getDoc(chatRef);
        const chatData = chatSnap.data();

        // Increment unread count
        if (chatData && chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = (chatData.unreadCount?.[uid] || 0) + 1;
                }
            });
        }

        await updateDoc(chatRef, updates);

    } catch (error) {
        console.error("Error sending media message:", error);
        throw error;
    }
};

export const sendMessage = async (chatId, sender, text, replyTo = null) => {
    if (!text.trim()) return;

    // 🛡️ ANTI-SPAM PROTECTED
    checkRateLimit();

    try {
        const chatRef = doc(db, "chats", chatId);
        let chatSnap = await getDoc(chatRef);

        // GHOST CHAT AUTO-CREATION logic (moved up)
        if (!chatSnap.exists()) {
            // If it's a private chat (UID_UID format), we know the participants
            const participants = chatId.split('_');
            if (participants.length === 2 && participants.includes(sender.uid)) {
                const otherUid = participants.find(uid => uid !== sender.uid);
                const otherUserSnap = await getDoc(doc(db, "users", otherUid));
                const otherUserData = otherUserSnap.exists() ? otherUserSnap.data() : { displayName: "User" };

                const newChatData = {
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
                await setDoc(chatRef, newChatData);
                chatSnap = await getDoc(chatRef); // Refresh snap
            }
        }

        const isGeminiChat = chatId.includes(GEMINI_BOT_ID) || (chatSnap.exists() && chatSnap.data().participants?.includes(GEMINI_BOT_ID));

        const messageData = {
            text,
            senderId: sender.uid,
            senderName: sender.displayName || sender.email,
            timestamp: serverTimestamp(),
            read: isGeminiChat, // Auto-read for Gemini
            delivered: isGeminiChat, // Auto-deliver for Gemini
            type: 'text',
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
            timestamp: serverTimestamp(),
        };

        const chatData = chatSnap.exists() ? chatSnap.data() : {};
        if (chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = (chatData.unreadCount?.[uid] || 0) + 1;
                }
            });
        }
        await updateDoc(chatRef, updates);

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
            where("text", ">=", queryText),
            where("text", "<=", queryText + '\uf8ff'),
            limitToLast(20) // Note: limitToLast requires orderBy, but inequality filter requires orderBy on same field.
            // Firestore restriction: If you range filter on 'text', you must first order by 'text'.
        );
        // Correct query for prefix search:
        // We need an index on 'text'.
        const q2 = query(messagesRef, where('text', '>=', queryText), where('text', '<=', queryText + '\uf8ff'));

        const snapshot = await getDocs(q2);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Search failed:", error);
        return [];
    }
};

