const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');
const { checkRateLimit } = require('../utils/shared');

// ============================================================
// FRIEND SYSTEM — Industry-Grade Cloud Functions
// All friend mutations go through server-side validation.
// ============================================================

/**
 * Send a friend request.
 * Validates: auth, rate limit, self-send, blocked, super admin, already friends, duplicate request.
 */
exports.sendFriendRequest = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { toUserId } = request.data;

    if (!toUserId || typeof toUserId !== 'string') {
        throw new HttpsError('invalid-argument', 'Target user ID is required.');
    }
    if (uid === toUserId) {
        throw new HttpsError('invalid-argument', 'You cannot send a friend request to yourself.');
    }

    // Rate limit: max 10 friend requests per 60 seconds
    const allowed = await checkRateLimit(uid, 'friend_request', 10, 60000);
    if (!allowed) {
        throw new HttpsError('resource-exhausted', 'Too many friend requests. Please slow down.');
    }

    const db = admin.firestore();

    // HARD SECURITY CAP: Max 2500 friends to prevent Firestore document bloat (1MB limit)
    // 2500 UIDs * 28 bytes = ~70KB. Perfectly safe.
    // We check this BEFORE the transaction to save costs.
    const currentUserDoc = await db.collection('users').doc(uid).get();
    const currentFriendCount = (currentUserDoc.data()?.friends || []).length;
    if (currentFriendCount >= 2500) {
        throw new HttpsError('resource-exhausted', 'Friend limit reached. You cannot have more than 2500 friends.');
    }

    // Validate users and check constraints inside a transaction
    await db.runTransaction(async (transaction) => {
        const fromRef = db.collection('users').doc(uid);
        const toRef = db.collection('users').doc(toUserId);

        const [fromSnap, toSnap] = await Promise.all([
            transaction.get(fromRef),
            transaction.get(toRef)
        ]);

        if (!fromSnap.exists) throw new HttpsError('not-found', 'Your profile was not found.');
        if (!toSnap.exists) throw new HttpsError('not-found', 'Target user does not exist.');

        const fromData = fromSnap.data();
        const toData = toSnap.data();

        // Check bans
        if (fromData.isBanned) throw new HttpsError('permission-denied', 'Your account is suspended.');
        if (toData.superAdmin) throw new HttpsError('permission-denied', 'Cannot send friend requests to system administrators.');

        // Check blocks (bidirectional)
        if ((toData.blockedUsers || []).includes(uid)) {
            throw new HttpsError('permission-denied', 'Cannot send friend request to this user.');
        }
        if ((fromData.blockedUsers || []).includes(toUserId)) {
            throw new HttpsError('permission-denied', 'You have blocked this user. Unblock first.');
        }

        // Check already friends
        if ((fromData.friends || []).includes(toUserId)) {
            throw new HttpsError('already-exists', 'You are already friends with this user.');
        }
    });

    // Check for duplicate pending requests (outside transaction — queries not supported in transactions)
    const q1 = db.collection('friend_requests')
        .where('from', '==', uid).where('to', '==', toUserId).where('status', '==', 'pending');
    const q2 = db.collection('friend_requests')
        .where('from', '==', toUserId).where('to', '==', uid).where('status', '==', 'pending');

    const [snap1, snap2] = await Promise.all([q1.get(), q2.get()]);

    if (!snap1.empty || !snap2.empty) {
        throw new HttpsError('already-exists', 'A friend request is already pending.');
    }

    // Get sender info for the request document
    const senderDoc = await db.collection('users').doc(uid).get();
    const senderData = senderDoc.data();

    // Create the request
    const requestRef = await db.collection('friend_requests').add({
        from: uid,
        to: toUserId,
        status: 'pending',
        fromName: senderData.displayName || 'User',
        fromPhoto: senderData.photoURL || null,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Send push notification to recipient
    try {
        const toUser = await db.collection('users').doc(toUserId).get();
        const toUserData = toUser.data();
        const tokens = [...new Set([...(toUserData.fcmTokens || []), toUserData.fcmToken].filter(Boolean))];

        if (tokens.length > 0) {
            await Promise.all(tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: {
                        title: 'New Friend Request',
                        body: `${senderData.displayName || 'Someone'} sent you a friend request`
                    },
                    webpush: {
                        notification: {
                            icon: senderData.photoURL || 'https://whatsappclone-50b5b.web.app/nova-icon.png',
                            tag: 'friend-request',
                            renotify: true
                        }
                    },
                    data: { type: 'friend_request', fromUserId: uid }
                }).catch(e => logger.debug('FCM send failed (non-critical)', e.message))
            ));
        }
    } catch (e) {
        logger.debug('Friend request notification failed (non-critical)', e.message);
    }

    logger.info('Friend request sent', { from: uid, to: toUserId, requestId: requestRef.id });
    return { success: true, requestId: requestRef.id };
});

