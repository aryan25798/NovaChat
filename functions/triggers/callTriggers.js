const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');
const { checkRateLimit } = require('../utils/shared');

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
