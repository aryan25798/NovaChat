const admin = require('firebase-admin');
const { logger } = require("firebase-functions");

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
    let isAllowed = true;

    try {
        const result = await ref.transaction((currentData) => {
            if (!currentData || (now - currentData.startTime > windowMs)) {
                return { count: 1, startTime: now };
            }
            if (currentData.count >= limit) {
                isAllowed = false;
                return; // Abort transaction if over limit
            }
            currentData.count++;
            return currentData;
        });

        if (!result.committed && isAllowed) {
            // If it didn't commit but isAllowed is still true, it means it was a conflict.
            // In high-scale, we might want to retry, but for rate limiting, 
            // blocking if the transaction fails is safer.
            return false;
        }

        return isAllowed;
    } catch (e) {
        logger.error("Rate limit check failed", e);
        return false; // Fail closed — block action if rate limit check fails
    }
}

/**
 * Bulk delete documents by query.
 * @param {admin.firestore.Query} query 
 * @returns {Promise<number>} Number of deleted docs
 */
async function bulkDeleteByQuery(query) {
    const snapshot = await query.get();
    if (snapshot.empty) return 0;

    const BATCH_SIZE = 450;
    const docs = snapshot.docs;
    let totalDeleted = 0;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = admin.firestore().batch();
        const chunk = docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        totalDeleted += chunk.length;
    }
    return totalDeleted;
}

/**
 * Recursively delete a collection.
 * @param {admin.firestore.CollectionReference} collectionRef 
 */
async function recursiveDeleteCollection(collectionRef, batchSize = 400) {
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        const deleteQueryBatch = (query, resolve) => {
            query.get()
                .then((snapshot) => {
                    if (snapshot.size === 0) return 0;
                    const batch = admin.firestore().batch();
                    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
                    return batch.commit().then(() => snapshot.size);
                })
                .then((numDeleted) => {
                    if (numDeleted === 0) {
                        resolve();
                        return;
                    }
                    process.nextTick(() => deleteQueryBatch(query, resolve));
                })
                .catch(reject);
        };
        deleteQueryBatch(query, resolve);
    });
}

/**
 * Recursively delete storage files by prefix.
 * @param {admin.storage.Bucket} bucket 
 * @param {string} prefix 
 */
async function recursiveDeleteStorage(bucket, prefix) {
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return;

    // Storage delete doesn't have a batch API in the same way, but we can parallelize
    await Promise.all(files.map(file => file.delete().catch(() => { })));
}


/**
 * Logs an administrative action for security auditing.
 * @param {string} adminUid 
 * @param {string} action 
 * @param {object} details 
 */
async function logAuditAction(adminUid, action, details) {
    try {
        await admin.firestore().collection('audit_logs').add({
            adminUid,
            action,
            details,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        logger.error("Audit log failed", e);
    }
}


module.exports = {
    checkRateLimit,
    bulkDeleteByQuery,
    recursiveDeleteCollection,
    recursiveDeleteStorage,
    logAuditAction
};