/**
 * Accept a friend request.
 * Server-side: validates request exists, is pending, current user is recipient.
 * Uses batch write for atomicity.
 */
exports.acceptFriendRequest = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { requestId } = request.data;

    if (!requestId || typeof requestId !== 'string') {
        throw new HttpsError('invalid-argument', 'Request ID is required.');
    }

    const db = admin.firestore();
    const requestRef = db.collection('friend_requests').doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
        throw new HttpsError('not-found', 'This friend request no longer exists.');
    }

    const requestData = requestSnap.data();

    if (requestData.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'This request has already been processed.');
    }

    if (requestData.to !== uid) {
        throw new HttpsError('permission-denied', 'You are not authorized to accept this request.');
    }

    const fromUserId = requestData.from;

    // Atomic batch: add friends + delete request
    const batch = db.batch();

    const userRef = db.collection('users').doc(uid);
    const friendRef = db.collection('users').doc(fromUserId);

    batch.update(userRef, { friends: admin.firestore.FieldValue.arrayUnion(fromUserId) });
    batch.update(friendRef, { friends: admin.firestore.FieldValue.arrayUnion(uid) });
    batch.delete(requestRef);

    await batch.commit();

    // Notify the sender that their request was accepted
    try {
        const acceptorDoc = await db.collection('users').doc(uid).get();
        const acceptorName = acceptorDoc.data()?.displayName || 'Someone';

        const senderDoc = await db.collection('users').doc(fromUserId).get();
        const senderData = senderDoc.data();
        const tokens = [...new Set([...(senderData?.fcmTokens || []), senderData?.fcmToken].filter(Boolean))];

        if (tokens.length > 0) {
            await Promise.all(tokens.map(token =>
                admin.messaging().send({
                    token,
                    notification: {
                        title: 'Friend Request Accepted!',
                        body: `${acceptorName} accepted your friend request`
                    },
                    data: { type: 'friend_accepted', fromUserId: uid }
                }).catch(e => logger.debug('FCM send failed', e.message))
            ));
        }
    } catch (e) {
        logger.debug('Accept notification failed (non-critical)', e.message);
    }

    logger.info('Friend request accepted', { requestId, acceptedBy: uid, from: fromUserId });
    return { success: true };
});

/**
 * Reject a friend request.
 * Only the recipient can reject.
 */
exports.rejectFriendRequest = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { requestId } = request.data;

    if (!requestId) throw new HttpsError('invalid-argument', 'Request ID is required.');

    const db = admin.firestore();
    const requestRef = db.collection('friend_requests').doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
        throw new HttpsError('not-found', 'This friend request no longer exists.');
    }

    const requestData = requestSnap.data();

    // Only recipient or admin can reject
    if (requestData.to !== uid && !request.auth.token.isAdmin && !request.auth.token.superAdmin) {
        throw new HttpsError('permission-denied', 'You are not authorized to reject this request.');
    }

    await requestRef.delete();

    logger.info('Friend request rejected', { requestId, rejectedBy: uid });
    return { success: true };
});

/**
 * Cancel a friend request.
 * Only the sender can cancel their own request.
 */
