import { rtdb } from "../firebase";
import { ref, set, onValue, onDisconnect } from "firebase/database";

/**
 * Sets the typing status for a user in a specific chat.
 * @param {string} chatId 
 * @param {string} userId 
 * @param {boolean} isTyping 
 */
export const setTypingStatus = (chatId, userId, isTyping) => {
    if (!chatId || !userId) return;
    const typingRef = ref(rtdb, `typing/${chatId}/${userId}`);
    set(typingRef, isTyping);

    // Ensure indicator is cleared if user disconnects
    if (isTyping) {
        onDisconnect(typingRef).set(false);
    }
};

/**
 * Subscribes to typing status of other participants in a chat.
 * @param {string} chatId 
 * @param {string} currentUserId 
 * @param {function} callback - Called with an object of typing users {uid: boolean}
 */
export const subscribeToTypingStatus = (chatId, currentUserId, callback) => {
    if (!chatId) return () => { };
    const typingRef = ref(rtdb, `typing/${chatId}`);

    return onValue(typingRef, (snapshot) => {
        const data = snapshot.val() || {};
        // Filter out current user's own typing status
        const othersTyping = {};
        Object.keys(data).forEach(uid => {
            if (uid !== currentUserId && data[uid] === true) {
                othersTyping[uid] = true;
            }
        });
        callback(othersTyping);
    });
};
