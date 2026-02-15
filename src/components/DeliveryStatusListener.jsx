import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserChats } from '../services/chatListService';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

const DeliveryStatusListener = () => {
    const { currentUser } = useAuth();
    const lastCheckedTimestamps = useRef({});

    useEffect(() => {
        if (!currentUser?.uid) return;

        // Subscribe to chat list changes
        const unsubscribe = subscribeToUserChats(currentUser.uid, async (chats) => {
            // Update Document Title (WhatsApp-like badge)
            const totalUnread = chats.reduce((acc, chat) => {
                return acc + (chat.unreadCount?.[currentUser.uid] || 0);
            }, 0);
            document.title = totalUnread > 0 ? `(${totalUnread}) Nova` : 'Nova';

            // Filter chats that have unread messages for the current user
            const chatsWithUnread = chats.filter(chat => {
                const unread = chat.unreadCount?.[currentUser.uid];
                return unread && unread > 0;
            });

            if (chatsWithUnread.length === 0) return;

            // PERFORMANCE NOTE: We previously skipped this if tab was hidden.
            // But for 100/100 robustness, the listener acts as a reliable fallback to the SW.
            // Firestore's offline persistence handles the efficiency.

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

            // console.log(`[DeliveryListener] Processing ${chatsToProcess.length} chats with new unread messages...`);

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

                    // Group writes into batches of 500 (Firestore limit)
                    const chunks = [];
                    for (let i = 0; i < snapshot.docs.length; i += 500) {
                        chunks.push(snapshot.docs.slice(i, i + 500));
                    }

                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(docSnap => {
                            batch.update(docSnap.ref, { delivered: true });
                        });
                        await batch.commit();
                    }

                    // console.log(`[DeliveryListener] Marked ${snapshot.docs.length} messages as delivered in chat ${chat.id}`);

                    // Tiny delay to avoid hitting Firebase write-heavy rate limits
                    await new Promise(r => setTimeout(r, 100));

                } catch (error) {
                    console.error(`[DeliveryListener] Error in chat ${chat.id}:`, error);
                }
            }
        }, 30, 'DeliveryStatusListener');

        return () => unsubscribe();
    }, [currentUser?.uid]);

    return null; // This component renders nothing
};

export default DeliveryStatusListener;
