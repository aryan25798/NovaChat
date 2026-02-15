const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');

/**
 * 1. FAN-OUT TRIGGER: onStatusCreated
 * When a user posts a status, this trigger writes a lightweight "signal" 
 * to all their friends' feed collections.
 * 
 * Path: users/{friendId}/feed/status_signals (docId: authorId)
 */
exports.onStatusWritten = onDocumentWritten({
    document: "statuses/{userId}",
    maxInstances: 50,
    memory: "256MiB"
}, async (event) => {
    const db = admin.firestore();
    const userId = event.params.userId;
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    // If deleted, we might want to remove signals, but let's focus on updates/creates first.
    if (!newData) {
        // Status doc deleted -> Remove signals from friends? 
        // For strictly correct sync, yes. But let's keep it simple: 
        // The client will filter out missing docs anyway.
        return;
    }

    // Get the list of people allowed to see this status
    // In our `postStatus` service, we denormalized `allowedUIDs`. Use that!
    const allowedUIDs = newData.allowedUIDs || [];

    if (allowedUIDs.length === 0) return;

    // Check if there are actually new items compared to old
    const newItems = newData.items || [];
    const oldItems = oldData?.items || [];

    // Only fan-out if a NEW item was added or items changed meaningfully
    if (newItems.length === oldItems.length) {
        // Might be just a view count update or something minor.
        // We only care about CONTENT updates for the feed signal.
        return;
    }

    const latestItem = newItems[newItems.length - 1]; // Assuming append-only
    if (!latestItem) return;

    // Optimization: Cap fan-out to 2500 friends (Safe for Launch).
    // This allows popular users to reach a wide audience without timeouts.
    const MAX_FAN_OUT = 2500;
    const targets = allowedUIDs.slice(0, MAX_FAN_OUT);

    if (allowedUIDs.length > MAX_FAN_OUT) {
        logger.warn(`Status fan-out capped. User ${userId} has ${allowedUIDs.length} friends, reaching first ${MAX_FAN_OUT}.`);
    }

    logger.info(`Fanning out status update from ${userId} to ${targets.length} friends.`);

    const batchSize = 450;
    const chunks = [];
    for (let i = 0; i < targets.length; i += batchSize) {
        chunks.push(targets.slice(i, i + batchSize));
    }

    try {
        for (const chunk of chunks) {
            const batch = db.batch();
            chunk.forEach(friendId => {
                const feedRef = db.collection('users').doc(friendId).collection('feed').doc('status_signals');

                batch.set(feedRef, {
                    [userId]: {
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        userName: newData.userName || "Unknown",
                        userPhoto: newData.userPhoto || null,
                        count: newItems.length,
                        latestId: latestItem.id
                    }
                }, { merge: true });
            });
            await batch.commit();
        }
        logger.info(`Fan-out complete for ${targets.length} users.`);
    } catch (error) {
        logger.error("Fan-out failed", error);
    }
});

/**
 * 2. SYNC FUNCTION: syncStatusFeed
 * Client calls this on load to get the actual status data for friends who have updated.
 * 
 * Optimization: Client sends { [friendId]: lastKnownTimestamp }
 * Server returns full data only for those who have newer updates.
 */
exports.syncStatusFeed = onCall({
    memory: "512MiB",
    timeoutSeconds: 60
}, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const uid = request.auth.uid;
    const db = admin.firestore();

    logger.info(`[SyncStatus] Starting sync for user: ${uid}`);

    // Client sends the map of what they already have: { "friendA": 1234567890, "friendB": ... }
    const { knownState } = request.data || {};

    try {
        // 1. Read the user's Feed Signal Doc
        const feedRef = db.collection('users').doc(uid).collection('feed').doc('status_signals');
        const feedSnap = await feedRef.get();

        if (!feedSnap.exists) {
            logger.info(`[SyncStatus] No signals found for ${uid}`);
            return { updates: [] };
        }

        const signals = feedSnap.data() || {};
        const authorsToFetch = [];

        logger.info(`[SyncStatus] Found ${Object.keys(signals).length} signals. Checking for updates...`);

        // 2. Determine who needs fetching
        for (const [authorId, signal] of Object.entries(signals)) {
            if (!signal) continue;
            const signalTs = signal.timestamp?.toMillis ? signal.timestamp.toMillis() : 0;
            const clientTs = knownState?.[authorId] || 0;

            // If server has newer content than client
            if (signalTs > clientTs) {
                authorsToFetch.push(authorId);
            }
        }

        logger.info(`[SyncStatus] Authors to fetch: ${authorsToFetch.length}`);

        // 3. Fetch actual status docs for those authors
        if (authorsToFetch.length === 0) {
            return { updates: [] };
        }

        // Limit huge fetches
        const MAX_FETCH = 20;
        const fetchIds = authorsToFetch.slice(0, MAX_FETCH);

        const statusRefs = fetchIds.map(id => db.collection('statuses').doc(id));
        const statusDocs = await db.getAll(...statusRefs);

        const updates = [];
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        statusDocs.forEach(docSnap => {
            if (!docSnap.exists) return;
            const data = docSnap.data();
            if (!data) return;

            // Filter expired items server-side
            const activeItems = (data.items || []).filter(item => {
                if (!item) return false;
                const ts = item.timestamp?.toMillis ? item.timestamp.toMillis() : (item.timestamp instanceof Date ? item.timestamp.getTime() : 0);
                return now - ts < ONE_DAY;
            });

            if (activeItems.length > 0) {
                updates.push({
                    id: docSnap.id,
                    userId: data.userId,
                    userName: data.userName,
                    userPhoto: data.userPhoto,
                    items: activeItems,
                    lastUpdated: data.lastUpdated // Send this back so client can update their 'knownState'
                });
            }
        });

        logger.info(`[SyncStatus] Returning ${updates.length} updates for ${uid}`);
        return { updates, hasMore: authorsToFetch.length > MAX_FETCH };

    } catch (error) {
        logger.error(`[SyncStatus] Critical Error for ${uid}:`, error);
        throw new HttpsError('internal', error.message || 'Unknown internal error during sync');
    }
});
