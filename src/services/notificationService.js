import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, limit } from 'firebase/firestore';
import { auth } from '../firebase';

// Collection reference
const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Sends a notification to a specific user.
 * @param {string} toUserId - ID of the user receiving the notification.
 * @param {string} type - Type of notification (e.g., 'message', 'friend_request', 'call', 'system').
 * @param {string} title - Notification title.
 * @param {string} body - Notification body content.
 * @param {object} data - Additional data (e.g., senderId, chatId, callId).
 */
export const sendNotification = async (toUserId, type, title, body, data = {}) => {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('User must be authenticated to send notifications');

        await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
            toUserId,
            fromUserId: currentUser.uid,
            type,
            title,
            body,
            data,
            isRead: false,
            createdAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error sending notification:", error);
        throw error;
    }
};

/**
 * Marks a notification as read.
 * @param {string} notificationId 
 */
export const markNotificationAsRead = async (notificationId) => {
    try {
        const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
        await updateDoc(notifRef, { isRead: true });
    } catch (error) {
        console.error("Error marking notification as read:", error);
    }
};

/**
 * Subscribes to the user's notifications.
 * @param {string} userId 
 * @param {function} callback 
 * @returns {function} Unsubscribe function
 */
export const subscribeToNotifications = (userId, callback) => {
    if (!userId) return () => { };

    const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('toUserId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    return onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        callback(notifications);
    }, (error) => {
        // Handle specific error cases
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
            console.error("Error listening to notifications: The required Firestore index is still building. Please wait a few minutes and refresh the page.", error);
            // Return empty array instead of crashing
            callback([]);
        } else if (error.code === 'permission-denied') {
            console.error("Error listening to notifications: Permission denied. Please check Firestore security rules.", error);
            callback([]);
        } else {
            console.error("Error listening to notifications:", error);
            callback([]);
        }
    });
};

