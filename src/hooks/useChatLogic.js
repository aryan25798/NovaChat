import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { doc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { subscribeToMessages, sendMessage, loadOlderMessages, resetChatUnreadCount, searchMessages } from "../services/chatService";
import { lightningSync } from "../services/LightningService";
import { preCacheMedia } from "../utils/mediaCache";

export function useChatLogic(chat, currentUser) {
    const [messages, setMessages] = useState([]);
    const [historyMessages, setHistoryMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [serverResults, setServerResults] = useState([]);
    const [pendingQueue, setPendingQueue] = useState([]);
    const [signalMessages, setSignalMessages] = useState([]);
    const [rtdbStatus, setRtdbStatus] = useState({});
    const [typingUsers, setTypingUsers] = useState({});

    // reset state when chat changes
    useEffect(() => {
        setMessages([]);
        setHistoryMessages([]);
        setSignalMessages([]);
        setPendingQueue([]);
        setHasMoreMessages(true);
        setLoading(true);
        setServerResults([]);
        setRtdbStatus({});
        setTypingUsers({});

        if (chat?.id && currentUser?.uid) {
            resetChatUnreadCount(chat.id, currentUser.uid);
        }
    }, [chat?.id, currentUser?.uid]);

    // 1. Message Subscription
    useEffect(() => {
        if (!chat?.id || !currentUser?.uid) return;

        setLoading(true);
        let isMounted = true;

        const unsubscribe = subscribeToMessages(chat.id, currentUser.uid, (newMessages) => {
            if (!isMounted) return;
            setMessages(prev => {
                if (prev.length === newMessages.length) {
                    const hasChange = prev.some((msg, i) => {
                        const newM = newMessages[i];
                        return msg.id !== newM.id ||
                            msg.status !== newM.status ||
                            msg.text !== newM.text;
                    });
                    if (!hasChange) return prev;
                }
                return newMessages;
            });
            setLoading(false);
            setHasMoreMessages(newMessages.length >= 20); // Heuristic
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, [chat?.id, currentUser?.uid]);

    // 2. Lightning Sync (RTDB)
    useEffect(() => {
        if (!chat?.id) return;
        let isMounted = true;

        const unsubStatus = lightningSync.subscribeToStatusSignals(chat.id, (signals) => {
            if (!isMounted) return;
            setRtdbStatus(prev => {
                const next = { ...prev, ...signals };
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        });

        const unsubTyping = lightningSync.subscribeToTyping(chat.id, (uids) => {
            if (!isMounted) return;
            setTypingUsers(prev => {
                const next = {};
                uids.forEach(uid => { if (uid !== currentUser.uid) next[uid] = true; });
                return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
            });
        });

        const unsubSignals = lightningSync.subscribeToSignals(chat.id, (payload) => {
            if (payload && payload.senderId !== currentUser.uid) {
                setSignalMessages(prev => {
                    if (prev.some(m => m.id === payload.messageId)) return prev;
                    const ghostMsg = {
                        id: payload.messageId,
                        text: payload.text,
                        senderId: payload.senderId,
                        timestamp: new Date(payload.timestamp || Date.now()),
                        status: 'delivered',
                        type: 'text',
                        isSignal: true
                    };
                    return [...prev.slice(-4), ghostMsg];
                });
            }
        });

        return () => {
            isMounted = false;
            unsubStatus();
            unsubTyping();
            unsubSignals();
            lightningSync.cleanup(chat.id);
        };
    }, [chat?.id, currentUser?.uid]);

    // 3. Helper Functions
    const handleLoadMore = useCallback(async () => {
        if (loadingHistory || !hasMoreMessages) return;
        const oldestMessage = historyMessages.length > 0 ? historyMessages[0] : messages[0];
        if (!oldestMessage?._doc) return;

        setLoadingHistory(true);
        const olderMsgs = await loadOlderMessages(chat.id, oldestMessage._doc);
        if (olderMsgs.length < 50) setHasMoreMessages(false);
        if (olderMsgs.length > 0) setHistoryMessages(prev => [...olderMsgs, ...prev]);
        setLoadingHistory(false);
    }, [chat?.id, historyMessages, messages, loadingHistory, hasMoreMessages]);

    const handleSendMessage = useCallback(async (text, replyContext, metadata) => {
        const messageId = doc(collection(db, "chats", chat.id, "messages")).id;
        const optimisticMsg = {
            id: messageId,
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email,
            timestamp: new Date(),
            status: 'pending',
            type: 'text',
            replyTo: replyContext,
            isOptimistic: true
        };

        setPendingQueue(prev => [...prev, optimisticMsg]);

        try {
            await sendMessage(chat.id, currentUser, text, replyContext, messageId, metadata);
        } catch (err) {
            console.error("Send failed:", err);
            setPendingQueue(prev => prev.filter(m => m.id !== messageId));
            throw err;
        }
    }, [chat?.id, currentUser]);

    // 4. Time/Ordering Utils
    const getMillis = (t) => {
        if (!t) return 0;
        if (typeof t.toMillis === 'function') return t.toMillis();
        if (t instanceof Date) return t.getTime();
        if (t.seconds) return t.seconds * 1000;
        return 0;
    };

    // 5. Memoization Logic (The "Engine")
    const sortedMessages = useMemo(() => {
        const uniqueMap = new Map();
        const clearedAt = chat?.clearedAt?.[currentUser.uid]?.toMillis?.() || 0;

        const process = (m) => {
            const msgMillis = getMillis(m.timestamp);
            if (msgMillis <= clearedAt) return;
            if (m.hiddenBy?.includes(currentUser.uid)) return;
            uniqueMap.set(m.id, m);
        };

        if (serverResults?.length > 0) serverResults.forEach(process);
        historyMessages.forEach(process);
        messages.forEach(process);
        signalMessages.forEach(process);
        pendingQueue.forEach(process); // Queue can override

        return Array.from(uniqueMap.values()).sort((a, b) => {
            const tA = getMillis(a.timestamp);
            const tB = getMillis(b.timestamp);
            return tA !== tB ? tA - tB : a.id.localeCompare(b.id);
        });
    }, [messages, historyMessages, serverResults, signalMessages, pendingQueue, chat?.clearedAt, currentUser.uid]);

    // 6. Display Logic (Tails & Groups)
    // Separating this allows us to only re-run tail calculation if the sorted list changes
    const processMessages = useMemo(() => {
        return sortedMessages.map((msg, i) => {
            const nextMsg = sortedMessages[i + 1];
            const showTail = !nextMsg || nextMsg.senderId !== msg.senderId || nextMsg.type === 'call_log';
            return { ...msg, showTail };
        });
    }, [sortedMessages]);

    // Prune pending queue
    useEffect(() => {
        if (pendingQueue.length === 0) return;
        const dbIds = new Set(messages.map(m => m.id));
        const historyIds = new Set(historyMessages.map(m => m.id));
        setPendingQueue(prev => {
            const stillPending = prev.filter(m => !dbIds.has(m.id) && !historyIds.has(m.id));
            return stillPending.length !== prev.length ? stillPending : prev;
        });
    }, [messages, historyMessages, pendingQueue.length]);

    // Media Pre-cache
    useEffect(() => {
        if (messages.length > 0) {
            const mediaUrls = messages
                .map(m => m.mediaUrl || m.fileUrl || m.imageUrl || m.videoUrl)
                .filter(url => !!url);
            if (mediaUrls.length > 0) preCacheMedia(mediaUrls);
        }
    }, [messages]);

    return {
        messages: processMessages,
        loading,
        loadingHistory,
        hasMoreMessages,
        rtdbStatus,
        typingUsers,
        handleLoadMore,
        handleSendMessage,
        setServerResults,
        setPendingQueue,
        pendingQueue, // Exported for media upload hook integration?
        signalMessages
    };
}
