export const getChatId = (currentUserId, otherUserId) => {
    if (!currentUserId || !otherUserId) return null;
    return [currentUserId, otherUserId].sort().join('_');
};

import { GEMINI_BOT_ID } from '../config/constants';

export const isGeminiChat = (chatId) => {
    return chatId.startsWith('gemini_') || chatId === GEMINI_BOT_ID;
};
