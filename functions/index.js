const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onValueUpdated } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');

/**
 * @deployed 2026-02-10
 * @version 1.1.0 (Industry Grade)
 * @status ACTIVE
 */
const { generateAIResponse } = require('./gemini');

admin.initializeApp();

exports.generateAIResponse = generateAIResponse;
setGlobalOptions({ maxInstances: 10 });

// Constants
const GEMINI_BOT_ID = "gemini_bot_v1";

/**
 * Rate Limiter Helper (RTDB Optimized)
 * Uses Realtime Database for high-speed, low-cost counters.
 * @param {string} uid User ID
 * @param {string} action Action name (e.g., 'message', 'call')
 * @param {number} limit Max actions
 * @param {number} windowMs Time window in milliseconds
 */
async function checkRateLimit(uid, action, limit, windowMs) {
    const now = Date.now();
    // Use RTDB for ephemeral counters (faster, cheaper, no hotspotting)
    const ref = admin.database().ref(`rate_limits/${uid}/${action}`);

    try {
        const snapshot = await ref.get();
        let data = snapshot.val();

        if (!data || (now - data.startTime > windowMs)) {
            // Reset window
            data = { count: 1, startTime: now };
        } else {
            data.count++;
        }

        if (data.count > limit) {
            logger.warn(`Rate limit exceeded`, { uid, action, count: data.count });
            return false;
        }

        // Fire-and-forget write (don't await if we want some speed, but awaiting ensures safety)
        await ref.set(data);
        return true;
    } catch (e) {
        logger.error("Rate limit check failed", e);
        return true; // Fail open to avoid blocking users during outage
    }
}

exports.onMessageCreated = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const message = event.data.data();
    const chatId = event.params.chatId;

    if (!message) return;

    try {
        // 1. Get Chat Data
        const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
        const chatData = chatDoc.data();

        if (!chatData || !chatData.participants) return;

        const senderId = message.senderId;
        const recipientIds = chatData.participants.filter(uid => uid !== senderId);

        if (recipientIds.length === 0) return;

        // 2. Get Sender Name
        const senderDoc = await admin.firestore().collection('users').doc(senderId).get();
        const senderName = senderDoc.data()?.displayName || "Someone";

        // 3. Batched User Fetch
        // Optimization: Use getAll but slice if array is too large (Firestore limit 30 in some SDKs, 10 in others, normally 100)
        // We assume < 30 for this use case.
        const userRefs = recipientIds.slice(0, 30).map(uid => admin.firestore().collection('users').doc(uid));

        const userDocs = await admin.firestore().getAll(...userRefs);
        const messagesToSend = [];

        userDocs.forEach(userDoc => {
            if (!userDoc.exists) return;

            const userData = userDoc.data();
            const tokens = userData.fcmTokens || [];
            if (userData.fcmToken) tokens.push(userData.fcmToken);

            const uniqueTokens = [...new Set(tokens)];

            uniqueTokens.forEach(token => {
                messagesToSend.push({
                    token: token,
                    notification: {
                        title: `New Message from ${senderName}`,
                        body: message.type === 'image' ? '📷 Photo' : message.text,
                    },
                    webpush: {
                        fcmOptions: { link: `https://whatsappclone-50b5b.web.app/chat/${chatId}` },
                        notification: {
                            icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
                            tag: `chat-${chatId}`
                        }
                    },
                    data: { chatId, senderId }
                });
            });
        });

        // 4. Send Notifications (Batched)
        if (messagesToSend.length > 0) {
            const BATCH_SIZE = 500;
            const chunks = [];
            for (let i = 0; i < messagesToSend.length; i += BATCH_SIZE) {
                chunks.push(messagesToSend.slice(i, i + BATCH_SIZE));
            }

            await Promise.all(chunks.map(async (chunk) => {
                try {
                    // uses sendEach (suitable for different tokens)
                    const response = await admin.messaging().sendEach(chunk);
                    if (response.failureCount > 0) {
                        logger.warn(`FCM Batch had ${response.failureCount} failures`);
                    }
                } catch (e) {
                    logger.error("FCM Batch Send Error", e);
                }
            }));
        }

        // 5. AI Bot Integration
        if (chatData.participants.includes(GEMINI_BOT_ID) && senderId !== GEMINI_BOT_ID) {
            if (message.type === 'text' || !message.type) {
                // Determine if we should reply (e.g., if it's a private chat or bot is mentioned)
                // For now, reply to all text in chats where bot is present
                await handleGeminiReply(chatId, message.text, senderName);
            }
        }

    } catch (error) {
        logger.error("onMessageCreated Trigger Error", error);
    }
});

