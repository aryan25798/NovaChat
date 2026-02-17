const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');
const { recursiveDeleteCollection, bulkDeleteByQuery } = require('../utils/shared');

const GEMINI_BOT_ID = "gemini_bot_v1";

// Helper for Gemini
async function handleGeminiReply(chatId, userText, senderName) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Set via: firebase functions:secrets:set GEMINI_API_KEY

    // Need to initialize gemini properly or fetch key safely. 
    // In original code it was accessing process.env directly inside the function.
    if (!GEMINI_API_KEY) {
        logger.error("Skipping Gemini Reply: GEMINI_API_KEY is missing in environment variables.");
        return;
    }

    try {
        // Fetch last 10 messages for conversation context
        const messagesSnap = await admin.firestore()
            .collection('chats').doc(chatId)
            .collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();

        // 5. Build History with Strict Role Alternation (MANDATORY for Gemini API)
        const history = [];
        let lastRole = null;

        for (const doc of messagesSnap.docs) {
            const data = doc.data();
            const role = data.senderId === GEMINI_BOT_ID ? 'model' : 'user';

            // Gemini API Requirement: roles must strictly alternate user -> model -> user
            if (role === lastRole) {
                // If same role, append text to previous part instead of creating new block
                if (history.length > 0) {
                    const lastBlock = history[history.length - 1];
                    lastBlock.parts[0].text += `\n\n${data.text || ''}`;
                    continue;
                }
            }

            if (data.type === 'image' && data.fileUrl) {
                try {
                    const imgResp = await fetch(data.fileUrl);
                    if (imgResp.ok) {
                        const arrayBuffer = await imgResp.arrayBuffer();
                        const base64Image = Buffer.from(arrayBuffer).toString('base64');

                        history.push({
                            role: role,
                            parts: [
                                { text: data.text || "Image sent." },
                                {
                                    inlineData: {
                                        mimeType: data.fileType || "image/jpeg",
                                        data: base64Image
                                    }
                                }
                            ]
                        });
                        lastRole = role;
                        continue;
                    }
                } catch (e) {
                    logger.warn("Failed to fetch image for Gemini", e);
                }
            }

            history.push({
                role: role,
                parts: [{ text: data.text || '' }]
            });
            lastRole = role;
        }

        const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant in a WhatsApp Clone app called NovaCHAT.
        - You are using the **Gemini 2.5 Flash** model.
        - You can SEE images! If a user sends a photo, analyze it.
        - Keep your answers concise and helpful.
        - Use emojis.
        - Format responses using Markdown.
        - You are talking to ${senderName || 'Active User'}.`;

        // If the VERY last message in history is 'model', Gemini can't reply to itself.
        // We must ensure 'user' is always the last role sent to 'generateContent'.
        if (history.length > 0 && history[history.length - 1].role === 'model') {
            logger.info("Skipping reply: Last message was already from AI.");
            return;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: history,
                system_instruction: {
                    parts: [{ text: SYSTEM_INSTRUCTION }]
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API Error: ${response.statusText} - ${JSON.stringify(errData)}`);
        }

        const data = await response.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking...";

        // Write Response
        await admin.firestore().collection('chats').doc(chatId).collection('messages').add({
            text: aiResponseText,
            senderId: GEMINI_BOT_ID,
            senderName: "Gemini AI",
            senderPhoto: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            delivered: true,
            isGemini: true,
            type: 'text'
        });

        // Update Last Message & UNREAD COUNT
        // We need to increment unread count for the USER (who is not Gemini)
        const chatRef = admin.firestore().collection('chats').doc(chatId);
        const chatDoc = await chatRef.get();
        const chatData = chatDoc.data();

        const updates = {
            lastMessage: {
                text: aiResponseText,
                senderId: GEMINI_BOT_ID,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            },
            lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (chatData && chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== GEMINI_BOT_ID) {
                    updates[`unreadCount.${uid}`] = admin.firestore.FieldValue.increment(1);
                }
            });
        }

        await chatRef.update(updates);

        // --- RTDB METADATA SYNC (Lightning Speed) ---
        const metaPath = `chats/${chatId}/meta`;
        const rtdbUpdates = {};
        rtdbUpdates[`${metaPath}/lastMessage`] = {
            text: aiResponseText,
            senderId: GEMINI_BOT_ID,
            timestamp: admin.database.ServerValue.TIMESTAMP,
            type: 'text'
        };
        rtdbUpdates[`${metaPath}/lastUpdated`] = admin.database.ServerValue.TIMESTAMP;

        if (chatData && chatData.participants) {
            chatData.participants.forEach(uid => {
                if (uid !== GEMINI_BOT_ID) {
                    rtdbUpdates[`${metaPath}/unreadCount/${uid}`] = admin.database.ServerValue.increment(1);
                    rtdbUpdates[`user_chats/${uid}/${chatId}/lastUpdated`] = admin.database.ServerValue.TIMESTAMP;
                }
            });
        }
        await admin.database().ref().update(rtdbUpdates);

        logger.info(`Gemini replied and synced RTDB in chat ${chatId}`);

    } catch (error) {
        logger.error("Gemini Server-Side Error", error);
    }
}

