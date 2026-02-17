import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { subscribeToUserChats } from '../services/chatListService';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

const ChatContext = createContext();

export function useChat() {
    return useContext(ChatContext);
}

export function ChatProvider({ children }) {
    const { currentUser } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setChats([]);
            setLoading(false);
            return;
        }

        const unsubscribe = subscribeToUserChats(currentUser.uid, (chatData) => {
            // Apply global filters (Hidden chats, Cleared history)
            const filteredChats = chatData.filter(chat => {
                const clearedAt = chat.clearedAt?.[currentUser.uid]?.toDate?.() || 0;
                const lastMsgTime = chat.lastMessageTimestamp?.toDate?.() || null;
                const isHidden = chat.hiddenBy?.includes(currentUser.uid);

                // Allow chats with pending (null) timestamps to show up (newly created)
                // But hide if cleared after the last message
                return (!lastMsgTime || lastMsgTime > clearedAt) && !isHidden;
            });

            setChats(filteredChats);
            setLoading(false);
        }, 30, 'ChatContext'); // 30 limit provided to service

        return () => unsubscribe();
    }, [currentUser?.uid]);

    const value = useMemo(() => ({
        chats,
        loading,
        // Helper to archive/hide chat (optimistic update could be added here)
        archiveChat: async (chatId) => {
            // Implementation for archive if needed
        }
    }), [chats, loading]);

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
}