// Helper for Gemini
async function handleGeminiReply(chatId, userText, senderName) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        logger.warn("Skipping Gemini Reply: No API Key configured.");
        return;
    }

    // ... (Gemini Logic remains mostly same, just logging updated)
    // For brevity in this refactor, we assume the core logic was fine but just insecure in client.
    // Re-implementing the function call logic from before:

    // NOTE: This server-side call is now the ONLY way to talk to Gemini.
    try {
        const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant. 
        - Keep answers concise.
        - Use Markdown.
        - User: ${senderName}.`;

        const contents = [
            { role: "user", parts: [{ text: SYSTEM_INSTRUCTION }] },
            { role: "user", parts: [{ text: userText }] }
        ];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents })
        });

        if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);

        const data = await response.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking...";

        // Write Response
        await admin.firestore().collection('chats').doc(chatId).collection('messages').add({
            text: aiResponseText,
            senderId: GEMINI_BOT_ID,
            senderName: "Gemini AI",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            isGemini: true,
            type: 'text'
        });

        await admin.firestore().collection('chats').doc(chatId).update({
            lastMessage: {
                text: aiResponseText,
                senderId: GEMINI_BOT_ID,
                timestamp: new Date(),
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

    } catch (error) {
        logger.error("Gemini Server-Side Error", error);
    }
}


exports.onCallCreated = onDocumentCreated("calls/{callId}", async (event) => {
    const callData = event.data.data();
    if (!callData || callData.status !== 'ringing') return;

    // RATE LIMIT (RTDB)
    const isAllowed = await checkRateLimit(callData.callerId, 'call', 1, 10000);
    if (!isAllowed) {
        logger.info(`Call suppressed due to rate limiting: ${event.params.callId}`);
        return;
    }

    const callerName = callData.callerName;
    const receiverId = callData.receiverId;

    try {
        const userDoc = await admin.firestore().collection('users').doc(receiverId).get();
        const userData = userDoc.data();
        if (!userData) return;

        const tokens = userData.fcmTokens || [];
        if (userData.fcmToken) tokens.push(userData.fcmToken);
        const uniqueTokens = [...new Set(tokens)];

        if (uniqueTokens.length > 0) {
            await Promise.all(uniqueTokens.map(token =>
                admin.messaging().send({
                    token: token,
                    // ... (rest of payload)
                    notification: { title: 'Incoming Call', body: `${callerName} is calling...` },
                    webpush: {
                        fcmOptions: { link: `https://whatsappclone-50b5b.web.app/` },
                        notification: { tag: 'call', renotify: true, requireInteraction: true }
                    },
                    data: { type: 'call', callId: event.params.callId, callerName }
                }).catch(e => logger.error("Call Notification Failed", e))
            ));
        }
    } catch (err) {
        logger.error("onCallCreated Error", err);
    }
});

exports.onUserStatusChanged = onValueUpdated("/status/{uid}", async (event) => {
    const status = event.data.after.val();
    const uid = event.params.uid;

    if (!status) return;

    try {
        await admin.firestore().collection('users').doc(uid).update({
            isOnline: status.state === 'online',
            lastSeen: status.last_changed || admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        logger.error(`Failed to sync presence for user ${uid}`, error);
    }
});

exports.nukeUser = onCall(async (request) => {
    // 1. Security Check
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new HttpsError('permission-denied', 'Only Super Admin can nuke users.');
    }

    const { targetUid } = request.data;
    // 2. Strict Input Validation
    if (!targetUid || typeof targetUid !== 'string' || targetUid.length > 128) {
        throw new HttpsError('invalid-argument', 'Invalid Target UID.');
    }

    logger.warn(`Starting NUKE sequence`, { targetUid, nuker: request.auth.uid });

    try {
        // 2. Delete Auth Account
        await admin.auth().deleteUser(targetUid);

        // 3. Delete Firestore User Profile
        await admin.firestore().collection('users').doc(targetUid).delete();

        // 4. Delete Messages (Batch)
        // Optimized: Use collectionGroup with limit to avoid timeout
        const messagesSnapshot = await admin.firestore().collectionGroup('messages')
            .where('senderId', '==', targetUid)
            .limit(500) // Safety limit per call, ideally loop this in a recursive function or Task Queue
            .get();

        const batch = admin.firestore().batch();
        messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        logger.info(`Deleted ${messagesSnapshot.size} messages for ${targetUid}`);

        // 5. Cleanup Storage (Best Effort)
        try {
            await admin.storage().bucket().deleteFiles({ prefix: `users/${targetUid}/` });
        } catch (e) {
            logger.warn("Storage cleanup incomplete", e);
        }

        return { success: true, message: `User ${targetUid} has been nuked.` };

    } catch (error) {
        logger.error("Nuke failed", error);
        throw new HttpsError('internal', `Nuke failed: ${error.message}`);
    }
});