exports.onMessageCreated = onDocumentCreated({
    document: "chats/{chatId}/messages/{messageId}",
    maxInstances: 100, // Scaled for 10k+ users
    memory: "256MiB",
    secrets: ["GEMINI_API_KEY"]
}, async (event) => {
    const messageData = event.data.data();
    const chatId = event.params.chatId;
    const senderId = messageData.senderId;

    logger.info("New message created", { chatId, senderId, messageType: messageData.type });

    if (!messageData) return;

    // --- AUTO-MODERATION (The Shield) ---
    // Professional Grade Filter List
    const BANNED_WORDS = [
        'scam', 'spam', 'fraud', 'phishing', 'hacker',
        'abuse', 'harass', 'violence', 'murder', 'death',
        'admin_override', 'system_root'
    ];
    let isFlagged = false;

    if (messageData.text && typeof messageData.text === 'string') {
        const lowerText = messageData.text.toLowerCase();
        if (BANNED_WORDS.some(word => lowerText.includes(word))) {
            isFlagged = true;
            logger.warn(`Auto-Mod Violation detected from ${senderId}`, { text: messageData.text });
        }
    }

    if (isFlagged) {
        // 1. Flag the message
        await event.data.ref.update({
            isFlagged: true,
            flagReason: 'Automated Keyword Match'
        });

        // 2. Strike the User (Increment Risk Score)
        await admin.firestore().collection('users').doc(senderId).update({
            riskScore: admin.firestore.FieldValue.increment(10), // +10 Risk Points
            reportsReceived: admin.firestore.FieldValue.increment(1)
        });
    }
    // ------------------------------------

    try {
        // 1. Get Chat Data
        const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
        const chatData = chatDoc.data();

        if (!chatData || !chatData.participants || chatData.participants.length === 0) return;

        const recipients = chatData.participants.filter(uid => uid !== senderId);

        if (recipients.length === 0) {
            // Check if AI Bot needs to reply even in 1:1 with Bot
            if (chatData.participants.includes(GEMINI_BOT_ID) && senderId !== GEMINI_BOT_ID) {
                if (messageData.type === 'text' || !messageData.type) {
                    await handleGeminiReply(chatId, messageData.text, "User");
                }
            }
            return;
        }

        logger.info("Processing delivery", { recipientCount: recipients.length, chatId, senderId });

        // 2. Get Sender Name
        const senderDoc = await admin.firestore().collection('users').doc(senderId).get();
        const senderName = senderDoc.data()?.displayName || "Someone";

        // 3. Batched User & Presence Fetch (Unlimited Chunks)
        const recipientChunks = [];
        const CHUNK_SIZE = 100; // Firestore 'in' query limit is 30 usually, getAll is higher but safe at 100
        for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
            recipientChunks.push(recipients.slice(i, i + CHUNK_SIZE));
        }

        const fetchPromises = recipientChunks.map(chunk => {
            const refs = chunk.map(uid => admin.firestore().collection('users').doc(uid));
            return admin.firestore().getAll(...refs);
        });

        const [userDocsResult, ...statusSnapshots] = await Promise.all([
            Promise.all(fetchPromises),
            // Fetch only the specific users' presence instead of the entire status node
            ...recipients.map(uid => admin.database().ref(`status/${uid}`).get())
        ]);

        const userDocs = userDocsResult.flat();
        const allStatuses = {};
        recipients.forEach((uid, i) => {
            if (statusSnapshots[i].exists()) {
                allStatuses[uid] = statusSnapshots[i].val();
            }
        });
        const messagesToSend = [];

        userDocs.forEach(userDoc => {
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const userId = userDoc.id;

            // WHATSAPP LOGIC: Suppress notification if recipient is IN the chat window
            const userActiveChatId = allStatuses[userId]?.activeChatId;
            if (userActiveChatId === chatId) {
                // logger.debug(`Notification suppressed: User ${userId} is in chat ${chatId}`);
                return;
            }

            const tokens = userData.fcmTokens || [];
            if (userData.fcmToken) tokens.push(userData.fcmToken);

            const uniqueTokens = [...new Set(tokens)];

            uniqueTokens.forEach(token => {
                messagesToSend.push({
                    token: token,
                    notification: {
                        title: `New Message from ${senderName}`,
                        body: messageData.type === 'image' ? '📷 Photo'
                            : messageData.type === 'video' ? '🎥 Video'
                                : messageData.type === 'audio' ? '🎵 Audio'
                                    : messageData.type === 'file' ? '📎 File'
                                        : (messageData.text || 'New message').length > 100
                                            ? (messageData.text || 'New message').substring(0, 97) + '...'
                                            : (messageData.text || 'New message'),
                    },
                    webpush: {
                        headers: {
                            Urgency: 'high'
                        },
                        fcmOptions: { link: `https://whatsappclone-50b5b.web.app/chat/${chatId}` },
                        notification: {
                            icon: 'https://whatsappclone-50b5b.web.app/nova-icon.png',
                            badge: 'https://whatsappclone-50b5b.web.app/nova-icon.png',
                            tag: `chat-${chatId}`,
                            renotify: true,
                            vibrate: [200, 100, 200]
                        }
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                        }
                    },
                    data: { chatId, senderId, type: 'message' }
                });
            });
        });

        // 4. Send Notifications (Batched)
        if (messagesToSend.length > 0) {
            const BATCH_SIZE = 500;
            for (let i = 0; i < messagesToSend.length; i += BATCH_SIZE) {
                const chunk = messagesToSend.slice(i, i + BATCH_SIZE);
                try {
                    const response = await admin.messaging().sendEach(chunk);
                    if (response.failureCount > 0) {
                        logger.warn(`FCM Batch had ${response.failureCount} failures`);
                    }
                } catch (e) {
                    logger.error("FCM Batch Send Error", e);
                }
            }
        }

        // 5. AI Bot Integration (Group Chats or mentions)
        if (chatData.participants.includes(GEMINI_BOT_ID) && senderId !== GEMINI_BOT_ID) {
            if (messageData.type === 'text' || !messageData.type) {
                await handleGeminiReply(chatId, messageData.text, senderName);
            }
        }

    } catch (error) {
        logger.error("onMessageCreated Trigger Error", error);
    }
});

