import { rtdb, auth } from "../firebase";
import { ref, update, onValue, off, serverTimestamp, set, increment, get } from "firebase/database";

/**
 * Service to handle high-frequency chat metadata updates using Realtime Database.
 * This avoids Firestore's 1 write/sec limit on the single chat document.
 */
export const ChatMetadataService = {

    /**
     * Updates the last message and unread counts for a chat.
     * @param {string} chatId 
     * @param {object} messageData - The message object (text, senderId, timestamp, etc.)
     * @param {array} participantIds - Array of user IDs in the chat
     */
    updateChatMetadata: async (chatId, messageData, participantIds) => {
        if (!chatId) return;

        const updates = {};
        const timestamp = serverTimestamp();

        // 1. Update SHARED Last Message Preview (Allowed by Rules)
        const metaPath = `chats/${chatId}/meta`;

        updates[`${metaPath}/lastMessage`] = {
            text: messageData.text || (messageData.type === 'image' ? '📷 Image' : '📎 Attachment'),
            senderId: messageData.senderId,
            timestamp: timestamp,
            type: messageData.type || 'text',
            isOptimistic: false
        };
        updates[`${metaPath}/lastUpdated`] = timestamp;

        // 2. Update OWN "Active Chats" list (Allowed)
        // We do NOT update others; Cloud Functions handles fan-out to valid recipients.
        if (auth.currentUser) {
            updates[`user_chats/${auth.currentUser.uid}/${chatId}/lastUpdated`] = timestamp;
        }

        try {
            await update(ref(rtdb), updates);
        } catch (error) {
            console.error("RTDB Metadata Sync Failed:", error);
        }
    },

    /**
     * Resets unread count for a specific user in a chat.
     */
    resetUnreadCount: async (chatId, userId) => {
        if (!chatId || !userId) return;
        const path = `chats/${chatId}/meta/unreadCount/${userId}`;
        try {
            await set(ref(rtdb, path), 0);
        } catch (error) {
            console.error("Failed to reset unread count:", error);
        }
    },

    /**
     * Subscribes to metadata for a specific chat.
     */
    subscribeToChatMeta: (chatId, callback) => {
        const metaRef = ref(rtdb, `chats/${chatId}/meta`);
        const listener = onValue(metaRef, (snapshot) => {
            const data = snapshot.val();
            callback(data || {});
        });
        return () => off(metaRef, 'value', listener);
    },

    /**
     * Bulk subscribe to metadata for a list of chats.
     * Note: For 100s of chats, individual listeners are fine in RTDB (it uses a single socket).
     */
    subscribeToMultiChatMeta: (chatIds, callback) => {
        // In RTDB, we don't have a robust "where in" query for disparate paths.
        // We usually rely on individual listeners or a parent listener if structure allows.
        // For V1, we will return a manager that creates N listeners.
        // Ideally, we'd restructure to `users/{uid}/chat_meta` but that duplicates data x N participants.

        // This is a naive implementation. For 10k users, properly structured data is key.
        // Since we kept `chats/{chatId}/meta`, we invoke N listeners.

        const listeners = [];
        const results = {};

        let debounceTimer = null;
        chatIds.forEach(chatId => {
            const r = ref(rtdb, `chats/${chatId}/meta`);
            const l = onValue(r, (snap) => {
                results[chatId] = snap.val();

                // PERFORMANCE: Debounce aggregate callback to prevent render storms
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    callback({ ...results });
                }, 50); // 50ms aggregation window
            });
            listeners.push({ ref: r, fn: l });
        });

        return () => {
            listeners.forEach(({ ref, fn }) => off(ref, 'value', fn));
        };
    }
};
