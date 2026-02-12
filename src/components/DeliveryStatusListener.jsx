import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserChats } from '../services/chatListService';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

const DeliveryStatusListener = () => {
    const { currentUser } = useAuth();
    const lastCheckedTimestamps = useRef({});

    useEffect(() => {
        if (!currentUser) return;

        // Subscribe to chat list changes
        const unsubscribe = subscribeToUserChats(currentUser.uid, async (chats) => {
            // Filter chats that have unread messages for the current user
            const chatsWithUnread = chats.filter(chat => {
                const unread = chat.unreadCount?.[currentUser.uid];
                return unread && unread > 0;
            });

            if (chatsWithUnread.length === 0) return;

            // Smart Diff: Only process chats that have a newer message than last checked
            const chatsToProcess = chatsWithUnread.filter(chat => {
                const lastTimestamp = lastCheckedTimestamps.current[chat.id];
                // Handle Firestore Timestamp or Date object
                const currentTimestamp = chat.lastMessageTimestamp?.toMillis?.() || chat.lastMessageTimestamp?.getTime?.() || 0;

                if (currentTimestamp > (lastTimestamp || 0)) {
                    lastCheckedTimestamps.current[chat.id] = currentTimestamp;
                    return true;
                }
                return false;
            });

            if (chatsToProcess.length === 0) return;

            console.log(`[DeliveryListener] Processing ${chatsToProcess.length} chats with new unread messages...`);

            // For each chat with *new* unread messages, find undelivered ones and mark as delivered
            for (const chat of chatsToProcess) {
                try {
                    const messagesRef = collection(db, 'chats', chat.id, 'messages');
                    const qUndelivered = query(
                        messagesRef,
                        where('delivered', '==', false),
                        where('senderId', '!=', currentUser.uid)
                    );

                    const snapshot = await getDocs(qUndelivered).catch(e => {
                        console.warn(`[DeliveryListener] Skipping chat ${chat.id}:`, e.message);
                        return { empty: true };
                    });

                    if (snapshot.empty) continue;

                    const batch = writeBatch(db);
                    let updateCount = 0;

                    snapshot.docs.forEach(docSnap => {
                        batch.update(docSnap.ref, { delivered: true });
                        updateCount++;
                    });

                    if (updateCount > 0) {
                        await batch.commit();
                        console.log(`[DeliveryListener] Marked ${updateCount} messages as delivered in chat ${chat.id}`);
                    }

                    // Tiny delay to avoid hitting Firebase write-heavy rate limits
                    await new Promise(r => setTimeout(r, 50));

                } catch (error) {
                    console.error(`[DeliveryListener] Error in chat ${chat.id}:`, error);
                }
            }
        }, 30, 'DeliveryStatusListener');

        return () => unsubscribe();
    }, [currentUser]);

    return null; // This component renders nothing
};

export default DeliveryStatusListener;
