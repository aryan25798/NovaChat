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
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";

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
        const chatRef = doc(db, "chats", chatId);
        const chatSnap = await getDoc(chatRef);

        // GHOST CHAT AUTO-CREATION
        if (!chatSnap.exists()) {
            // If it's a private chat (UID_UID format), we know the participants
            const participants = chatId.split('_');
            if (participants.length === 2 && participants.includes(sender.uid)) {
                // Fetch other user info to denormalize
                const otherUid = participants.find(uid => uid !== sender.uid);
                const otherUserSnap = await getDoc(doc(db, "users", otherUid));
                const otherUserData = otherUserSnap.exists() ? otherUserSnap.data() : { displayName: "User" };

                await setDoc(chatRef, {
                    id: chatId,
                    participants,
                    participantInfo: {
                        [sender.uid]: { displayName: sender.displayName, photoURL: sender.photoURL },
                        [otherUid]: { displayName: otherUserData.displayName, photoURL: otherUserData.photoURL }
                    },
                    type: 'private',
                    createdAt: serverTimestamp(),
                    lastMessage: { text, senderId: sender.uid, timestamp: new Date() },
                    lastMessageTimestamp: serverTimestamp(),
                    unreadCount: {
                        [participants[0]]: participants[0] === sender.uid ? 0 : 1,
                        [participants[1]]: participants[1] === sender.uid ? 0 : 1
                    }
                });
            } else {
                throw new Error("Cannot send message to non-existent chat.");
            }
        }

        const messagesRef = collection(db, "chats", chatId, "messages");
        await addDoc(messagesRef, messageData);
        const chatData = chatSnap.data();

        const updates = {
            lastMessage: {
                text,
                senderId: sender.uid,
                timestamp: new Date(),
            },
            timestamp: serverTimestamp(),
        };

        // Increment unread count for other participants
        if (chatData && chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = increment(1);
                }
            });
        }

        await updateDoc(chatRef, updates);

        // 🤖 GEMINI AUTO-REPLY: Handled securely by Firebase Functions
        // See functions/index.js → onMessageCreated → handleGeminiReply

    } catch (error) {
        console.error("Error sending message:", error);
        throw error;
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
                photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
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
                photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
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

        const chatRef = doc(db, CHATS_COLLECTION, chatId);
        const chatSnap = await getDoc(chatRef);
        const chatData = chatSnap.data();

        const updates = {
            lastMessage: { text: messageData.text, senderId: sender.uid },
            lastMessageTimestamp: serverTimestamp()
        };

        if (chatData && chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== sender.uid) {
                    updates[`unreadCount.${uid}`] = increment(1);
                }
            });
        }

        await updateDoc(chatRef, updates);

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

/**
 * Hides a chat from the user's view.
 * Persists data for Admin auditing while removing it from the player's dashboard.
 */
export const hideChat = async (chatId, userId) => {
    try {
        const chatRef = doc(db, CHATS_COLLECTION, chatId);
        await updateDoc(chatRef, {
            hiddenBy: arrayUnion(userId)
        });
    } catch (error) {
        console.error("Error hiding chat:", error);
        throw error;
    }
};


export const deleteMessage = async (chatId, messageId, deleteFor = 'everyone') => {
    const msgRef = doc(db, CHATS_COLLECTION, chatId, MESSAGES_COLLECTION, messageId);
    if (deleteFor === 'everyone') {
        await updateDoc(msgRef, {
            isSoftDeleted: true,
            // SECURITY: We preserve 'text' and 'mediaUrl' for Admin/Spy Mode auditing.
            // The UI (Message.jsx) will mask these for normal users.
            deletedAt: serverTimestamp()
        });
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

