const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');



// 1. Initialize Admin SDK globally
admin.initializeApp();

// 2. Set Global Options (Scale for 10k+ Users - Cost Optimized)
setGlobalOptions({
    maxInstances: 100,
    minInstances: 0,
    concurrency: 80 // Default for Node.js
});

// 2.1 Critical Trigger Options (Removed for Cost Optimization)

// 3. Import Triggers
const userTriggers = require('./triggers/userTriggers');
const chatTriggers = require('./triggers/chatTriggers');
const callTriggers = require('./triggers/callTriggers');
const friendTriggers = require('./triggers/friendTriggers');
const systemTriggers = require('./triggers/systemTriggers');
const statusTriggers = require('./triggers/statusTriggers');
const { generateAIResponse } = require('./gemini');

// 4. Export Triggers

// --- USER MANAGEMENT ---
exports.onUserStatusChanged = userTriggers.onUserStatusChanged;
exports.onAdminFieldsChanged = userTriggers.onAdminFieldsChanged;
exports.banUser = userTriggers.banUser;
exports.nukeUser = userTriggers.nukeUser;
exports.syncAdminClaims = userTriggers.syncAdminClaims;
exports.deactivateAccount = userTriggers.deactivateAccount;

// --- FRIEND SYSTEM ---
exports.sendFriendRequest = friendTriggers.sendFriendRequest;
exports.acceptFriendRequest = friendTriggers.acceptFriendRequest;
exports.rejectFriendRequest = friendTriggers.rejectFriendRequest;
exports.cancelFriendRequest = friendTriggers.cancelFriendRequest;
exports.removeFriend = friendTriggers.removeFriend;
exports.blockUser = friendTriggers.blockUser;
exports.unblockUser = friendTriggers.unblockUser;

// --- STATUS SYSTEM ---
exports.onStatusWritten = statusTriggers.onStatusWritten;
exports.syncStatusFeed = statusTriggers.syncStatusFeed;
exports.adminDeleteStatus = statusTriggers.adminDeleteStatus;

// --- CHAT & MESSAGING ---
exports.onMessageCreated = chatTriggers.onMessageCreated;
exports.initializeGeminiChat = chatTriggers.initializeGeminiChat;
exports.clearChatHistory = chatTriggers.clearChatHistory;
exports.deleteChat = chatTriggers.deleteChat;
exports.adminDeleteChat = chatTriggers.adminDeleteChat;
exports.adminHardDeleteMessage = chatTriggers.adminHardDeleteMessage;
exports.aiAgentHelper = chatTriggers.aiAgentHelper;
exports.leaveGroup = chatTriggers.leaveGroup;
exports.onMessageDeleted = chatTriggers.onMessageDeleted;

// --- CALLING ---
exports.onCallCreated = callTriggers.onCallCreated;
exports.cleanupCallSignaling = callTriggers.cleanupCallSignaling;
exports.getTurnCredentials = callTriggers.getTurnCredentials;

// --- AI & SYSTEM ---
exports.generateAIResponse = generateAIResponse;
exports.deleteExpiredStatuses = systemTriggers.deleteExpiredStatuses;
exports.adminResetAllPresence = systemTriggers.adminResetAllPresence;

// exports.debugResetApp = systemTriggers.debugResetApp; // DISABLED FOR PRODUCTION



// 5. Retain Global Admin/Announcement Logic (Keep simple items here)
exports.sendGlobalAnnouncement = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admins can send global announcements.');
    }

    const { title, body, type, priority } = request.data;
    if (!title || !body) {
        throw new HttpsError('invalid-argument', 'Announcement must have a title and body.');
    }

    try {
        const announcementRef = await admin.firestore().collection('announcements').add({
            title,
            body,
            type: type || 'info', // info, warning, alert
            priority: priority || 'normal',
            senderName: request.auth.token.name || 'System Administrator',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            active: true
        });

        return { success: true, id: announcementRef.id };
    } catch (error) {
        logger.error("Announcement failed", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.toggleAnnouncementStatus = onCall(async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admins can manage announcements.');
    }

    const { id, active, deleteFlag } = request.data;
    if (!id) throw new HttpsError('invalid-argument', 'Announcement ID is required.');

    try {
        const docRef = admin.firestore().collection('announcements').doc(id);

        if (deleteFlag) {
            await docRef.delete();
            return { success: true, message: "Announcement deleted." };
        }

        await docRef.update({
            active: active ?? false,
            lastModifiedBy: request.auth.token.name || 'System Administrator',
            lastModifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, message: `Announcement ${active ? 'activated' : 'archived'}.` };
    } catch (error) {
        logger.error("Toggle Announcement failed", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.getAdminStats = onCall({
    memory: "512MiB",
    timeoutSeconds: 30
}, async (request) => {
    if (!request.auth || (!request.auth.token.superAdmin && !request.auth.token.isAdmin)) {
        throw new HttpsError('permission-denied', 'Only Admins can view stats.');
    }

    try {
        const db = admin.firestore();
        const now = new Date();

        // 1. Real Counters
        const usersSnap = await db.collection('users').count().get();
        const totalUsers = usersSnap.data().count;

        // Active Users (last 24h)
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const activeSnap = await db.collection('users')
            .where('lastSeen', '>', admin.firestore.Timestamp.fromDate(yesterday))
            .count().get();
        const activeUsers24h = activeSnap.data().count;

        // Total Chats (real count)
        const chatsSnap = await db.collection('chats').count().get();
        const totalChats = chatsSnap.data().count;

        // 2. User Growth — Real 30-day cumulative signups
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const userGrowthPromises = [];
        for (let i = 0; i < 30; i++) {
            const dayEnd = new Date(thirtyDaysAgo.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
            userGrowthPromises.push(
                db.collection('users')
                    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(dayEnd))
                    .count().get()
                    .then(snap => ({
                        date: dayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        count: snap.data().count
                    }))
                    .catch(() => ({
                        date: dayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        count: 0
                    }))
            );
        }

        // 3. Message Traffic — Real 24-hour hourly volume
        const messageTrafficPromises = [];
        for (let h = 0; h < 24; h++) {
            const hourStart = new Date(yesterday.getTime() + h * 60 * 60 * 1000);
            const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
            messageTrafficPromises.push(
                db.collectionGroup('messages')
                    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(hourStart))
                    .where('timestamp', '<', admin.firestore.Timestamp.fromDate(hourEnd))
                    .count().get()
                    .then(snap => ({
                        hour: `${hourStart.getHours()}:00`,
                        count: snap.data().count
                    }))
                    .catch(() => ({
                        hour: `${hourStart.getHours()}:00`,
                        count: 0
                    }))
            );
        }

        // Execute all chart queries in parallel
        const [userGrowth, messageTraffic] = await Promise.all([
            Promise.all(userGrowthPromises),
            Promise.all(messageTrafficPromises)
        ]);

        return {
            totalUsers,
            activeUsers24h,
            totalChats,
            systemHealth: {
                database: true,
                functions: true,
                storage: true
            },
            charts: {
                userGrowth,
                messageTraffic
            }
        };

    } catch (error) {
        logger.error("Admin Stats Error", error);
        throw new HttpsError('internal', 'Failed to fetch stats.');
    }
});
