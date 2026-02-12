export const getChatId = (currentUserId, otherUserId) => {
    if (!currentUserId || !otherUserId) return null;
    return [currentUserId, otherUserId].sort().join('_');
};

export const isGeminiChat = (chatId) => {
    return chatId.startsWith('gemini_') || chatId === 'gemini_bot_v1';
};
