const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

exports.onMessageCreated = onDocumentCreated("chats/{chatId}/messages/{messageId}", async (event) => {
    const message = event.data.data();
    const chatId = event.params.chatId;

    if (!message) return;

    // 1. Get Chat Data to find participants
    const chatDoc = await admin.firestore().collection('chats').doc(chatId).get();
    const chatData = chatDoc.data();

    // Check if chatData exists (chat might be deleted)
    if (!chatData || !chatData.participants) return;

    const senderId = message.senderId;
    const recipientIds = chatData.participants.filter(uid => uid !== senderId);

    if (recipientIds.length === 0) return;

    // 2. Get Sender Name (Optimized: Could be passed in message, but fetching is safer for consistency)
    const senderDoc = await admin.firestore().collection('users').doc(senderId).get();
    const senderName = senderDoc.data()?.displayName || "Someone";

    // 3. Batched User Fetch (Fixes N+1 Problem)
    // Firestore getAll requires individual arguments, so we verify length
    const userRefs = recipientIds.map(uid => admin.firestore().collection('users').doc(uid));

    // Safety check for massive groups: getAll supports varargs. 
    // If > 100 participants, we should ideally chunk, but for now we assume < 100 for University scope.
    const userDocs = await admin.firestore().getAll(...userRefs);

    const messagesToSend = [];

    userDocs.forEach(userDoc => {
        if (!userDoc.exists) return;

        const userData = userDoc.data();
        const tokens = userData.fcmTokens || [];
        const singleToken = userData.fcmToken; // Backward compatibility

        const allTokens = new Set([...tokens]);
        if (singleToken) allTokens.add(singleToken);

        if (allTokens.size > 0) {
            allTokens.forEach(token => {
                messagesToSend.push({
                    token: token,
                    notification: {
                        title: `New Message from ${senderName}`,
                        body: message.type === 'image' ? '📷 Photo' : message.text,
                    },
                    webpush: {
                        fcmOptions: {
                            link: `https://whatsappclone-50b5b.web.app/chat/${chatId}`
                        },
                        notification: {
                            icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
                            tag: `chat-${chatId}`
                        }
                    },
                    data: {
                        chatId: chatId,
                        senderId: senderId
                    }
                });
            });
        }
    });

    // 4. Send All Notifications (SCALABLE: sendEachForMulticast)
    // Batching logic: FCM supports up to 500 tokens per multicast message.
    if (messagesToSend.length > 0) {
        // Group tokens by 500
        const items = messagesToSend;
        const BATCH_SIZE = 500;

        const chunks = [];
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const chunk = items.slice(i, i + BATCH_SIZE);
            // sendEachForMulticast expects { tokens: [], notification: {}, data: {} }
            // But we constructed individual messages.
            // Optimization: We should group by content? 
            // In this simple loop, we built individual payloads. 
            // `sendEach` is better here than `sendEachForMulticast` if payloads differ (they don't, except token).

            // Refactoring to use sendEach (batch of individual messages)
            // limit is 500 per call.
            chunks.push(chunk);
        }

        await Promise.all(chunks.map(async (chunk) => {
            // admin.messaging().sendEach(chunk) -> expects array of messages
            try {
                await admin.messaging().sendEach(chunk);
            } catch (e) {
                console.error("FCM Batch Send Error:", e);
            }
        }));
    }

    // 5. AI Bot Integration (Server-Side)
    // Check if the bot is a participant and the sender is NOT the bot
    // We hardcode the ID or use env var. Ideally share constants, but for Functions we duplicate or use config.
    const GEMINI_BOT_ID = "gemini_bot_v1"; // MUST MATCH CLIENT-SIDE CONSTANT

    if (chatData.participants.includes(GEMINI_BOT_ID) && senderId !== GEMINI_BOT_ID) {
        // Only reply if it's a text message for now
        if (message.type === 'text' || !message.type) {
            await handleGeminiReply(chatId, message.text, senderName);
        }
    }
});

