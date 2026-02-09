import { db, storage, auth } from "../firebase";
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    onSnapshot,
    orderBy,
    doc,
    updateDoc,
    increment,
    writeBatch,
    where,
    getDoc,
    getDocs,
    deleteField,
    arrayUnion,
    setDoc,
    limitToLast
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { GEMINI_BOT_ID } from '../constants';

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

    // 1. Reset unread count on the chat document (only if not already 0)
    const chatRef = doc(db, CHATS_COLLECTION, chatId);

    // Optimization: Only update if we know there are unread messages
    const unreadMsgs = messageDocs.filter(d => {
        const data = d.data();
        return !data.read && data.senderId !== currentUserId && data.senderId !== GEMINI_BOT_ID;
    });

    if (unreadMsgs.length === 0) return;

    // Reset unread count for the user
    updateDoc(chatRef, {
        [`unreadCount.${currentUserId}`]: 0
    }).catch(err => console.error("Error resetting unread count:", err));

    // 2. Mark individual messages as read (batched)
    // Optimization: Limit to last 50 messages to prevent huge batch failures
    const msgsToUpdate = unreadMsgs.slice(-50);

    if (msgsToUpdate.length > 0) {
        const batch = writeBatch(db);
        msgsToUpdate.forEach(mDoc => {
            batch.update(mDoc.ref, { read: true });
        });
        try {
            await batch.commit();
        } catch (error) {
            console.error(`Error marking ${msgsToUpdate.length} messages as read:`, error);
        }
    }
};

/**
 * Sends a text message to a chat.
 */




