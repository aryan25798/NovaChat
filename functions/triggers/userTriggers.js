const { onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');
const { bulkDeleteByQuery, recursiveDeleteCollection, recursiveDeleteStorage, logAuditAction } = require('../utils/shared');

// Database reference shortcuts (initialized in main index.js, but need local require if modular)
// Best practice: admin is initialized once globally.

exports.onUserStatusChanged = onValueWritten("/status/{uid}", async (event) => {
    const status = event.data.after.val();
    const beforeStatus = event.data.before.val() || {};
    const uid = event.params.uid;

    if (!uid) return null;

    // Handle deletion or state change
    const isOnline = status ? status.state === 'online' : false;
    const wasOnline = beforeStatus.state === 'online';

    // GUARD: If status didn't change, we skip the Firestore update to prevent write churn.
    // The client handles its own local heartbeat/throttling. 
    // We only sync to Firestore when "Online/Offline" flips.
    if (isOnline === wasOnline && event.data.before.exists()) {
        // console.debug(`[Presence] Skipping Firestore sync for ${uid} (No state change)`);
        return null;
    }

    const db = admin.firestore();
    logger.info(`Presence Sync: ${uid} is now ${isOnline ? 'online' : 'offline'}`, { uid, isOnline });

    try {
        const batch = db.batch();

        // 1. Sync to users collection
        batch.update(db.collection('users').doc(uid), {
            isOnline,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Sync to user_locations for Marauder Map
        batch.set(db.collection('user_locations').doc(uid), {
            isOnline,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await batch.commit();
        return { success: true };
    } catch (err) {
        logger.error("Presence sync failed", err);
        return null;
    }
});

/**
 * AUTO-SYNC: Firestore Trigger for Admin Claims
 * Fires whenever a user document is created or updated.
 * Detects changes to isAdmin, superAdmin, or isBanned and syncs Custom Claims automatically.
 * This eliminates the need to manually call syncAdminClaims.
 */
exports.onAdminFieldsChanged = onDocumentWritten('users/{userId}', async (event) => {
    const userId = event.params.userId;
    const before = event.data.before?.data() || {};
    const after = event.data.after?.data();

    // Document was deleted — clear all claims
    if (!after) {
        try {
            await admin.auth().setCustomUserClaims(userId, {});
            logger.info('Cleared claims for deleted user', { userId });
        } catch (e) {
            // User may not exist in Auth anymore
            logger.warn('Could not clear claims (user may be deleted from Auth)', { userId });
        }
        return;
    }

    // Check if any admin-relevant field changed
    const fieldsToWatch = ['isAdmin', 'superAdmin', 'isBanned'];
    const changed = fieldsToWatch.some(f => before[f] !== after[f]);

    if (!changed) return; // No relevant change, skip

    // Build new claims object
    const claims = {};
    if (after.superAdmin === true) claims.superAdmin = true;
    if (after.isAdmin === true) claims.isAdmin = true;
    if (after.isBanned === true) claims.isBanned = true;

    try {
        await admin.auth().setCustomUserClaims(userId, claims);

        // SYNC TO MARAUDER MAP TELEMETRY
        // This ensures admins are filtered out immediately even if their local session hasn't refreshed.
        await admin.firestore().collection('user_locations').doc(userId).set({
            isAdmin: after.isAdmin || false,
            superAdmin: after.superAdmin || false
        }, { merge: true });

        logger.info('Auto-synced admin claims and map telemetry', { userId, claims });
    } catch (error) {
        logger.error('Failed to auto-sync claims', { userId, error: error.message });
    }
});

exports.banUser = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admin or Super Admin can ban users.');
    }

    const { targetUid, isBanned } = request.data;
    if (!targetUid) throw new HttpsError('invalid-argument', 'Target UID is required.');

    try {
        // 1. Update Firestore
        await admin.firestore().collection('users').doc(targetUid).update({ isBanned });

        // 2. Set Custom Claim
        const userRecord = await admin.auth().getUser(targetUid);
        const existingClaims = userRecord.customClaims || {};

        await admin.auth().setCustomUserClaims(targetUid, {
            ...existingClaims,
            isBanned
        });

        await logAuditAction(request.auth.uid, 'BAN_USER', { targetUid, isBanned });

        return { success: true, message: `User ${targetUid} ban status set to ${isBanned}` };
    } catch (error) {
        logger.error("Ban failed", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.nukeUser = onCall(async (request) => {
    // 1. Security Check
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admin or Super Admin can nuke users.');
    }

    const { targetUid } = request.data;
    // 2. Strict Input Validation
    if (!targetUid || typeof targetUid !== 'string' || targetUid.length > 128) {
        throw new HttpsError('invalid-argument', 'Invalid Target UID.');
    }

    logger.warn(`Starting NUKE sequence`, { targetUid, nuker: request.auth.uid });

    const db = admin.firestore();
    const rtdb = admin.database();

    try {
        // 1. Fetch User Data to get friend list before deletion
        const userDoc = await db.collection('users').doc(targetUid).get();
        const userData = userDoc.data() || {};
        const friendsList = userData.friends || [];

        // 2. Delete Auth Account
        try {
            await admin.auth().deleteUser(targetUid);
        } catch (authErr) {
            logger.warn('Auth deletion skipped (may not exist)', authErr.message);
        }

        // 3. Delete Firestore User Profile & Location
        await db.collection('users').doc(targetUid).delete();
        await db.collection('user_locations').doc(targetUid).delete();

        // 4. Remove from all other users' friend lists (chunked to avoid 500-op batch limit)
        if (friendsList.length > 0) {
            const BATCH_LIMIT = 450;
            for (let i = 0; i < friendsList.length; i += BATCH_LIMIT) {
                const chunk = friendsList.slice(i, i + BATCH_LIMIT);
                const batch = db.batch();
                chunk.forEach(friendId => {
                    const friendRef = db.collection('users').doc(friendId);
                    batch.update(friendRef, {
                        friends: admin.firestore.FieldValue.arrayRemove(targetUid)
                    });
                });
                await batch.commit();
            }
            logger.info(`Removed ${targetUid} from ${friendsList.length} friend lists`);
        }

        // 5. Cleanup Friend Requests (Both incoming and outgoing)
        const outgoingReqsQuery = db.collection('friend_requests').where('from', '==', targetUid);
        const incomingReqsQuery = db.collection('friend_requests').where('to', '==', targetUid);

        await bulkDeleteByQuery(outgoingReqsQuery);
        await bulkDeleteByQuery(incomingReqsQuery);

        // 6. Cleanup Calls (Both as caller and receiver)
        const callsAsCallerQuery = db.collection('calls').where('callerId', '==', targetUid);
        const callsAsReceiverQuery = db.collection('calls').where('receiverId', '==', targetUid);

        await bulkDeleteByQuery(callsAsCallerQuery);
        await bulkDeleteByQuery(callsAsReceiverQuery);

        // 7. DEEP CHAT CLEANUP & MESSAGE PURGE (CHUNKED)
        const chatsSnapshot = await db.collection('chats')
            .where('participants', 'array-contains', targetUid)
            .get();

        let totalMessagesPurged = 0;
        let totalStorageAssetsDeleted = 0;
        const bucket = admin.storage().bucket();

        for (const chatDoc of chatsSnapshot.docs) {
            const chatData = chatDoc.data();

            // 7a. PURGE ALL MESSAGES SENT BY THIS USER (CHUNKED STORAGE & DB PURGE)
            const userMessagesQuery = chatDoc.ref.collection('messages').where('senderId', '==', targetUid);
            const userMessagesSnap = await userMessagesQuery.get();

            if (!userMessagesSnap.empty) {
                // Scrub Linked Media First (can't batch delete storage files easily, so we loop)
                for (const m of userMessagesSnap.docs) {
                    const mediaUrl = m.data().fileUrl || m.data().imageUrl || m.data().videoUrl || m.data().audioUrl || m.data().mediaUrl;
                    if (mediaUrl) {
                        try {
                            const decodedPath = decodeURIComponent(mediaUrl.split('/o/')[1].split('?')[0]);
                            await bucket.file(decodedPath).delete();
                            totalStorageAssetsDeleted++;
                        } catch (e) { /* ignore already deleted */ }
                    }
                }
                // Chunked Database Deletion
                const deleted = await bulkDeleteByQuery(userMessagesQuery);
                totalMessagesPurged += deleted;
            }

            // 7b. SCRUB REACTIONS (CHUNKED)
            const reactedMessagesQuery = chatDoc.ref.collection('messages').where(`reactions.${targetUid}`, '!=', null);
            const reactedSnap = await reactedMessagesQuery.get();
            if (!reactedSnap.empty) {
                const reactBatch = db.batch();
                reactedSnap.docs.forEach(m => reactBatch.update(m.ref, { [`reactions.${targetUid}`]: admin.firestore.FieldValue.delete() }));
                await reactBatch.commit();
            }

            // 7c. Chat Level Management
            if (chatData.type === 'private' || !chatData.type) {
                // RECURSIVE DELETE ENTIRE PRIVATE CHAT
                await recursiveDeleteCollection(chatDoc.ref.collection('messages'));
                await chatDoc.ref.delete();
            } else if (chatData.type === 'group') {
                // REMOVE FROM GROUP
                await chatDoc.ref.update({
                    participants: admin.firestore.FieldValue.arrayRemove(targetUid),
                    [`participantInfo.${targetUid}`]: admin.firestore.FieldValue.delete(),
                    [`unreadCount.${targetUid}`]: admin.firestore.FieldValue.delete()
                });
            }
        }

        logger.info(`Nuclear Chain Deletion complete: ${totalMessagesPurged} msgs, ${totalStorageAssetsDeleted} assets.`);

        // 8. Delete user statuses (CHUNKED)
        await db.collection('statuses').doc(targetUid).delete();

        // 9. Cleanup Notifications (Both received and sent)
        const receivedNotificationsQuery = db.collection('notifications').where('toUserId', '==', targetUid);
        const sentNotificationsQuery = db.collection('notifications').where('fromUserId', '==', targetUid);
        await bulkDeleteByQuery(receivedNotificationsQuery);
        await bulkDeleteByQuery(sentNotificationsQuery);

        await rtdb.ref(`status/${targetUid}`).remove();
        await rtdb.ref(`typing/${targetUid}`).remove();
        await rtdb.ref(`rate_limits/${targetUid}`).remove();

        // 10. Storage Cleanup (Prefix-based)
        await recursiveDeleteStorage(bucket, `status/${targetUid}/`);
        await recursiveDeleteStorage(bucket, `profiles/${targetUid}`);

        await logAuditAction(request.auth.uid, 'NUKE_USER', { targetUid, totalMessagesPurged });

        return {
            success: true,
            message: `Nuclear Chain Deletion Complete. ${totalMessagesPurged} messages vaporized.`
        };

    } catch (error) {
        logger.error("Nuke failed at critical stage", error);
        throw new HttpsError('internal', `Nuke failed: ${error.message}`);
    }
});

exports.syncAdminClaims = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;

    try {
        const userDoc = await admin.firestore().collection('users').doc(uid).get();
        let userData = userDoc.data() || {};
        const userEmail = request.auth.token.email;

        // BOOTSTRAP: Auto-promote system admin if missing privs
        if (userEmail === 'admin@system.com' && (!userData.isAdmin || !userData.superAdmin)) {
            logger.info("Bootstrapping system admin account", { uid, email: userEmail });
            await admin.firestore().collection('users').doc(uid).set({
                isAdmin: true,
                superAdmin: true,
                isSystemUser: true
            }, { merge: true });

            // Re-fetch to confirm
            const freshSnap = await admin.firestore().collection('users').doc(uid).get();
            userData = freshSnap.data();
        }

        if (!userData) throw new HttpsError('not-found', 'User profile missing.');

        const claims = {};
        let updated = false;

        if (userData.superAdmin === true) {
            claims.superAdmin = true;
            updated = true;
        }
        if (userData.isAdmin === true) {
            claims.isAdmin = true;
            updated = true;
        }
        if (userData.isBanned === true) {
            claims.isBanned = true;
            updated = true;
        }


        if (updated) {
            await admin.auth().setCustomUserClaims(uid, claims);
            logger.info("Admin claims synchronized", { uid, claims });
        }
        return { success: true };
    } catch (e) {
        logger.error("Sync claims failed", e);
        throw new HttpsError('internal', e.message);
    }
});

exports.deactivateAccount = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const uid = request.auth.uid;

    try {
        await admin.firestore().collection('users').doc(uid).update({
            deletionRequested: true,
            deletionRequestedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        logger.info(`User ${uid} requested account deletion.`);
        return { success: true };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});
