import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FaTimes, FaSearch, FaVideo, FaPhone, FaEllipsisV } from "react-icons/fa";
import { GEMINI_BOT_ID } from "../constants";

import { db } from "../firebase";
import { doc, collection } from "firebase/firestore";

import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useNavigate } from "react-router-dom";
import { subscribeToMessages, sendMessage, sendMediaMessage, deleteMessage, addReaction, searchMessages, clearChat, hideChat, loadOlderMessages, resetChatUnreadCount } from "../services/chatService";
import { lightningSync } from "../services/LightningService";
import { usePresence } from "../contexts/PresenceContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../contexts/FileUploadContext";
import { getDownloadURL } from "firebase/storage";

import { useFriend } from "../contexts/FriendContext";
import { Button } from "./ui/Button";

// Modular Components
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import ContactInfoPanel from "./ContactInfoPanel";
import FullScreenMedia from "./FullScreenMedia";
import { preCacheMedia } from "../utils/mediaCache";

export default function ChatWindow({ chat, setChat }) {
    const [messages, setMessages] = useState([]); // Real-time messages (latest chunk)
    const [historyMessages, setHistoryMessages] = useState([]); // Manually fetched older messages
    const [newMessage, setNewMessage] = useState("");
    const [typingUsers, setTypingUsers] = useState({});
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [serverResults, setServerResults] = useState([]);
    const [pendingQueue, setPendingQueue] = useState([]); // Ultra-fast optimistic queue
    const [rtdbStatus, setRtdbStatus] = useState({}); // RTDB status overrides

    // Media Gallery State
    const [activeMediaMessage, setActiveMediaMessage] = useState(null);

    const { currentUser } = useAuth();
    const { startCall } = useCall();
    const { getUserPresence, updateActiveChat } = usePresence(); // Re-added updateActiveChat
    const navigate = useNavigate();

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    // Active Chat Reporting (Fix for Notification Suppression)
    useEffect(() => {
        if (chat?.id) {
            updateActiveChat(chat.id);
        }
        return () => updateActiveChat(null);
    }, [chat?.id, updateActiveChat]);

    // Context & Presence
    const [presence, setPresence] = useState(null);
    const otherUid = chat?.participants?.find?.(uid => uid !== currentUser.uid);
    const otherUser = useMemo(() => {
        if (chat?.type === 'group') {
            return { displayName: chat.groupName, photoURL: chat.groupImage, isGroup: true, uid: chat.id };
        }
        const isGemini = otherUid === GEMINI_BOT_ID || chat?.type === 'gemini';
        if (chat?.participantInfo && otherUid) {
            return { uid: otherUid, ...chat.participantInfo[otherUid], isGemini };
        }
        return { uid: otherUid, displayName: isGemini ? 'Gemini AI' : 'User', photoURL: isGemini ? "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" : null, isGemini };
    }, [chat?.type, chat?.groupName, chat?.groupImage, chat?.participantInfo, otherUid, chat?.id]);

    // Handlers
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const handleBack = useCallback(() => {
        if (setChat) setChat(null);
        navigate('/');
    }, [setChat, navigate]);

    const handleInputChange = useCallback((e) => {
        setNewMessage(e.target.value);
        if (!chat?.id || !currentUser?.uid) return;
        lightningSync.setTyping(chat.id, currentUser.uid, true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            lightningSync.setTyping(chat.id, currentUser.uid, false);
        }, 3000);
    }, [chat?.id, currentUser?.uid]);

    const handleSendMessage = useCallback(async (e) => {
        if (e) e.preventDefault();
        const textToSend = newMessage.trim();
        if (!textToSend && !replyTo) return;

        // Clear input and reply status immediately
        setNewMessage("");
        setReplyTo(null);

        // Optimistic UI Update: RESTORED via pendingQueue for absolute speed
        const messageId = doc(collection(db, "chats", chat.id, "messages")).id;
        const optimisticMsg = {
            id: messageId,
            text: textToSend,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email,
            timestamp: new Date(),
            status: 'pending',
            type: 'text',
            replyTo: replyTo,
            isOptimistic: true
        };

        // Instant local update (Queued)
        setPendingQueue(prev => [...prev, optimisticMsg]);

        try {
            // console.log(`[ChatWindow] Ultra-Lightning send: ${messageId}`); // Squelch debug log

            const metadata = {
                type: chat.type,
                participants: chat.participants
            };

            await sendMessage(chat.id, currentUser, textToSend, replyTo, messageId, metadata);

            // Mark as 'sent' instantly in the local queue so the clock turns to a tick
            setPendingQueue(prev => prev.map(m => m.id === messageId ? { ...m, status: 'sent' } : m));

            // The main listener will eventually prune this when the real message ID arrives from Firestore
        } catch (err) {
            console.error("[ChatWindow] Send failed:", err);
            setNewMessage(textToSend);
            setPendingQueue(prev => prev.filter(m => m.id !== messageId));
            alert(`Failed to send: ${err.message || 'Unknown error'}`);
        }
    }, [newMessage, replyTo, chat, currentUser]);

    const { startUpload } = useFileUpload();

    const handleFileUpload = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const { uploadTask } = await startUpload(file, `uploads/${chat.id}/${Date.now()}_${file.name}`);

            uploadTask.on('state_changed',
                null,
                (error) => console.error("Upload error:", error),
                async () => {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    await sendMediaMessage(chat.id, currentUser, {
                        url,
                        fileType: file.type,
                        fileName: file.name,
                        fileSize: file.size
                    });
                }
            );
        } catch (error) {
            console.error("Failed to start upload:", error);
        }
    }, [chat?.id, currentUser, startUpload]);

    const handleDeleteChat = useCallback(async () => {
        try {
            await hideChat(chat.id, currentUser.uid);
            await clearChat(chat.id, currentUser.uid);
            setChat(null);
            navigate('/');
        } catch (err) {
            console.error("Failed to clear/hide chat", err);
        }
    }, [chat?.id, currentUser?.uid, setChat, navigate]);

    const handleDelete = useCallback(async (msgId, deleteFor) => {
        await deleteMessage(chat.id, msgId, deleteFor);
    }, [chat?.id]);

    const handleReact = useCallback(async (msgId, emoji) => {
        await addReaction(chat.id, msgId, emoji, currentUser.uid);
    }, [chat?.id, currentUser?.uid]);

    // Cleanup & Ghost Transition
    useEffect(() => {
        if (!chat?.id || !currentUser?.uid) return;
        if (loading && chat.isGhost) {
            setLoading(false);
        }
    }, [chat?.id, chat?.isGhost]);

    // Reset when chat changes
    useEffect(() => {
        setMessages([]);
        setHistoryMessages([]);
        setHasMoreMessages(true);
        setLoading(true);
        if (chat?.id && currentUser?.uid) {
            resetChatUnreadCount(chat.id, currentUser.uid);
        }
    }, [chat?.id, currentUser?.uid]);

    // Hybrid Listeners (Firestore + RTDB)
    useEffect(() => {
        if (!chat?.id || !currentUser?.uid) return;

        setLoading(true);
        // Use a ref to track if mounted to avoid setting state on unmounted component
        let isMounted = true;

        const unsubscribe = subscribeToMessages(chat.id, currentUser.uid, (newMessages) => {
            if (isMounted) {
                setMessages(newMessages);
                setLoading(false);
                setHasMoreMessages(newMessages.length >= 20); // Sync initial logic
            }
        });

        const unsubStatus = lightningSync.subscribeToStatusSignals(chat.id, (signals) => {
            setRtdbStatus(prev => ({ ...prev, ...signals }));
        });

        const unsubTyping = lightningSync.subscribeToTyping(chat.id, (uids) => {
            const typingObj = {};
            uids.forEach(uid => { if (uid !== currentUser.uid) typingObj[uid] = true; });
            setTypingUsers(typingObj);
        });

        return () => {
            unsubscribe();
            unsubStatus();
            unsubTyping();
            lightningSync.cleanup(chat.id);
        };
    }, [chat?.id, currentUser?.uid]);

    // Presence Listener
    useEffect(() => {
        if (otherUid && !otherUser.isGroup) {
            const unsub = getUserPresence(otherUid, (data) => {
                setPresence(data);
            });
            return () => unsub();
        }
    }, [otherUid, otherUser.isGroup]);

    // Pre-cache media
    useEffect(() => {
        if (messages.length > 0) {
            const mediaUrls = messages
                .map(m => m.mediaUrl || m.fileUrl || m.imageUrl || m.videoUrl)
                .filter(url => !!url);
            if (mediaUrls.length > 0) {
                preCacheMedia(mediaUrls);
            }
        }
    }, [messages]);

    // Load More
    const handleLoadMore = async () => {
        if (loadingHistory || !hasMoreMessages) return;
        const oldestMessage = historyMessages.length > 0 ? historyMessages[0] : messages[0];
        if (!oldestMessage?._doc) return;

        setLoadingHistory(true);
        const olderMsgs = await loadOlderMessages(chat.id, oldestMessage._doc);
        if (olderMsgs.length < 50) setHasMoreMessages(false);
        if (olderMsgs.length > 0) setHistoryMessages(prev => [...olderMsgs, ...prev]);
        setLoadingHistory(false);
    };

    // Scroll Management
    useEffect(() => {
        if (historyMessages.length === 0 && messages.length > 0) {
            scrollToBottom();
        }
    }, [messages.length, historyMessages.length]);

    // Helpers
    const formatLastSeen = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return "just now";
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return `at ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    const getStatusText = () => {
        if (otherUser.isGroup) return "click for group info";
        if (otherUser.isGemini) return "AI Assistant";
        if (Object.keys(typingUsers).length > 0) return "typing...";
        if (presence?.state === 'online') return "online";
        if (presence?.last_changed) return `last seen ${formatLastSeen(presence.last_changed)}`;
        return "offline";
    };

    const handleServerSearch = useCallback(async () => {
        if (!searchQuery) return;
        setLoading(true);
        const results = await searchMessages(chat.id, searchQuery);
        setServerResults(results);
        setLoading(false);
    }, [searchQuery, chat?.id]);
    useEffect(() => {
        if (!searchQuery) setServerResults([]);
    }, [searchQuery]);

    // Prune pending messages when they appear in real lists
    useEffect(() => {
        if (pendingQueue.length === 0) return;

        const dbIds = new Set(messages.map(m => m.id));
        const historyIds = new Set(historyMessages.map(m => m.id));

        setPendingQueue(prev => {
            const stillPending = prev.filter(m => !dbIds.has(m.id) && !historyIds.has(m.id));
            return stillPending.length !== prev.length ? stillPending : prev;
        });
    }, [messages, historyMessages]);

    const filteredMessages = useMemo(() => {
        const clearedAt = chat?.clearedAt?.[currentUser.uid]?.toDate?.() || new Date(0);

        const uniqueMessages = new Map();
        if (serverResults?.length > 0) serverResults.forEach(m => uniqueMessages.set(m.id, m));
        historyMessages.forEach(m => uniqueMessages.set(m.id, m));
        messages.forEach(m => uniqueMessages.set(m.id, m));
        pendingQueue.forEach(m => uniqueMessages.set(m.id, m));

        const allMessages = Array.from(uniqueMessages.values()).map(m => {
            if (rtdbStatus[m.id]) return { ...m, status: rtdbStatus[m.id] };
            return m;
        });

        const lowerQuery = searchQuery?.toLowerCase();
        const filtered = allMessages.filter(m => {
            const msgTime = m.timestamp?.toDate?.() || new Date(m.timestamp || 0);
            if (msgTime <= clearedAt) return false;
            if (m.hiddenBy?.includes(currentUser.uid)) return false;
            if (lowerQuery) {
                const searchText = m.textLower || m.text?.toLowerCase() || "";
                return searchText.includes(lowerQuery);
            }
            return true;
        });

        return filtered.sort((a, b) => {
            const getMillis = (t) => {
                if (!t) return 0;
                if (typeof t.toMillis === 'function') return t.toMillis();
                if (t instanceof Date) return t.getTime();
                if (t.seconds) return t.seconds * 1000;
                return 0;
            };
            const tA = getMillis(a.timestamp);
            const tB = getMillis(b.timestamp);
            if (Math.abs(tA - tB) < 100) return a.id.localeCompare(b.id);
            return tA - tB;
        });
    }, [messages, historyMessages, searchQuery, serverResults, chat, currentUser.uid, pendingQueue, rtdbStatus]);

    const mediaMessages = useMemo(() => {
        return filteredMessages.filter(m => {
            const hasUrl = m.mediaUrl || m.fileUrl || m.imageUrl || m.videoUrl;
            const isMedia = m.type === 'image' || m.type === 'video' || (m.fileType && (m.fileType.startsWith('image/') || m.fileType.startsWith('video/')));
            return hasUrl && isMedia;
        });
    }, [filteredMessages]);

    const handleMediaClick = (msg) => setActiveMediaMessage(msg);

    const handleNextMedia = () => {
        if (!activeMediaMessage) return;
        const currentIndex = mediaMessages.findIndex(m => m.id === activeMediaMessage.id);
        if (currentIndex < mediaMessages.length - 1) setActiveMediaMessage(mediaMessages[currentIndex + 1]);
    };

    const handlePrevMedia = () => {
        if (!activeMediaMessage) return;
        const currentIndex = mediaMessages.findIndex(m => m.id === activeMediaMessage.id);
        if (currentIndex > 0) setActiveMediaMessage(mediaMessages[currentIndex - 1]);
    };

    const activeMediaIndex = activeMediaMessage ? mediaMessages.findIndex(m => m.id === activeMediaMessage.id) : -1;

    const getActiveMediaSrc = () => {
        if (!activeMediaMessage) return null;
        return activeMediaMessage.mediaUrl || activeMediaMessage.fileUrl || activeMediaMessage.imageUrl || activeMediaMessage.videoUrl;
    };

    const getActiveMediaType = () => {
        if (!activeMediaMessage) return 'image';
        if (activeMediaMessage.type === 'video' || activeMediaMessage.videoUrl || activeMediaMessage.fileType?.startsWith('video/')) return 'video';
        return 'image';
    };

    const { getFriendStatus } = useFriend();
    const friendStatus = otherUser.uid ? getFriendStatus(otherUser.uid) : 'none';
    const canMessage = otherUser.isGroup || friendStatus === 'friend' || otherUser.isGemini;

    const handleShowInfo = useCallback(() => setShowContactInfo(true), []);
    const handleToggleSearch = useCallback(() => setShowSearch(prev => !prev), []);

    if (!chat) {
        return (
            <div className="hidden md:flex flex-col items-center justify-center h-full bg-surface-elevated relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-md p-10 z-10"
                >
                    <div className="relative mb-10 inline-block">
                        <img src="https://static.whatsapp.net/rsrc.php/v3/y6/r/wa669ae5y9Z.png" alt="WhatsApp Web" className="w-72 mx-auto opacity-80 drop-shadow-2xl" />
                        <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl -z-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-text-1 mb-4 tracking-tight">WhatsClone Web</h1>
                    <p className="text-text-2 text-[15px] leading-relaxed mb-8">
                        Experience the next generation of messaging. Secure, fast, and beautifully designed for your desktop.
                    </p>
                    <Button
                        className="rounded-full px-8 shadow-premium"
                        onClick={() => navigate('/contacts')}
                    >
                        Start a conversation
                    </Button>
                </motion.div>

                <div className="absolute bottom-10 text-text-2/40 text-xs flex items-center gap-2 font-medium">
                    <span className="text-primary/60">🔒</span> End-to-end encrypted
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-primary/30" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />

            <ChatHeader
                otherUser={otherUser}
                presence={presence}
                getStatusText={getStatusText}
                startCall={startCall}
                chat={chat}
                onBack={handleBack}
                onShowInfo={handleShowInfo}
                onToggleSearch={handleToggleSearch}
                showSearch={showSearch}
                onDeleteChat={handleDeleteChat}
                canMessage={canMessage}
            />

            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        key="search-bar"
                        className="glass px-3 py-2 md:px-4 md:py-3 border-b border-border/30 flex items-center gap-2 md:gap-3 z-30 shadow-sm"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <div className="flex-1 bg-surface flex items-center px-3 md:px-4 rounded-xl shadow-sm border border-border/50 transition-all focus-within:border-primary/30">
                            <FaSearch className="text-text-2 text-sm mr-2 md:mr-3" />
                            <input
                                type="text"
                                name="search-messages"
                                id="search-messages"
                                placeholder="Filter messages..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full py-2 md:py-2.5 bg-transparent border-none focus:outline-none text-base text-text-1 placeholder:text-text-2/50"
                                autoFocus
                            />
                            {searchQuery && (
                                <div className="flex items-center">
                                    <button
                                        onClick={handleServerSearch}
                                        className="mr-2 text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition-colors whitespace-nowrap"
                                    >
                                        Search Server
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setSearchQuery("")}
                                        className="h-8 w-8 rounded-full hover:bg-surface-elevated"
                                    >
                                        <FaTimes className="text-text-2" />
                                    </Button>
                                </div>
                            )}
                        </div>
                        <Button variant="ghost" onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-primary font-bold px-3">
                            Done
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex-1 flex flex-col relative min-h-0" id="message-container">
                {hasMoreMessages && !loading && (
                    <div className="flex justify-center p-2 z-10">
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingHistory}
                            className="text-xs bg-surface-elevated text-text-2 px-3 py-1 rounded-full shadow-sm hover:bg-surface border border-border/10 transition-colors disabled:opacity-50"
                        >
                            {loadingHistory ? "Loading..." : "Load Older Messages"}
                        </button>
                    </div>
                )}

                <MessageList
                    messages={filteredMessages}
                    chat={chat}
                    currentUser={currentUser}
                    handleDelete={handleDelete}
                    handleReact={handleReact}
                    setReplyTo={setReplyTo}
                    inputRef={inputRef}
                    messagesEndRef={messagesEndRef}
                    loading={loading}
                    onMediaClick={handleMediaClick}
                />
            </div>

            {!canMessage ? (
                <div className="p-4 bg-surface-elevated border-t border-border/30 text-center">
                    <p className="text-text-2 text-sm">
                        You are not friends with this user. <br className="sm:hidden" />
                        <button onClick={() => setShowContactInfo(true)} className="text-primary font-bold hover:underline">
                            Add to contacts
                        </button> to send messages.
                    </p>
                </div>
            ) : (
                <MessageInput
                    newMessage={newMessage}
                    setNewMessage={setNewMessage}
                    handleInputChange={handleInputChange}
                    handleSendMessage={handleSendMessage}
                    handleFileUpload={handleFileUpload}
                    replyTo={replyTo}
                    setReplyTo={setReplyTo}
                    inputRef={inputRef}
                    chat={chat}
                    otherUser={otherUser}
                    messages={filteredMessages}
                />
            )}

            <AnimatePresence>
                {showContactInfo && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="absolute top-0 right-0 h-full w-full md:w-[420px] z-[100] bg-surface border-l border-border/50 shadow-2xl"
                    >
                        <ContactInfoPanel user={otherUser} chat={chat} isOpen={true} onClose={() => setShowContactInfo(false)} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Media Viewer */}
            {activeMediaMessage && (
                <FullScreenMedia
                    src={getActiveMediaSrc()}
                    type={getActiveMediaType()}
                    fileName={activeMediaMessage.fileName}
                    onClose={() => setActiveMediaMessage(null)}
                    onNext={handleNextMedia}
                    onPrev={handlePrevMedia}
                    hasNext={activeMediaIndex < mediaMessages.length - 1}
                    hasPrev={activeMediaIndex > 0}
                />
            )}
        </div>
    );
}