export const markMessagesAsDelivered = async (chatId, currentUserId, messageDocs) => {
    const undeliveredMsgs = messageDocs.filter(d =>
        !d.data().delivered &&
        d.data().senderId !== currentUserId &&
        d.data().senderId !== GEMINI_BOT_ID
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

export const sendMessage = async (chatId, sender, text, replyTo = null) => {
    if (!text.trim()) return;

    // 🛡️ ANTI-SPAM PROTECTED
    checkRateLimit();

    const messageData = {
        text,
        senderId: sender.uid,
        senderName: sender.displayName || sender.email,
        timestamp: serverTimestamp(),
        read: false,
        delivered: false, // Initial state
        type: 'text',
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
        await updateDoc(chatRef, {
            lastMessage: {
                text,
                senderId: sender.uid,
                timestamp: new Date(),
            },
            timestamp: serverTimestamp(),
        });

        // AI INTERCEPT (Client-Side Restoration)
        if (typeof handleGeminiReply === 'function') {
            const chatSnap = await getDoc(chatRef);
            const chatData = chatSnap.data();
            if (chatData && chatData.participants.includes(GEMINI_BOT_ID) && sender.uid !== GEMINI_BOT_ID) {
                handleGeminiReply(chatId, text, sender.displayName || "User");
            }
        }

    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
    }
};

// Client-Side Gemini Handler (Restored for immediate fix)
const handleGeminiReply = async (chatId, userText, senderName) => {
    // ⚠️ WARNING: API Key exposed in client. 
    // Ideally use Firebase Functions, but restoring for functionality as requested.
    const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

    if (!API_KEY) {
        console.warn("Gemini API Key missing in VITE_GEMINI_API_KEY");
        return;
    }

    const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant in a WhatsApp Clone. 
    - Keep answers concise and helpful.
    - Format with Markdown.
    - You are talking to ${senderName}.`;

    try {
        const contents = [
            { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
            { role: "user", parts: [{ text: userText }] }
        ];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents })
        });

        if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);

        const data = await response.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking...";

        // Send AI Response
        const messagesRef = collection(db, "chats", chatId, "messages");
        await addDoc(messagesRef, {
            text: aiResponseText,
            senderId: GEMINI_BOT_ID,
            senderName: "Gemini AI",
            timestamp: serverTimestamp(),
            read: false,
            isGemini: true,
            type: 'text'
        });

        const chatRef = doc(db, "chats", chatId);
        await updateDoc(chatRef, {
            lastMessage: {
                text: aiResponseText,
                senderId: GEMINI_BOT_ID,
                timestamp: new Date(),
            },
            timestamp: serverTimestamp(),
        });

    } catch (error) {
        console.error("Gemini Client-Side Error:", error);
    }
};


export const createGeminiChat = async (currentUserId) => {
    // Check if chat already exists
    const q = query(
        collection(db, CHATS_COLLECTION),
        where("participants", "array-contains", currentUserId),
        where("type", "==", "private")
    );
    const snapshot = await getDocs(q);
    const existingChat = snapshot.docs.find(doc => {
        const data = doc.data();
        return data.participants.includes(GEMINI_BOT_ID) && data.participants.length === 2;
    });

    if (existingChat) {
        return existingChat.id;
    }

    // Create new chat
    const newChatData = {
        participants: [currentUserId, GEMINI_BOT_ID],
        participantInfo: {
            [currentUserId]: { role: 'user' },
            [GEMINI_BOT_ID]: {
                displayName: "Gemini AI",
                photoURL: "https://www.gstatic.com/lamda/images/favicon_v2_f8595537552554e2.svg",
                isGemini: true,
                bio: "Official AI Assistant"
            }
        },
        type: 'private',
        createdAt: serverTimestamp(),
        lastMessage: { text: "Hello! I am Gemini, your official AI assistant. How can I help you today?", senderId: GEMINI_BOT_ID, timestamp: new Date() },
        lastMessageTimestamp: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, CHATS_COLLECTION), newChatData);

    // Auto-friending Gemini (optional but makes it feel integrated)
    try {
        await updateDoc(doc(db, "users", currentUserId), {
            friends: arrayUnion(GEMINI_BOT_ID)
        });

        // Also ensure Gemini 'user' doc exists if it doesn't
        const geminiRef = doc(db, "users", GEMINI_BOT_ID);
        const geminiSnap = await getDoc(geminiRef);
        if (!geminiSnap.exists()) {
            await setDoc(geminiRef, {
                displayName: "Gemini AI",
                photoURL: "https://www.gstatic.com/lamda/images/favicon_v2_f8595537552554e2.svg",
                email: "gemini@assistant.ai",
                isGemini: true,
                // isAdmin: true, // REMOVED: Client cannot set admin. Backend script should set this if needed.
                bio: "Official AI Assistant"
            });
        }
    } catch (e) {
        console.warn("Auto-friending Gemini failed, but chat was created.");
    }

    return docRef.id;
};



/**
 * Initiates a resumable file upload.
 * @returns {object} { uploadTask, storageRef }
 */
export const uploadFileResumable = (file, chatId) => {
    const storageRef = ref(storage, `uploads/${chatId}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    return { uploadTask, storageRef };
};

/**
 * Sends a media message after upload completion.
 */
export const sendMediaMessage = async (chatId, sender, fileData) => {
    try {
        const { url, fileType, fileName, fileSize } = fileData;

        let mediaType = 'file';
        if (fileType.startsWith('image/')) mediaType = 'image';
        else if (fileType.startsWith('video/')) mediaType = 'video';
        else if (fileType.startsWith('audio/')) mediaType = 'audio';

        const messageData = {
            mediaUrl: url,
            mediaType,
            fileName: fileName,
            fileSize: fileSize,
            senderId: sender.uid,
            senderName: sender.displayName,
            timestamp: serverTimestamp(),
            type: mediaType,
            text: mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📄 File',
            read: false,
            delivered: false
        };

        await addDoc(collection(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION), messageData);

        await updateDoc(doc(db, CHATS_COLLECTION, chatId), {
            lastMessage: { text: messageData.text, senderId: sender.uid },
            lastMessageTimestamp: serverTimestamp()
        });

    } catch (error) {
        console.error("Error sending media message:", error);
        throw error;
    }
};

/**
 * Legacy wrapper for backward compatibility if needed, 
 * or can be removed if all calls are updated.
 */
export const sendFileMessage = async (chatId, sender, file) => {
    // This is now a wrapper around the new flow for simple one-shot uploads
    const { uploadTask } = uploadFileResumable(file, chatId);

    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            null,
            (error) => reject(error),
            async () => {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                await sendMediaMessage(chatId, sender, {
                    url,
                    fileType: file.type,
                    fileName: file.name,
                    fileSize: file.size
                });
                resolve();
            }
        );
    });
};

/**
 * Soft deletes all messages for a specific user in a chat.
 */
export const clearChat = async (chatId, userId) => {
    try {
        const chatRef = doc(db, CHATS_COLLECTION, chatId);
        await updateDoc(chatRef, {
            [`clearedBy.${userId}`]: serverTimestamp()
        });
    } catch (error) {
        console.error("Error clearing chat:", error);
        throw error;
    }
};


export const deleteMessage = async (chatId, messageId, deleteFor = 'everyone') => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    if (deleteFor === 'everyone') {
        await updateDoc(msgRef, {
            isSoftDeleted: true,
            // CRITICAL: WE DO NOT CLEAR TEXT OR MEDIA URL so God Mode can still see it.
            // The Frontend "Message.jsx" component is responsible for masking this data for normal users.
            deletedFor: 'everyone',
            deletedAt: serverTimestamp()
        });
    } else {
        // Delete for me only - add user ID to a 'deletedForUsers' array
        await updateDoc(msgRef, {
            deletedForUsers: arrayUnion(auth.currentUser.uid)
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

