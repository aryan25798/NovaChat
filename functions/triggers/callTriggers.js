const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');
const { checkRateLimit } = require('../utils/shared');
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const axios = require('axios'); // Ensure axios is available or use fetch

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
                    notification: {
                        title: 'Incoming Call',
                        body: `${callerName} is calling...`,
                    },
                    webpush: {
                        fcmOptions: { link: `https://whatsappclone-50b5b.web.app/` },
                        notification: {
                            tag: 'call',
                            renotify: true,
                            requireInteraction: true,
                            icon: 'https://whatsappclone-50b5b.web.app/nova-icon.png',
                            vibrate: [500, 200, 500, 200, 500]
                        }
                    },
                    android: {
                        priority: 'high',
                        notification: {
                            sound: 'default',
                            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                        }
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default', // standard WA call sound usually platform default if not custom
                                priority: 10
                            }
                        }
                    },
                    data: { type: 'call', callId: event.params.callId, callerName }
                }).catch(e => logger.error("Call Notification Failed", e))
            ));
        }
    } catch (err) {
        logger.error("onCallCreated Error", err);
    }
});


// Cleanup when calls enter terminal state
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { recursiveDeleteCollection } = require('../utils/shared');

exports.cleanupCallSignaling = onDocumentUpdated("calls/{callId}", async (event) => {
    const after = event.data.after.data();
    const before = event.data.before.data();

    if (!after || !before) return;

    // Trigger cleanup when call transitions from active state to a terminal state
    const terminalStates = ['ended', 'rejected', 'missed', 'busy', 'failed'];
    if (terminalStates.includes(after.status) && !terminalStates.includes(before.status)) {
        logger.info(`Cleaning up signaling sub-collections for call ${event.params.callId}`);
        const db = admin.firestore();
        const callRef = db.collection('calls').doc(event.params.callId);

        // Purge ICE Candidates (Recursive delete)
        await Promise.all([
            recursiveDeleteCollection(callRef.collection('callerCandidates'), 100),
            recursiveDeleteCollection(callRef.collection('calleeCandidates'), 100)
        ]);
    }
});
