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
        .where('lastUpdated', '<', admin.firestore.Timestamp.fromDate(expiryDate));

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
                const [legacyFiles] = await bucket.getFiles({ prefix: `status / ${userId}/` });
                const allFiles = [...files, ...legacyFiles];
                await Promise.all(allFiles.map(f => f.delete().catch(() => { })));
                storagePurged += allFiles.length;
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

// debugResetApp: REMOVED from production code for safety.
// If needed for development, recreate in a separate dev-only module.
