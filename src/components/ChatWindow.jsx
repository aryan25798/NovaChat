import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FaTimes, FaSearch, FaVideo, FaPhone, FaEllipsisV } from "react-icons/fa";
import { GEMINI_BOT_ID } from "../constants";

// ... existing imports ...

import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useNavigate } from "react-router-dom";
import { subscribeToMessages, sendMessage, sendMediaMessage, deleteMessage, addReaction, searchMessages, clearChat, hideChat } from "../services/chatService";
import { setTypingStatus, subscribeToTypingStatus } from "../services/typingService";
import { usePresence } from "../contexts/PresenceContext";
import { motion, AnimatePresence } from "framer-motion";
import { useFileUpload } from "../contexts/FileUploadContext";
import { getDownloadURL } from "firebase/storage";

import { useFriend } from "../contexts/FriendContext";

// Modular Components
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import ContactInfoPanel from "./ContactInfoPanel";
import FullScreenMedia from "./FullScreenMedia";

export default function ChatWindow({ chat, setChat }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [typingUsers, setTypingUsers] = useState({});
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [messageLimit, setMessageLimit] = useState(50);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [serverResults, setServerResults] = useState([]);

    // Media Gallery State
    const [activeMediaMessage, setActiveMediaMessage] = useState(null);

    const { currentUser } = useAuth();
    const { startCall } = useCall();
    const { getUserPresence } = usePresence();
    const navigate = useNavigate();


    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const typingTimeoutRef = useRef(null);



    // Context & Presence
    const [presence, setPresence] = useState(null);
    const otherUid = chat?.participants?.find(uid => uid !== currentUser.uid);
    let otherUser = { uid: otherUid, displayName: 'User', photoURL: null };

    if (chat?.type === 'group') {
        otherUser = { displayName: chat.groupName, photoURL: chat.groupImage, isGroup: true };
    } else if (chat?.participantInfo && otherUid) {
        otherUser = { uid: otherUid, ...chat.participantInfo[otherUid] };
    }

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
        setTypingStatus(chat.id, currentUser.uid, true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            setTypingStatus(chat.id, currentUser.uid, false);
        }, 3000);
    }, [chat?.id, currentUser?.uid]);


    const handleSendMessage = useCallback(async (e) => {
        if (e) e.preventDefault();
        if ((newMessage.trim() === "" && !replyTo) || isSending) return;

        const textToSend = newMessage;
        const replyContext = replyTo;

        // Optimistic UI update
        const temporaryId = `temp-${Date.now()}`;
        const tempMsg = {
            id: temporaryId,
            text: textToSend,
            senderId: currentUser.uid,
            timestamp: { toDate: () => new Date() }, // Mock timestamp
            status: 'sending',
            replyTo: replyContext
        };

        setMessages(prev => [...prev, tempMsg]);
        setNewMessage("");
        setReplyTo(null);
        setIsSending(true);

        try {
            await sendMessage(chat.id, currentUser, textToSend, replyContext, chat.type);
            // The subscription will eventually replace the temp message with the real one
        } catch (err) {
            console.error("Failed to send message", err);
            // Remove temp message and restore input on failure
            setMessages(prev => prev.filter(m => m.id !== temporaryId));
            setNewMessage(textToSend);
            setReplyTo(replyContext);
        } finally {
            setIsSending(false);
        }
    }, [newMessage, replyTo, isSending, chat?.id, chat?.type, currentUser]);

    const { startUpload } = useFileUpload();

    // ... (existing code)

    const handleFileUpload = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Start resumable upload (await for compression)
            const { uploadTask } = await startUpload(file, `uploads/${chat.id}/${Date.now()}_${file.name}`);

            // Listen for completion to send DB message
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
            // First, hide the chat itself (removes from list)
            await hideChat(chat.id, currentUser.uid);
            // Second, set 'clearedAt' marker to hide history if user somehow re-enters the chat
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


    // ... (handlers)

    // Subscriptions
    useEffect(() => {
        if (!chat?.id || !currentUser?.uid) return;
        setLoading(true); // Reset loading when chat changes

        // Reset limit when chat changes
        // But we need to distinguish between chat change and limit change to avoid resetting limit on scroll
        // Actually, easier to let the dependency array handle it. 
        // We'll wrap the setLimit in a separate effect that depends on chat.id
    }, [chat?.id]);

    useEffect(() => {
        setMessageLimit(50);
    }, [chat?.id]);

    useEffect(() => {
        if (!chat?.id || !currentUser?.uid || chat.isGhost) return;

        const unsubscribe = subscribeToMessages(chat.id, currentUser.uid, (msgs) => {
            setMessages(msgs);
            setLoading(false);
            if (msgs.length < messageLimit) {
                setHasMoreMessages(false);
            } else {
                setHasMoreMessages(true);
            }
        }, true, messageLimit);

        return () => unsubscribe();
    }, [chat?.id, currentUser?.uid, messageLimit, chat?.isGhost]);

    useEffect(() => {
        // Only scroll to bottom if we are near bottom or it's initial load (limit 50)
        // For simplicity, we scroll to bottom on new message if near bottom.
        // But if we just loaded older messages (limit increased), we want to stay where we were?
        // That requires complex scroll management.
        // MVP: Scroll to bottom only if limit is 50. If limit > 50, user is scrolling up.
        if (messageLimit === 50) {
            scrollToBottom();
        }
    }, [messages, messageLimit]);

    useEffect(() => {
        if (!chat?.id || !currentUser?.uid || chat.isGhost) return;
        const unsubscribe = subscribeToTypingStatus(chat.id, currentUser.uid, (data) => {
            setTypingUsers(data);
        });
        return () => {
            unsubscribe();
            setTypingStatus(chat.id, currentUser.uid, false);
        };
    }, [chat?.id, currentUser?.uid, chat?.isGhost]);

    useEffect(() => {
        if (otherUid && !otherUser.isGroup) {
            const unsub = getUserPresence(otherUid, (data) => {
                setPresence(data);
            });
            return () => unsub();
        }
    }, [otherUid, otherUser.isGroup]);

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

    if (!chat) {
        return (
            <div className="hidden md:flex flex-col items-center justify-center h-full bg-surface-elevated relative overflow-hidden">
                {/* Decorative Background Elements */}
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
                    <Button className="rounded-full px-8 shadow-premium">Start a conversation</Button>
                </motion.div>

                <div className="absolute bottom-10 text-text-2/40 text-xs flex items-center gap-2 font-medium">
                    <span className="text-primary/60">🔒</span> End-to-end encrypted
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-primary/30" />
            </div>
        );
    }

    const handleServerSearch = useCallback(async () => {
        if (!searchQuery) return;
        setLoading(true);
        const results = await searchMessages(chat.id, searchQuery);
        setServerResults(results);
        setLoading(false);
    }, [searchQuery, chat?.id]);

    // Reset server results when search query is cleared
    useEffect(() => {
        if (!searchQuery) setServerResults([]);
    }, [searchQuery]);

    const filteredMessages = React.useMemo(() => {
        const clearedAt = chat?.clearedAt?.[currentUser.uid]?.toDate?.() || new Date(0);

        // 1. Filter local messages
        const localMatches = messages.filter(m => {
            const msgTime = m.timestamp?.toDate?.() || new Date();
            const matchesSearch = searchQuery ? m.text?.toLowerCase().includes(searchQuery.toLowerCase()) : true;
            const isHidden = m.hiddenBy?.includes(currentUser.uid);
            return msgTime > clearedAt && matchesSearch && !isHidden;
        });

        // 2. Merge with server results (deduplicate)
        if (serverResults.length > 0) {
            const combined = [...localMatches, ...serverResults];
            const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
            return unique.sort((a, b) => {
                const tA = a.timestamp?.toDate?.() || new Date(a.timestamp);
                const tB = b.timestamp?.toDate?.() || new Date(b.timestamp);
                return tA - tB;
            });
        }

        return localMatches;
    }, [messages, searchQuery, serverResults, chat, currentUser.uid]);

    // Media Gallery Logic
    const mediaMessages = React.useMemo(() => {
        return filteredMessages.filter(m => {
            // Check if it has media URL and correct type
            const hasUrl = m.mediaUrl || m.fileUrl || m.imageUrl || m.videoUrl;
            const isMedia = m.type === 'image' || m.type === 'video' || (m.fileType && (m.fileType.startsWith('image/') || m.fileType.startsWith('video/')));
            return hasUrl && isMedia;
        });
    }, [filteredMessages]);

    const handleMediaClick = (msg) => {
        setActiveMediaMessage(msg);
    };

    const handleNextMedia = () => {
        if (!activeMediaMessage) return;
        const currentIndex = mediaMessages.findIndex(m => m.id === activeMediaMessage.id);
        if (currentIndex < mediaMessages.length - 1) {
            setActiveMediaMessage(mediaMessages[currentIndex + 1]);
        }
    };

    const handlePrevMedia = () => {
        if (!activeMediaMessage) return;
        const currentIndex = mediaMessages.findIndex(m => m.id === activeMediaMessage.id);
        if (currentIndex > 0) {
            setActiveMediaMessage(mediaMessages[currentIndex - 1]);
        }
    };

    const activeMediaIndex = activeMediaMessage
        ? mediaMessages.findIndex(m => m.id === activeMediaMessage.id)
        : -1;

    const getActiveMediaSrc = () => {
        if (!activeMediaMessage) return null;
        return activeMediaMessage.mediaUrl || activeMediaMessage.fileUrl || activeMediaMessage.imageUrl || activeMediaMessage.videoUrl;
    };

    const getActiveMediaType = () => {
        if (!activeMediaMessage) return 'image';
        if (activeMediaMessage.type === 'video' || activeMediaMessage.videoUrl || activeMediaMessage.fileType?.startsWith('video/')) return 'video';
        return 'image';
    };

    // Friend Status Check
    const { getFriendStatus } = useFriend();
    const friendStatus = otherUser.uid ? getFriendStatus(otherUser.uid) : 'none';
    const canMessage = otherUser.isGroup || friendStatus === 'friend' || otherUser.isGemini;

    const handleShowInfo = useCallback(() => setShowContactInfo(true), []);
    const handleToggleSearch = useCallback(() => setShowSearch(prev => !prev), []);

    return (
        <div className="flex flex-col h-full bg-background relative overflow-hidden">
            {/* Background Pattern Layer */}
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
                        className="glass px-3 py-2 md:px-4 md:py-3 border-b border-border/30 flex items-center gap-2 md:gap-3 z-30 shadow-sm"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <div className="flex-1 bg-surface flex items-center px-3 md:px-4 rounded-xl shadow-sm border border-border/50 transition-all focus-within:border-primary/30">
                            <FaSearch className="text-text-2 text-sm mr-2 md:mr-3" />
                            <input
                                type="text"
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



            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col relative" id="message-container">
                {hasMoreMessages && !loading && (
                    <div className="flex justify-center p-2 z-10">
                        <button
                            onClick={() => setMessageLimit(prev => prev + 50)}
                            className="text-xs bg-surface-elevated text-text-2 px-3 py-1 rounded-full shadow-sm hover:bg-surface border border-border/10 transition-colors"
                        >
                            Load Older Messages
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
