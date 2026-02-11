import React, { useState, useEffect } from 'react';
import { summarizeChat } from '../services/AIAgentService';
import { FaTimes, FaBell, FaBellSlash, FaTrash, FaChevronRight, FaStar, FaShieldAlt, FaFileAlt, FaExternalLinkAlt, FaEnvelope, FaBan, FaArrowLeft, FaPhone } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, deleteDoc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { clearChat, toggleMuteChat } from '../services/chatService';
import { blockUser, unblockUser } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

export default function ContactInfoPanel({ user, chat, onClose, isOpen }) {
    const { currentUser } = useAuth();
    const [mediaItems, setMediaItems] = useState({ media: [], links: [], docs: [] });
    const [showMediaTabs, setShowMediaTabs] = useState(false);
    const [mediaTab, setMediaTab] = useState('media');

    // State for full user profile (to get email/about if missing in props)
    const [fullUser, setFullUser] = useState(user);
    const [showFullProfilePic, setShowFullProfilePic] = useState(false);

    useEffect(() => {
        setFullUser(user); // Reset on prop change

        async function fetchFullProfile() {
            if (user?.uid && !user.isGroup) {
                // If email is missing, we definitely need to fetch. 
                // Even if not, it's good to get the latest 'about' status.
                try {
                    const userDoc = await getDoc(doc(db, "users", user.uid));
                    if (userDoc.exists()) {
                        setFullUser(prev => ({ ...prev, ...userDoc.data() }));
                    }
                } catch (e) {
                    console.error("Failed to fetch full user profile", e);
                }
            }
        }
        fetchFullProfile();
    }, [user]);

    const isMuted = chat?.mutedBy?.[currentUser?.uid] || false;

    const [allMessages, setAllMessages] = useState([]);
    const [summary, setSummary] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);

    useEffect(() => {
        if (!chat?.id) return;

        const q = query(
            collection(db, "chats", chat.id, "messages"),
            orderBy("timestamp", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = { media: [], links: [], docs: [] };
            const msgs = [];
            const urlRegex = /(https?:\/\/[^\s]+)/g;

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                msgs.push(data);
                if (data.type === 'image' || data.type === 'video') {
                    items.media.push({ id: doc.id, ...data });
                } else if (data.mediaType === 'file' || data.type === 'file' || data.type === 'pdf') {
                    items.docs.push({ id: doc.id, ...data });
                } else if (data.text && data.text.match(urlRegex)) {
                    const linksMatched = data.text.match(urlRegex);
                    linksMatched.forEach(link => {
                        items.links.push({ id: doc.id, url: link, ...data });
                    });
                }
            });
            setMediaItems(items);
            setAllMessages(msgs);
        }, (error) => {
            console.error("Error subscribing to contact info messages:", error);
        });

        return unsubscribe;
    }, [chat?.id, isOpen]);

    const handleSummarize = async () => {
        if (allMessages.length === 0) return;
        setIsSummarizing(true);
        try {
            const result = await summarizeChat(allMessages);
            setSummary(result);
        } catch (err) {
            console.error("Summarization failed:", err);
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleToggleMute = async () => {
        try {
            await toggleMuteChat(chat.id, currentUser.uid, isMuted);
        } catch (err) {
            console.error("Mute toggle failed:", err);
        }
    };

    const handleClearChat = async () => {
        if (window.confirm("Are you sure you want to clear all messages in this chat for you?")) {
            try {
                await clearChat(chat.id, currentUser.uid);
                onClose();
            } catch (err) {
                console.error("Error clearing chat:", err);
            }
        }
    };

    const isBlocked = currentUser?.blockedUsers?.includes(user?.uid);

    const handleBlockToggle = async () => {
        if (!user?.uid || !currentUser?.uid) return;
        const action = isBlocked ? "unblock" : "block";
        if (window.confirm(`Are you sure you want to ${action} this user?`)) {
            try {
                if (isBlocked) {
                    await unblockUser(currentUser.uid, user.uid);
                } else {
                    await blockUser(currentUser.uid, user.uid);
                }
            } catch (err) {
                console.error(`Failed to ${action} user:`, err);
                alert(`Failed to ${action} user. Please try again.`);
            }
        }
    };

    const handleDeleteChat = async () => {
        if (window.confirm("Are you sure you want to delete this chat permanently?")) {
            try {
                const messagesRef = collection(db, "chats", chat.id, "messages");
                const snapshot = await getDocs(messagesRef);
                const batch = writeBatch(db);
                snapshot.docs.forEach((mDoc) => batch.delete(mDoc.ref));
                await batch.commit();
                await deleteDoc(doc(db, "chats", chat.id));
                onClose();
            } catch (err) {
                console.error("Error deleting chat:", err);
            }
        }
    };

    if (!user || !fullUser) return null;

    const totalCount = mediaItems.media.length + mediaItems.links.length + mediaItems.docs.length;

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <>
                    {/* Mobile Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="lg:hidden fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        key="contact-panel"
                        // Responsive Layout: Full screen fixed on mobile (z-[70]), Sidebar on desktop
                        className="fixed inset-0 lg:static lg:h-full lg:w-[400px] flex flex-col bg-surface/95 backdrop-blur-xl border-l border-border/50 z-[70] shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="min-h-[70px] px-4 pt-4 lg:pt-0 flex items-center gap-4 bg-surface-elevated/50 border-b border-border/50 shrink-0">
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-10 w-10 text-text-2 hover:text-text-1 rounded-full bg-surface-elevated/50">
                                <FaTimes className="text-xl" />
                            </Button>
                            <h3 className="text-[17px] font-semibold text-text-1 pt-1">Contact Info</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* Hero Profile Section */}
                            <div className="bg-surface-elevated/30 pb-6 pt-10 flex flex-col items-center border-b border-border/30">
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="relative group cursor-pointer mb-5"
                                    onClick={() => setShowFullProfilePic(true)}
                                >
                                    <Avatar
                                        src={fullUser.photoURL}
                                        alt={fullUser.displayName}
                                        size="xl"
                                        className="w-40 h-40 ring-4 ring-surface shadow-2xl group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <FaExternalLinkAlt className="text-white drop-shadow-md" />
                                    </div>
                                </motion.div>
                                <h2 className="text-[24px] font-bold text-text-1 mb-1 text-center">{fullUser.displayName || 'Unknown User'}</h2>
                                <p className="text-text-2 text-[16px]">{fullUser.phoneNumber || ''}</p>
                            </div>

                            <div className="p-2 space-y-2">
                                {/* Email & About Section */}
                                <div className="bg-surface-elevated/50 rounded-2xl p-4 shadow-sm border border-border/30">
                                    <div className="mb-4">
                                        <h4 className="text-[13px] font-medium text-text-2 mb-1">
                                            {fullUser.email ? 'Email' : 'Phone'}
                                        </h4>
                                        <div className="text-[16px] text-text-1 flex items-center gap-3">
                                            <span>{fullUser.email || fullUser.phoneNumber || 'No contact info'}</span>
                                            {fullUser.email ? <FaEnvelope className="text-text-2 text-xs" /> : <FaPhone className="text-text-2 text-xs" />}
                                        </div>
                                    </div>

                                    <div className="h-px bg-border/30 my-3" />

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className="text-[13px] font-medium text-text-2">About</h4>
                                            {!isSummarizing && allMessages.length > 0 && (
                                                <button
                                                    onClick={handleSummarize}
                                                    className="text-[10px] text-primary hover:underline font-bold uppercase tracking-wider"
                                                >
                                                    {summary ? 'Re-analyze' : 'AI Summary'}
                                                </button>
                                            )}
                                        </div>

                                        {isSummarizing ? (
                                            <div className="text-xs text-primary animate-pulse py-2">Generating insights...</div>
                                        ) : summary ? (
                                            <div className="bg-primary/5 rounded-lg p-3 border border-primary/10 mt-2 relative group">
                                                <button onClick={() => setSummary('')} className="absolute top-2 right-2 text-text-2 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <FaTimes size={10} />
                                                </button>
                                                <div className="prose prose-sm dark:prose-invert text-[13px] leading-relaxed text-text-1">
                                                    {summary}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-[15px] text-text-1 leading-relaxed">{fullUser.about || 'Hey there! I am using WhatsClone.'}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Media Section */}
                                <button
                                    className="w-full bg-surface-elevated/50 rounded-2xl p-4 shadow-sm border border-border/30 hover:bg-surface-elevated/80 transition-all flex items-center justify-between group"
                                    onClick={() => setShowMediaTabs(true)}
                                >
                                    <div className="flex flex-col items-start gap-2">
                                        <span className="text-[15px] font-medium text-text-1">Media, links and docs</span>
                                        <span className="text-[13px] text-text-2">{totalCount} items</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex -space-x-2 mr-2">
                                            {mediaItems.media.slice(0, 3).map(m => (
                                                <div key={m.id} className="w-10 h-10 rounded-lg border-2 border-surface overflow-hidden bg-black/20">
                                                    {m.type === 'image' ? <img src={m.mediaUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-800" />}
                                                </div>
                                            ))}
                                        </div>
                                        <FaChevronRight className="text-text-2 text-xs group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </button>

                                {/* Actions */}
                                <div className="bg-surface-elevated/50 rounded-2xl overflow-hidden shadow-sm border border-border/30">
                                    <button className="w-full flex items-center justify-between p-4 hover:bg-surface-elevated transition-colors border-b border-border/30">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-text-2">
                                                <FaStar />
                                            </div>
                                            <span className="text-text-1 text-[15px]">Starred Messages</span>
                                        </div>
                                        <FaChevronRight className="text-text-2 text-xs" />
                                    </button>

                                    <button className="w-full flex items-center justify-between p-4 hover:bg-surface-elevated transition-colors border-b border-border/30" onClick={handleToggleMute}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-text-2">
                                                {isMuted ? <FaBellSlash /> : <FaBell />}
                                            </div>
                                            <span className="text-text-1 text-[15px]">{isMuted ? 'Unmute' : 'Mute'} notifications</span>
                                        </div>
                                        <div className={cn("w-9 h-5 rounded-full relative transition-colors", isMuted ? "bg-primary" : "bg-border")}>
                                            <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm", isMuted ? "left-5" : "left-0.5")} />
                                        </div>
                                    </button>

                                    <button className="w-full flex items-center gap-4 p-4 hover:bg-red-500/10 transition-colors text-red-500 border-b border-border/30 group" onClick={handleClearChat}>
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                            <FaTrash />
                                        </div>
                                        <span className="text-[15px] font-medium">Clear Chat</span>
                                    </button>

                                    <button className="w-full flex items-center gap-4 p-4 hover:bg-red-500/10 transition-colors text-red-500 group" onClick={handleBlockToggle}>
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                            <FaBan />
                                        </div>
                                        <span className="text-[15px] font-medium">{isBlocked ? 'Unblock User' : 'Block User'}</span>
                                    </button>

                                    <button className="w-full flex items-center gap-4 p-4 hover:bg-red-500/10 transition-colors text-red-500 group" onClick={handleDeleteChat}>
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                            <FaTrash />
                                        </div>
                                        <span className="text-[15px] font-medium">Delete Chat</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Media Tabs Slide-over (Nested) */}
                        <AnimatePresence>
                            {showMediaTabs && (
                                <motion.div
                                    initial={{ x: '100%' }}
                                    animate={{ x: 0 }}
                                    exit={{ x: '100%' }}
                                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                    className="absolute inset-0 bg-surface z-50 flex flex-col"
                                >
                                    <div className="h-16 px-4 flex items-center gap-4 bg-surface-elevated/80 backdrop-blur-md border-b border-border/50 shrink-0">
                                        <Button variant="ghost" size="icon" onClick={() => setShowMediaTabs(false)} className="text-text-2 hover:text-text-1">
                                            <FaArrowLeft />
                                        </Button>
                                        <h3 className="text-[16px] font-medium text-text-1">Media</h3>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-border/30 bg-surface shrink-0">
                                        {['Media', 'Docs', 'Links'].map(tab => {
                                            const active = mediaTab === tab.toLowerCase();
                                            return (
                                                <button
                                                    key={tab}
                                                    onClick={() => setMediaTab(tab.toLowerCase())}
                                                    className={cn(
                                                        "flex-1 py-3 text-[14px] font-medium transition-colors relative",
                                                        active ? "text-primary" : "text-text-2 hover:bg-surface-elevated"
                                                    )}
                                                >
                                                    {tab}
                                                    {active && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full" />}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto p-2">
                                        {mediaTab === 'media' && (
                                            <div className="grid grid-cols-3 gap-1">
                                                {mediaItems.media.map(item => (
                                                    <div key={item.id} className="aspect-square bg-surface rounded-lg overflow-hidden relative cursor-pointer" onClick={() => window.open(item.mediaUrl)}>
                                                        {item.type === 'image' ? <img src={item.mediaUrl} className="w-full h-full object-cover" /> : <video src={item.mediaUrl} className="w-full h-full object-cover" />}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Simplified others for brevity */}
                                        {mediaTab === 'docs' && (
                                            <div className="flex flex-col gap-2">
                                                {mediaItems.docs.map(item => (
                                                    <a key={item.id} href={item.mediaUrl} target="_blank" className="flex items-center gap-3 p-3 bg-surface-elevated rounded-xl border border-border/30">
                                                        <div className="w-10 h-10 bg-red-500/10 text-red-500 rounded-lg flex items-center justify-center"><FaFileAlt /></div>
                                                        <div className="overflow-hidden">
                                                            <div className="truncate text-sm font-medium">{item.fileName || 'Document'}</div>
                                                            <div className="text-xs text-text-2">{format(item.timestamp?.toDate() || new Date(), 'MMM dd, yyyy')}</div>
                                                        </div>
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {mediaTab === 'links' && (
                                            <div className="flex flex-col gap-2">
                                                {mediaItems.links.map((item, i) => (
                                                    <a key={i} href={item.url} target="_blank" className="p-3 bg-surface-elevated rounded-xl border border-border/30 block break-all text-blue-400 text-sm">{item.url}</a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* Full Screen Profile Pic Modal */}
                    <AnimatePresence>
                        {showFullProfilePic && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                                onClick={() => setShowFullProfilePic(false)}
                            >
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <img
                                        src={fullUser.photoURL || 'https://via.placeholder.com/400'}
                                        alt={fullUser.displayName}
                                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                    />
                                    <div className="absolute top-0 right-0 p-4">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setShowFullProfilePic(false)}
                                            className="text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full"
                                        >
                                            <FaTimes className="text-2xl" />
                                        </Button>
                                    </div>
                                    <div className="absolute bottom-4 text-center w-full">
                                        <h2 className="text-xl font-bold text-white shadow-black drop-shadow-lg">{fullUser.displayName}</h2>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </AnimatePresence>
    );
}