// Helper for Gemini API
async function handleGeminiReply(chatId, userText, senderName) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || functions.config().gemini?.key;
    const GEMINI_BOT_ID = "gemini-bot";

    if (!GEMINI_API_KEY) {
        console.warn("Skipping Gemini Reply: No API Key configured.");
        return;
    }

    const SYSTEM_INSTRUCTION = `You are the Gemini AI Assistant in a WhatsApp Clone app. 
- Keep your anwers concise and helpful.
- Format responses using Markdown.
- You are talking to ${senderName}.`;

    try {
        const contents = [
            {
                role: "user",
                parts: [{ text: SYSTEM_INSTRUCTION }]
            },
            {
                role: "user",
                parts: [{ text: userText }]
            }
        ];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents })
        });

        if (!response.ok) {
            throw new Error(`Gemini API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking...";

        // Write Response to Firestore
        const messagesRef = admin.firestore().collection('chats').doc(chatId).collection('messages');
        await messagesRef.add({
            text: aiResponseText,
            senderId: GEMINI_BOT_ID,
            senderName: "Gemini AI",
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            isGemini: true,
            type: 'text'
        });

        // Update Chat Last Message
        await admin.firestore().collection('chats').doc(chatId).update({
            lastMessage: {
                text: aiResponseText,
                senderId: GEMINI_BOT_ID,
                timestamp: new Date(),
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

    } catch (error) {
        console.error("Gemini Server-Side Error:", error);
    }
}


/**
 * Rate Limiter Helper
 * Checks if a user has exceeded the action limit.
 * @param {string} uid User ID
 * @param {string} action Action name (e.g., 'message', 'call')
 * @param {number} limit Max actions
 * @param {number} windowMs Time window in milliseconds
 */
async function checkRateLimit(uid, action, limit, windowMs) {
    const now = Date.now();
    const rateLimitRef = admin.firestore().collection('rate_limits').doc(`${uid}_${action}`);

    try {
        const doc = await rateLimitRef.get();
        let data = doc.data();

        if (!data || now - data.startTime > windowMs) {
            // Reset window
            data = { count: 1, startTime: now };
        } else {
            data.count++;
        }

        if (data.count > limit) {
            console.warn(`Rate limit exceeded for user ${uid} on action ${action}`);
            return false;
        }

        await rateLimitRef.set(data);
        return true;
    } catch (e) {
        console.error("Rate limit check failed:", e);
        return true; // Fail open to not block users on system error
    }
}

exports.onCallCreated = onDocumentCreated("calls/{callId}", async (event) => {
    const callData = event.data.data();
    if (!callData || callData.status !== 'ringing') return;

    // RATE LIMIT CHECK (1 call per 10 seconds)
    const isAllowed = await checkRateLimit(callData.callerId, 'call', 1, 10000);
    if (!isAllowed) {
        // Optionally cancel the call logic here or just log it
        console.log(`Call suppressed due to rate limiting: ${event.params.callId}`);
        return;
    }

    const callerName = callData.callerName;
    const receiverId = callData.receiverId;

    const userDoc = await admin.firestore().collection('users').doc(receiverId).get();
    const tokens = userDoc.data()?.fcmTokens || [];
    const singleToken = userDoc.data()?.fcmToken;

    const allTokens = [...tokens];
    if (singleToken && !allTokens.includes(singleToken)) {
        allTokens.push(singleToken);
    }

    if (allTokens.length > 0) {
        const sendPromises = allTokens.map(token => {
            const callPayload = {
                token: token,
                notification: {
                    title: 'Incoming Call',
                    body: `${callerName} is calling you...`,
                },
                webpush: {
                    fcmOptions: {
                        link: `https://whatsappclone-50b5b.web.app/`
                    },
                    notification: {
                        icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
                        tag: 'call',
                        renotify: true,
                        requireInteraction: true
                    }
                },
                data: {
                    type: 'call',
                    callId: event.params.callId,
                    callerName: callerName
                }
            };
            return admin.messaging().send(callPayload)
                .catch(error => console.error('Error sending call notification:', error));
        });
        return Promise.all(sendPromises);
    }
});
const { onValueUpdated } = require("firebase-functions/v2/database");

exports.onUserStatusChanged = onValueUpdated("/status/{uid}", async (event) => {
    const status = event.data.after.val();
    const uid = event.params.uid;

    if (!status) return;

    return admin.firestore().collection('users').doc(uid).update({
        isOnline: status.state === 'online',
        lastSeen: status.last_changed || admin.firestore.FieldValue.serverTimestamp()
    }).catch(error => {
        console.error(`Failed to sync presence for user ${uid}:`, error);
    });
});

const { onCall, HttpsError } = require("firebase-functions/v2/https");

exports.nukeUser = onCall(async (request) => {
    // 1. Security Check: Only Super Admin can Nuke
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new HttpsError('permission-denied', 'Only God can nuke users.');
    }

    const { targetUid } = request.data;
    if (!targetUid) {
        throw new HttpsError('invalid-argument', 'Target UID is required.');
    }

    console.log(`Starting NUKE sequence for user: ${targetUid}`);

    try {
        // 2. Delete Auth Account
        await admin.auth().deleteUser(targetUid);
        console.log(`Auth account deleted for ${targetUid}`);

        // 3. Delete Firestore User Profile
        await admin.firestore().collection('users').doc(targetUid).delete();
        console.log(`User profile deleted for ${targetUid}`);

        // 4. Delete All Messages Sent by User (Expensive Operation)
        // Note: This requires querying all chats or storing messages in a way that allows easy deletion.
        // Assuming messages are in subcollections of chats/{chatId}/messages

        // Strategy: Query ALL chats (might be slow for huge DBs, but okay for this scope)
        // Better Strategy: Usage of collectionGroup query if an index exists
        // db.collectionGroup('messages').where('senderId', '==', targetUid).get()

        const messagesSnapshot = await admin.firestore().collectionGroup('messages')
            .where('senderId', '==', targetUid)
            .get();

        const batchSize = 500;
        let batch = admin.firestore().batch();
        let count = 0;

        for (const doc of messagesSnapshot.docs) {
            batch.delete(doc.ref);
            count++;
            if (count >= batchSize) {
                await batch.commit();
                batch = admin.firestore().batch();
                count = 0;
            }
        }
        if (count > 0) {
            await batch.commit();
        }
        console.log(`Deleted ${messagesSnapshot.size} messages sent by ${targetUid}`);

        // 5. Delete Storage Files (Profile Pics, Media)
        // Warning: This requires listing files with prefix which is not directly supported by Admin SDK easily 
        // without knowing paths.
        // We assume a structure like: users/{uid}/... or chat-media/{chatId}/{uid}/...
        // For now, we will attempt to delete the user's profile folder if it exists.
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `users/${targetUid}/` });
        console.log(`Deleted storage files for ${targetUid}`);

        return { success: true, message: `Generational damage inflicted on ${targetUid}.` };

    } catch (error) {
        console.error("Nuke failed:", error);
        throw new HttpsError('internal', `Nuke failed: ${error.message}`);
    }
});
