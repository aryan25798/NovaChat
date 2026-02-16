const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require('firebase-admin');
const { recursiveDeleteCollection, bulkDeleteByQuery } = require('../utils/shared');

/**
 * ADMIN: Global Presence Reset
 * Forcefully marks all users as offline. Scaled for large user bases.
 */
exports.adminResetAllPresence = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { logger } = require("firebase-functions");
    const admin = require('firebase-admin');

    const db = admin.firestore();
    try {
        const onlineLocations = await db.collection('user_locations').where('isOnline', '==', true).get();
        const onlineUsers = await db.collection('users').where('isOnline', '==', true).get();

        const writeOps = [];

        onlineLocations.docs.forEach(d => {
            writeOps.push({ ref: d.ref, data: { isOnline: false } });
        });
        onlineUsers.docs.forEach(d => {
            writeOps.push({ ref: d.ref, data: { isOnline: false } });
        });

        // Batching Helper for massive resets
        const BATCH_SIZE = 450;
        const chunkArray = (arr, size) => arr.length > size ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)] : [arr];
        const chunks = chunkArray(writeOps, BATCH_SIZE);

        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(op => batch.update(op.ref, op.data));
            await batch.commit();
        }

        logger.info(`Admin Reset: Forced offline for ${onlineLocations.size} locations and ${onlineUsers.size} users.`);
        return { success: true };
    } catch (error) {
        logger.error("Admin Reset Failed", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * CRON: Delete Expired Statuses
 * Runs every hour to cleanup statuses older than 24 hours.
 */
exports.deleteExpiredStatuses = onSchedule("every 1 hours", async (event) => {
    const { logger } = require("firebase-functions");

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() - 24);

    const expiredQuery = db.collection('statuses')
        .where('timestamp', '<', admin.firestore.Timestamp.fromDate(expiryDate));

    try {
        const snapshot = await expiredQuery.get();
        if (snapshot.empty) return;

        let deletedCount = 0;
        let storagePurged = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const userId = doc.id;

            // Purge storage assets for each status item
            if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                    if (item.mediaUrl) {
                        try {
                            const decodedPath = decodeURIComponent(item.mediaUrl.split('/o/')[1].split('?')[0]);
                            await bucket.file(decodedPath).delete();
                            storagePurged++;
                        } catch (e) { /* file may already be deleted */ }
                    }
                }
            }

            // Also purge by prefix as a safety net
            try {
                const [files] = await bucket.getFiles({ prefix: `status/${userId}/` });
                await Promise.all(files.map(f => f.delete().catch(() => { })));
                storagePurged += files.length;
            } catch (e) { /* ignore */ }

            await doc.ref.delete();
            deletedCount++;
        }

        if (deletedCount > 0) {
            logger.info(`Cleanup: Deleted ${deletedCount} expired statuses, purged ${storagePurged} storage assets.`);
        }
    } catch (error) {
        logger.error("Status cleanup failed", error);
    }
});

/**
 * ADMIN DEBUG: RESET APP
 * Wipes ALL data (Users, Chats, Messages, Friend Requests, Storage).
 * Preserves the caller's account (Admin).
 */
exports.debugResetApp = onCall(async (request) => {
    // 1. Security Check
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admins can perform a factory reset.');
    }

    const callerUid = request.auth.uid;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const rtdb = admin.database();

    logger.warn(`FACTORY RESET initiated by ${callerUid}`);

    try {
        // 2. Delete All Users (Except Caller)
        const usersSnap = await db.collection('users').get();
        const userDeletions = [];
        const authDeletions = [];

        usersSnap.docs.forEach(doc => {
            if (doc.id !== callerUid) {
                userDeletions.push(doc.ref.delete());
                // Queue Auth Deletion (best effort)
                authDeletions.push(admin.auth().deleteUser(doc.id).catch(() => { }));
                // Queue Location Deletion
                userDeletions.push(db.collection('user_locations').doc(doc.id).delete());
                userDeletions.push(db.collection('statuses').doc(doc.id).delete());
            }
        });

        await Promise.all(userDeletions);
        await Promise.all(authDeletions); // Delete from Auth

        // 3. Delete All Global Collections
        // We delete these entirely (including the Admin's chats, to be clean)
        const collections = ['chats', 'friend_requests', 'calls', 'notifications', 'announcements'];

        for (const col of collections) {
            const ref = db.collection(col);
            await recursiveDeleteCollection(ref, 500);
        }

        // 4. RTDB Cleanup
        await rtdb.ref('status').remove();
        await rtdb.ref('typing').remove();
        await rtdb.ref('rate_limits').remove();

        // 5. Storage Cleanup (Bucket Wipe)
        // We can't delete the root, so we delete common prefixes
        const prefixes = ['chats/', 'profiles/', 'status/'];
        for (const prefix of prefixes) {
            await bucket.deleteFiles({ prefix });
        }

        logger.info(`FACTORY RESET COMPLETE. Protected Admin: ${callerUid}`);
        return { success: true, message: "App has been factory reset." };

    } catch (error) {
        logger.error("Factory Reset Failed", error);
        throw new HttpsError('internal', error.message);
    }
});