exports.cancelFriendRequest = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { requestId } = request.data;

    if (!requestId) throw new HttpsError('invalid-argument', 'Request ID is required.');

    const db = admin.firestore();
    const requestRef = db.collection('friend_requests').doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
        throw new HttpsError('not-found', 'This friend request no longer exists.');
    }

    const requestData = requestSnap.data();

    // Only sender or admin can cancel
    if (requestData.from !== uid && !request.auth.token.isAdmin && !request.auth.token.superAdmin) {
        throw new HttpsError('permission-denied', 'You can only cancel your own requests.');
    }

    await requestRef.delete();

    logger.info('Friend request cancelled', { requestId, cancelledBy: uid });
    return { success: true };
});

/**
 * Remove a friend (unfriend).
 * Either user in the friendship can remove the other.
 * Uses batch write for atomicity.
 */
exports.removeFriend = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { friendId } = request.data;

    if (!friendId || typeof friendId !== 'string') {
        throw new HttpsError('invalid-argument', 'Friend user ID is required.');
    }
    if (uid === friendId) {
        throw new HttpsError('invalid-argument', 'Invalid friend ID.');
    }

    const db = admin.firestore();

    // Verify they are actually friends
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('not-found', 'Your profile was not found.');

    const userData = userDoc.data();
    if (!(userData.friends || []).includes(friendId)) {
        throw new HttpsError('failed-precondition', 'This user is not in your friends list.');
    }

    // Atomic removal from both friend lists
    const batch = db.batch();

    batch.update(db.collection('users').doc(uid), {
        friends: admin.firestore.FieldValue.arrayRemove(friendId)
    });
    batch.update(db.collection('users').doc(friendId), {
        friends: admin.firestore.FieldValue.arrayRemove(uid)
    });

    await batch.commit();

    logger.info('Friend removed', { removedBy: uid, friendId });
    return { success: true };
});
/**
 * Block a user.
 * Atomically: Adds to block list, removes friendship, and deletes pending requests.
 */
exports.blockUser = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { targetUserId } = request.data;

    if (!targetUserId || typeof targetUserId !== 'string') {
        throw new HttpsError('invalid-argument', 'Target user ID is required.');
    }
    if (uid === targetUserId) {
        throw new HttpsError('invalid-argument', 'You cannot block yourself.');
    }

    const db = admin.firestore();

    try {
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection('users').doc(uid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists) throw new HttpsError('not-found', 'User not found.');

            // 1. Add to blocked list
            transaction.update(userRef, {
                blockedUsers: admin.firestore.FieldValue.arrayUnion(targetUserId),
                // Also remove from friends list if they were friends
                friends: admin.firestore.FieldValue.arrayRemove(targetUserId)
            });

            // 2. Remove from the other person's friends list as well
            const targetRef = db.collection('users').doc(targetUserId);
            transaction.update(targetRef, {
                friends: admin.firestore.FieldValue.arrayRemove(uid)
            });
        });

        // 3. Cleanup any pending friend requests (Outside transaction for queries)
        const q1 = db.collection('friend_requests').where('from', '==', uid).where('to', '==', targetUserId);
        const q2 = db.collection('friend_requests').where('from', '==', targetUserId).where('to', '==', uid);

        const [s1, s2] = await Promise.all([q1.get(), q2.get()]);
        const batch = db.batch();
        s1.docs.forEach(doc => batch.delete(doc.ref));
        s2.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        logger.info('User blocked and relationships cleaned up', { uid, targetUserId });
        return { success: true };
    } catch (error) {
        logger.error("Block failed", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Unblock a user.
 */
exports.unblockUser = onCall(async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');

    const uid = request.auth.uid;
    const { targetUserId } = request.data;

    if (!targetUserId || typeof targetUserId !== 'string') {
        throw new HttpsError('invalid-argument', 'Target user ID is required.');
    }
    if (uid === targetUserId) {
        throw new HttpsError('invalid-argument', 'You cannot unblock yourself.');
    }

    const db = admin.firestore();
    await db.collection('users').doc(uid).update({
        blockedUsers: admin.firestore.FieldValue.arrayRemove(targetUserId)
    });

    logger.info('User unblocked', { uid, targetUserId });
    return { success: true };
});