// ============================================================
// CHAT MANAGEMENT — Industry-Grade Cloud Functions
// Handles secure chat creation, clearing, and deletion.
// ============================================================

/**
 * Initializes a chat with Gemini AI.
 * Ensures the Gemini bot user exists and is friends with the user.
 * Creates the chat if it doesn't exist.
 */
exports.initializeGeminiChat = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const uid = request.auth.uid;
    const db = admin.firestore();

    try {
        // 1. Ensure Gemini Bot User Exists
        const geminiRef = db.collection('users').doc(GEMINI_BOT_ID);
        const geminiSnap = await geminiRef.get();

        if (!geminiSnap.exists) {
            await geminiRef.set({
                displayName: "Gemini AI",
                photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
                email: "gemini@assistant.ai",
                isGemini: true,
                bio: "Official AI Assistant",
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            logger.info("Created Gemini Bot User");
        }

        // 2. Ensure Friendship (Auto-friend)
        const userRef = db.collection('users').doc(uid);
        await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            const userData = userDoc.data();
            const friends = userData.friends || [];

            if (!friends.includes(GEMINI_BOT_ID)) {
                t.update(userRef, { friends: admin.firestore.FieldValue.arrayUnion(GEMINI_BOT_ID) });
                t.update(geminiRef, { friends: admin.firestore.FieldValue.arrayUnion(uid) });
            }
        });

        // 3. Find or Create Chat
        const chatsRef = db.collection('chats');
        const q = chatsRef.where('participants', 'array-contains', uid).where('options.isGeminiChat', '==', true);
        const querySnapshot = await q.get();

        // Let's use deterministic ID: `gemini_${uid}`
        const chatId = `gemini_${uid}`;
        const chatRef = chatsRef.doc(chatId);
        const chatDoc = await chatRef.get();

        if (!chatDoc.exists) {
            const userSnap = await db.collection('users').doc(uid).get();
            const userData = userSnap.data();

            await chatRef.set({
                id: chatId,
                participants: [uid, GEMINI_BOT_ID],
                participantInfo: {
                    [uid]: { displayName: userData.displayName || 'User', photoURL: userData.photoURL || null },
                    [GEMINI_BOT_ID]: { displayName: "Gemini AI", photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png", isGemini: true }
                },
                type: 'private',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastMessage: {
                    text: "Hello! I am Gemini, your official AI assistant. How can I help you today?",
                    senderId: GEMINI_BOT_ID,
                    timestamp: new Date()
                },
                lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                unreadCount: { [uid]: 1, [GEMINI_BOT_ID]: 0 },
                options: { isGeminiChat: true }
            });

            // Send initial message
            await chatRef.collection('messages').add({
                text: "Hello! I am Gemini, your official AI assistant. How can I help you today?",
                senderId: GEMINI_BOT_ID,
                senderName: "Gemini AI",
                senderPhoto: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png",
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                delivered: true,
                isGemini: true,
                type: 'text'
            });

            logger.info(`Created Gemini chat for ${uid}`);
        } else {
            // If chat was hidden/deleted, unhide it
            await chatRef.update({
                hiddenBy: admin.firestore.FieldValue.arrayRemove(uid)
            });
        }

        return { success: true, chatId };

    } catch (error) {
        logger.error("Initialize Gemini Chat Failed", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Soft-clears chat history for the user.
 * Sets a 'clearedAt' timestamp. Messages before this are filtered on client.
 */
exports.clearChatHistory = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { chatId } = request.data;
    const uid = request.auth.uid;

    if (!chatId) throw new HttpsError('invalid-argument', 'Chat ID required');

    try {
        await admin.firestore().collection('chats').doc(chatId).update({
            [`clearedAt.${uid}`]: admin.firestore.FieldValue.serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        logger.error("Clear Chat Failed", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Soft-deletes a chat for the user.
 * Hides it from their list until a new message arrives.
 */
exports.deleteChat = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { chatId } = request.data;
    const uid = request.auth.uid;

    if (!chatId) throw new HttpsError('invalid-argument', 'Chat ID required');

    try {
        await admin.firestore().collection('chats').doc(chatId).update({
            hiddenBy: admin.firestore.FieldValue.arrayUnion(uid)
        });
        return { success: true };
    } catch (error) {
        logger.error("Delete Chat Failed", error);
        throw new HttpsError('internal', error.message);
    }
});

// --- ADMIN: Robust Chat Deletion (Spy Mode) ---
exports.adminDeleteChat = onCall(async (request) => {
    // 1. Security Check
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admins can perform this action.');
    }

    const { chatId } = request.data;
    if (!chatId) {
        throw new HttpsError('invalid-argument', 'Chat ID is required.');
    }

    const db = admin.firestore();
    const chatRef = db.collection('chats').doc(chatId);

    try {
        logger.info(`Admin ${request.auth.uid} initiating PERMANENT delete of chat ${chatId}`);

        // 3. Recursive Delete Messages Subcollection & Purge Storage
        const messagesRef = chatRef.collection('messages');
        const bucket = admin.storage().bucket();
        let totalStoragePurged = 0;

        // We fetch messages in batches to delete storage files before deleting the docs
        let lastDoc = null;
        while (true) {
            let q = messagesRef.orderBy('__name__').limit(200);
            if (lastDoc) q = q.startAfter(lastDoc);
            const snap = await q.get();
            if (snap.empty) break;

            for (const doc of snap.docs) {
                const data = doc.data();
                const mediaUrl = data.fileUrl || data.imageUrl || data.videoUrl || data.audioUrl || data.mediaUrl;
                if (mediaUrl) {
                    try {
                        const decodedPath = decodeURIComponent(mediaUrl.split('/o/')[1].split('?')[0]);
                        await bucket.file(decodedPath).delete();
                        totalStoragePurged++;
                    } catch (e) { /* ignore */ }
                }
            }
            lastDoc = snap.docs[snap.docs.length - 1];
            if (snap.size < 200) break;
        }

        await recursiveDeleteCollection(messagesRef, 400);

        // 4. Delete the Chat Document itself
        await chatRef.delete();

        // 5. Purge RTDB Metadata (Signals, Typing, Unreads)
        await admin.database().ref(`chats/${chatId}`).remove();

        logger.info(`Chat ${chatId} permanently deleted. ${totalStoragePurged} storage assets purged.`);
        return { success: true, message: `Chat erased. ${totalStoragePurged} assets purged.` };

    } catch (error) {
        logger.error(`Failed to delete chat ${chatId}`, error);
        throw new HttpsError('internal', "Failed to delete chat: " + error.message);
    }
});

/**
 * ADMIN: Hard Delete Single Message
 * Permanently erases a message and its linked storage asset.
 */
exports.adminHardDeleteMessage = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { chatId, messageId } = request.data;
    if (!chatId || !messageId) {
        throw new HttpsError('invalid-argument', 'Chat ID and Message ID are required.');
    }

    const db = admin.firestore();
    const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);

    try {
        const msgSnap = await msgRef.get();
        if (!msgSnap.exists) return { success: true, message: "Message already gone." };

        const data = msgSnap.data();
        const mediaUrl = data.fileUrl || data.imageUrl || data.videoUrl || data.audioUrl || data.mediaUrl;

        // 1. Purge Storage
        if (mediaUrl) {
            try {
                const bucket = admin.storage().bucket();
                const decodedPath = decodeURIComponent(mediaUrl.split('/o/')[1].split('?')[0]);
                await bucket.file(decodedPath).delete();
            } catch (e) {
                logger.warn("Storage delete failed in hardDelete", e.message);
            }
        }

        // 2. Delete Doc
        await msgRef.delete();

        logger.info(`Admin ${request.auth.uid} hard-deleted message ${messageId}`);
        return { success: true };
    } catch (error) {
        logger.error("Hard delete failed", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * SECURE AI AGENT HELPER
 * Handles direct Gemini API calls server-side to protect the API Key.
 * Supports: 'summarize', 'smartReply'
 */
exports.aiAgentHelper = onCall({
    secrets: ["GEMINI_API_KEY"]
}, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) throw new HttpsError('failed-precondition', 'AI Service not configured.');

    const { mode, data } = request.data;
    if (!['summarize', 'smartReply'].includes(mode)) {
        throw new HttpsError('invalid-argument', 'Invalid mode.');
    }

    try {
        let prompt;
        if (mode === 'summarize') {
            const { messages } = data;
            if (!messages || messages.length === 0) return { result: "No messages to summarize." };

            const transcript = messages.map(m => `${m.senderName}: ${m.text}`).join("\n");
            prompt = `Please provide a concise, bullet-pointed summary of the following chat transcript. Highlight the main topics discussed and any decisions made:\n\n${transcript}`;
        }
        else if (mode === 'smartReply') {
            const { messages } = data;
            if (!messages || messages.length === 0) return { result: [] };

            const lastMessages = messages.slice(-5).map(m => `${m.senderName}: ${m.text}`).join("\n");
            prompt = `Based on the following recent messages in a WhatsApp chat, suggest 3 very short, natural-sounding quick replies (e.g., "Sounds good!", "I'm on it", "See you then"). Return ONLY a JSON array of strings:\n\n${lastMessages}`;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API Error: ${response.statusText}`);
        }

        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

        if (mode === 'smartReply') {
            // Parse JSON for smart replies
            const jsonMatch = text.match(/\[.*\]/s);
            let replies = [];
            if (jsonMatch) {
                replies = JSON.parse(jsonMatch[0].trim());
            } else {
                const stripped = text.replace(/```json|```/g, "").trim();
                if (stripped.startsWith("[") && stripped.endsWith("]")) {
                    replies = JSON.parse(stripped);
                }
            }
            return { result: replies };
        }

        return { result: text };

    } catch (error) {
        logger.error(`AI Helper Failed (${mode})`, error);
        throw new HttpsError('internal', "AI Service Failed");
    }
});

/**
 * GROUP: Leave and Cleanup
 * Atomically removes a user from a group.
 * If the user is the last participant, RECURSIVELY DELETES the group and all messages server-side.
 */
exports.leaveGroup = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const { chatId } = request.data;
    const uid = request.auth.uid;

    if (!chatId) throw new HttpsError('invalid-argument', 'Chat ID required');

    const db = admin.firestore();
    const chatRef = db.collection('chats').doc(chatId);

    try {
        const result = await db.runTransaction(async (t) => {
            const chatDoc = await t.get(chatRef);
            if (!chatDoc.exists) throw new HttpsError('not-found', 'Chat not found');

            const chatData = chatDoc.data();
            const currentParticipants = chatData.participants || [];

            if (!currentParticipants.includes(uid)) {
                return { status: 'already_left', message: 'User not in group' };
            }

            const updatedParticipants = currentParticipants.filter(p => p !== uid);

            // CASE 1: GROUP IS EMPTY -> DELETE EVERYTHING
            if (updatedParticipants.length === 0) {
                // We cannot perform recursive delete inside a transaction easily (too slow).
                // So we return a flag to do it AFTER transaction.
                return { status: 'delete_group' };
            }

            // CASE 2: USER LEAVING -> UPDATE DOC
            const updatedRole = { ...chatData.chatRole };
            delete updatedRole[uid];

            // Reassign Admin if needed
            const remainingAdmins = Object.keys(updatedRole).filter(id => updatedRole[id] === 'admin');
            if (remainingAdmins.length === 0 && updatedParticipants.length > 0) {
                // Promote oldest member (simplification: first in array)
                updatedRole[updatedParticipants[0]] = 'admin';
            }

            const userDisplayName = chatData.participantInfo?.[uid]?.displayName || 'A user';

            t.update(chatRef, {
                participants: updatedParticipants,
                chatRole: updatedRole,
                [`participantInfo.${uid}`]: admin.firestore.FieldValue.delete(),
                [`unreadCount.${uid}`]: admin.firestore.FieldValue.delete(),
                lastMessage: {
                    text: `${userDisplayName} left the group`,
                    timestamp: new Date(),
                    type: 'system'
                },
                lastMessageTimestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { status: 'left' };
        });

        if (result.status === 'delete_group') {
            logger.info(`Group ${chatId} is empty. Initiating Recursive Delete.`);
            // 1. Delete Messages Subcollection
            await recursiveDeleteCollection(chatRef.collection('messages'), 500);
            // 2. Delete Chat Doc
            await chatRef.delete();
            // 3. Purge RTDB Metadata
            await admin.database().ref(`chats/${chatId}`).remove();
            return { success: true, action: 'deleted' };
        }

        return { success: true, action: 'left' };

    } catch (error) {
        logger.error(`Leave Group Failed for ${chatId}`, error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * TOMBSTONE SYNC: Handle Message Deletions
 * If the last message is deleted, update the chat preview to the legacy message.
 */
exports.onMessageDeleted = onDocumentDeleted({
    document: "chats/{chatId}/messages/{messageId}"
}, async (event) => {
    const chatId = event.params.chatId;
    const db = admin.firestore();
    const chatRef = db.collection('chats').doc(chatId);

    try {
        const chatSnap = await chatRef.get();
        if (!chatSnap.exists) return;

        const chatData = chatSnap.data();
        const lastMsgId = chatData.lastMessage?.id; // Assuming we store ID in lastMessage for easy comparison

        // If the deleted message was the last one, we need to find the new "last" message
        const messagesSnap = await chatRef.collection('messages')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (messagesSnap.empty) {
            // Chat is now empty
            await chatRef.update({
                lastMessage: admin.firestore.FieldValue.delete(),
                lastMessageTimestamp: admin.firestore.FieldValue.delete()
            });
            await admin.database().ref(`chats/${chatId}/meta`).remove();
            return;
        }

        const newLastMsg = messagesSnap.docs[0].data();
        const newLastMsgId = messagesSnap.docs[0].id;

        const updates = {
            lastMessage: {
                id: newLastMsgId,
                text: newLastMsg.text || (newLastMsg.type === 'image' ? '📷 Image' : '📎 Attachment'),
                senderId: newLastMsg.senderId,
                timestamp: newLastMsg.timestamp,
                type: newLastMsg.type || 'text'
            },
            lastMessageTimestamp: newLastMsg.timestamp
        };

        await chatRef.update(updates);

        // Sync to RTDB
        const rtdbUpdates = {};
        const metaPath = `chats/${chatId}/meta`;
        rtdbUpdates[`${metaPath}/lastMessage`] = {
            ...updates.lastMessage,
            timestamp: admin.database.ServerValue.TIMESTAMP // Use server time for ordering consistency
        };
        rtdbUpdates[`${metaPath}/lastUpdated`] = admin.database.ServerValue.TIMESTAMP;

        await admin.database().ref().update(rtdbUpdates);
        logger.info(`Tombstone Sync: Updated chat ${chatId} preview after deletion.`);

    } catch (error) {
        logger.error("Tombstone Sync Failed", error);
    }
});
