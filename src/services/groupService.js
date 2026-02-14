import { db, functions } from "../firebase";
import { doc, updateDoc, arrayRemove, deleteDoc, writeBatch, collection, getDocs, getDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/**
 * Exits a group. If the last user leaves, the group is deleted.
 * USES CLOUD FUNCTION for atomic and recursive deletion security.
 * @param {string} chatId 
 * @param {string} userId 
 */
export const exitGroup = async (chatId, userId) => {
    try {
        const leaveGroupFn = httpsCallable(functions, 'leaveGroup');
        await leaveGroupFn({ chatId });
    } catch (error) {
        console.error("Failed to exit group:", error);
        throw error;
    }
};

/**
 * Removes a participant from the group (Admin only).
 * @param {string} chatId 
 * @param {string} adminId - ID of the admin performing the action
 * @param {string} targetId - ID of user to remove
 */
export const removeGroupParticipant = async (chatId, adminId, targetId) => {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error("Chat not found");

    const chatData = chatSnap.data();

    // Verify admin
    if (chatData.chatRole?.[adminId] !== 'admin') {
        throw new Error("Only admins can remove participants");
    }

    const updatedRole = { ...chatData.chatRole };
    delete updatedRole[targetId];

    await updateDoc(chatRef, {
        participants: arrayRemove(targetId),
        chatRole: updatedRole,
        lastMessage: {
            text: `${chatData.participantInfo?.[adminId]?.displayName} removed ${chatData.participantInfo?.[targetId]?.displayName}`,
            timestamp: new Date(),
            type: 'system'
        },
        lastMessageTimestamp: serverTimestamp()
    });
};

/**
 * Promotes a participant to admin.
 * @param {string} chatId 
 * @param {string} adminId 
 * @param {string} targetId 
 */
export const promoteToAdmin = async (chatId, adminId, targetId) => {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error("Chat not found");

    const chatData = chatSnap.data();
    if (chatData.chatRole?.[adminId] !== 'admin') throw new Error("Unauthorized");

    const updatedRole = { ...chatData.chatRole, [targetId]: 'admin' };

    await updateDoc(chatRef, {
        chatRole: updatedRole
    });
};

/**
 * Dismisses an admin (demote to member).
 * @param {string} chatId 
 * @param {string} adminId 
 * @param {string} targetId 
 */
export const dismissAdmin = async (chatId, adminId, targetId) => {
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) throw new Error("Chat not found");

    const chatData = chatSnap.data();
    if (chatData.chatRole?.[adminId] !== 'admin') throw new Error("Unauthorized");

    const updatedRole = { ...chatData.chatRole, [targetId]: 'member' };

    await updateDoc(chatRef, {
        chatRole: updatedRole
    });
};

/**
 * Updates group info (Subject, Description, Photo).
 * @param {string} chatId 
 * @param {object} updates - { groupName, groupImage, ... }
 */
export const updateGroupInfo = async (chatId, updates, userId) => {
    const chatRef = doc(db, "chats", chatId);
    // Anyone can update group info in default WhatsApp settings, usually. 
    // Or we can restrict to admin. Let's allow everyone for now to match default 'Edit Group Info' 
    // unless 'restrict' setting is on (which we don't have yet).

    await updateDoc(chatRef, {
        ...updates,
        lastMessage: {
            text: `Group details updated`,
            timestamp: new Date(),
            type: 'system'
        },
        lastMessageTimestamp: serverTimestamp()
    });
};
