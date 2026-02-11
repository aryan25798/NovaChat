import React, { useState, useEffect } from 'react';
import { summarizeChat } from '../services/AIAgentService';
import { FaTimes, FaBell, FaBellSlash, FaTrash, FaChevronRight, FaStar, FaShieldAlt, FaFileAlt, FaExternalLinkAlt, FaEnvelope, FaBan, FaArrowLeft, FaPhone, FaUserMinus, FaUserPlus, FaUserClock, FaUserCheck, FaSignOutAlt, FaCrown, FaSearch } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { db, storage } from '../firebase';
import { collection, query, onSnapshot, orderBy, doc, deleteDoc, writeBatch, getDocs, getDoc } from 'firebase/firestore';
import { ref, deleteObject } from "firebase/storage";
import { listenerManager } from '../utils/ListenerManager';
import { clearChat, toggleMuteChat } from '../services/chatService';
import { blockUser, unblockUser } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { useFriend } from '../contexts/FriendContext';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { exitGroup, removeGroupParticipant, promoteToAdmin, dismissAdmin } from '../services/groupService';

export default function ContactInfoPanel({ user, chat, onClose, isOpen }) {
    const { currentUser } = useAuth();
    const { getFriendStatus, unfriend, sendRequest, cancelRequest, acceptRequest, incomingRequests, outgoingRequests, actionLoading } = useFriend();
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

        const listenerKey = `contact-info-${chat.id}`;

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
            listenerManager.handleListenerError(error, 'ContactInfoMessages');
        });

        listenerManager.subscribe(listenerKey, unsubscribe);

        return () => {
            listenerManager.unsubscribe(listenerKey);
        };
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
    const friendStatus = user?.uid ? getFriendStatus(user.uid) : 'none';

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

    const handleFriendAction = async () => {
        if (!user?.uid || actionLoading) return;
        try {
            if (friendStatus === 'friend') {
                if (window.confirm(`Remove ${fullUser.displayName || 'this user'} from your friends?`)) {
                    await unfriend(user.uid);
                }
            } else if (friendStatus === 'sent') {
                const outReq = outgoingRequests.find(r => r.to === user.uid);
                if (outReq) await cancelRequest(outReq.id);
            } else if (friendStatus === 'received') {
                const inReq = incomingRequests.find(r => r.from === user.uid);
                if (inReq) await acceptRequest(inReq);
            } else {
                await sendRequest(user.uid);
            }
        } catch (err) {
            alert(err.message || 'Action failed. Please try again.');
        }
    };

    const friendButtonConfig = {
        friend: { icon: FaUserMinus, label: 'Unfriend', color: 'text-orange-500', bg: 'bg-orange-500/10', hoverBg: 'hover:bg-orange-500/20' },
        sent: { icon: FaUserClock, label: 'Cancel Request', color: 'text-yellow-500', bg: 'bg-yellow-500/10', hoverBg: 'hover:bg-yellow-500/20' },
        received: { icon: FaUserCheck, label: 'Accept Request', color: 'text-green-500', bg: 'bg-green-500/10', hoverBg: 'hover:bg-green-500/20' },
        none: { icon: FaUserPlus, label: 'Add Friend', color: 'text-blue-500', bg: 'bg-blue-500/10', hoverBg: 'hover:bg-blue-500/20' }
    };
    const friendBtn = friendButtonConfig[friendStatus] || friendButtonConfig.none;

    const isGroup = user.isGroup;
    const amIAdmin = isGroup && chat?.chatRole?.[currentUser.uid] === 'admin';

    const handleExitGroup = async () => {
        if (window.confirm("Are you sure you want to exit this group?")) {
            try {
                await exitGroup(chat.id, currentUser.uid);
                onClose(); // Close panel since we left
            } catch (err) {
                console.error("Failed to exit group:", err);
                alert("Failed to exit group.");
            }
        }
    };

    const handleRemoveUser = async (targetId) => {
        if (!window.confirm("Remove this participant?")) return;
        try {
            await removeGroupParticipant(chat.id, currentUser.uid, targetId);
        } catch (err) {
            console.error(err);
        }
    };

    const handlePromote = async (targetId) => {
        try {
            await promoteToAdmin(chat.id, currentUser.uid, targetId);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDismiss = async (targetId) => {
        try {
            await dismissAdmin(chat.id, currentUser.uid, targetId);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteChat = async () => {
        if (window.confirm("⚠️ NUKE WARNING: This will permanently delete this chat and ALL media files for everyone. This action cannot be undone. Are you sure?")) {
            try {
                const messagesRef = collection(db, "chats", chat.id, "messages");
                const snapshot = await getDocs(messagesRef);

                // 1. Delete All Storage Files (Cleanup Orphans)
                const storagePromises = snapshot.docs.map(async (doc) => {
                    const data = doc.data();
                    const url = data.fileUrl || data.imageUrl || data.videoUrl || data.audioUrl;
                    if (url) {
                        try {
                            const fileRef = ref(storage, url);
                            await deleteObject(fileRef);
                            console.log("Nuked file:", url);
                        } catch (e) {
                            console.warn("Failed to nuke file (already gone?):", e);
                        }
                    }
                });
                await Promise.all(storagePromises);

                // 2. Delete All Messages from Firestore
                const batch = writeBatch(db);
                snapshot.docs.forEach((mDoc) => batch.delete(mDoc.ref));
                await batch.commit();

                // 3. Delete Chat Document
                await deleteDoc(doc(db, "chats", chat.id));
                onClose();
            } catch (err) {
                console.error("Error nuke-deleting chat:", err);
                alert("Failed to delete chat completely. Check console.");
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
                        className="fixed inset-0 lg:static lg:h-full lg:w-[340px] xl:w-[400px] flex flex-col bg-surface/95 backdrop-blur-xl border-l border-border/50 z-[70] shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header — safe area for mobile notch */}
                        <div className="min-h-[56px] sm:min-h-[70px] px-3 sm:px-4 pt-[env(safe-area-inset-top,16px)] lg:pt-0 flex items-center gap-3 sm:gap-4 bg-surface-elevated/50 border-b border-border/50 shrink-0">
                            <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 sm:h-10 sm:w-10 text-text-2 hover:text-text-1 rounded-full bg-surface-elevated/50">
                                <FaTimes className="text-lg sm:text-xl" />
                            </Button>
                            <h3 className="text-[15px] sm:text-[17px] font-semibold text-text-1">Contact Info</h3>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* Hero Profile Section */}
                            <div className="bg-surface-elevated/30 pb-5 sm:pb-6 pt-6 sm:pt-10 flex flex-col items-center border-b border-border/30 px-4">
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="relative group cursor-pointer mb-4 sm:mb-5"
                                    onClick={() => setShowFullProfilePic(true)}
                                >
                                    <Avatar
                                        src={fullUser.photoURL}
                                        alt={fullUser.displayName}
                                        size="xl"
                                        className="w-28 h-28 sm:w-40 sm:h-40 ring-4 ring-surface shadow-2xl group-hover:scale-105 transition-transform duration-300"
                                    />
                                    <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <FaExternalLinkAlt className="text-white drop-shadow-md" />
                                    </div>
                                </motion.div>
                                <h2 className="text-[20px] sm:text-[24px] font-bold text-text-1 mb-1 text-center truncate max-w-full">{fullUser.displayName || 'Unknown User'}</h2>
                                <p className="text-text-2 text-[14px] sm:text-[16px]">{fullUser.phoneNumber || ''}</p>
                            </div>

                            <div className="p-2 space-y-2 pb-[env(safe-area-inset-bottom,8px)]">
                                {/* Privacy: Only show details if friends, group, or self */}
                                {(friendStatus === 'friend' || user.isGroup || user.uid === currentUser?.uid) ? (
                                    <>
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
                                    </>
                                ) : (
                                    <div className="bg-surface-elevated/30 rounded-2xl p-6 text-center border border-border/30">
                                        <FaShieldAlt className="w-8 h-8 mx-auto text-text-2/50 mb-3" />
                                        <p className="text-text-2 text-sm">Add this user to contacts to see their info and media.</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="bg-surface-elevated/50 rounded-2xl overflow-hidden shadow-sm border border-border/30">
                                    {/* Friend Action Button */}
                                    {user?.uid && user.uid !== currentUser?.uid && !user.isGroup && (
                                        <button
                                            className={cn(
                                                "w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 transition-colors border-b border-border/30 group",
                                                friendBtn.color, friendBtn.hoverBg
                                            )}
                                            onClick={handleFriendAction}
                                            disabled={!!actionLoading}
                                        >
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                                                friendBtn.bg, `group-hover:${friendBtn.bg}`
                                            )}>
                                                {actionLoading ? (
                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <friendBtn.icon />
                                                )}
                                            </div>
                                            <span className="text-[14px] sm:text-[15px] font-medium">{friendBtn.label}</span>
                                        </button>
                                    )}

                                    <button className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-surface-elevated transition-colors border-b border-border/30">
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-text-2">
                                                <FaStar />
                                            </div>
                                            <span className="text-text-1 text-[14px] sm:text-[15px]">Starred Messages</span>
                                        </div>
                                        <FaChevronRight className="text-text-2 text-xs" />
                                    </button>

                                    <button className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-surface-elevated transition-colors border-b border-border/30" onClick={handleToggleMute}>
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-text-2">
                                                {isMuted ? <FaBellSlash /> : <FaBell />}
                                            </div>
                                            <span className="text-text-1 text-[14px] sm:text-[15px]">{isMuted ? 'Unmute' : 'Mute'} notifications</span>
                                        </div>
                                        <div className={cn("w-9 h-5 rounded-full relative transition-colors", isMuted ? "bg-primary" : "bg-border")}>
                                            <div className={cn("w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm", isMuted ? "left-5" : "left-0.5")} />
                                        </div>
                                    </button>

                                    <button className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-red-500/10 transition-colors text-red-500 border-b border-border/30 group" onClick={handleClearChat}>
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                            <FaTrash />
                                        </div>
                                        <span className="text-[14px] sm:text-[15px] font-medium">Clear Chat</span>
                                    </button>

                                    <button className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-red-500/10 transition-colors text-red-500 border-b border-border/30 group" onClick={handleBlockToggle}>
                                        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                            <FaBan />
                                        </div>
                                        <span className="text-[14px] sm:text-[15px] font-medium">{isBlocked ? 'Unblock User' : 'Block User'}</span>
                                    </button>

                                    {!isGroup && (
                                        <button className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-red-500/10 transition-colors text-red-500 group" onClick={handleDeleteChat}>
                                            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                                <FaTrash />
                                            </div>
                                            <span className="text-[14px] sm:text-[15px] font-medium">Delete Chat</span>
                                        </button>
                                    )}
                                </div>

                                {/* Group Specific Actions */}
                                {isGroup && (
                                    <>
                                        {/* Participants List */}
                                        <div className="bg-surface-elevated/50 rounded-2xl p-4 shadow-sm border border-border/30 mt-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-[13px] font-medium text-text-2">{chat.participants?.length || 0} participants</h4>
                                                <FaSearch className="text-text-2 text-xs" />
                                            </div>

                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-3">
                                                {chat.participants?.map(uid => {
                                                    const pInfo = chat.participantInfo?.[uid] || {};
                                                    const pRole = chat.chatRole?.[uid] || 'member';
                                                    const isMe = uid === currentUser.uid;
                                                    const pName = isMe ? "You" : (pInfo.displayName || "Unknown");

                                                    return (
                                                        <div key={uid} className="flex items-center gap-3 group relative">
                                                            <Avatar src={pInfo.photoURL} alt={pName} size="md" className="w-10 h-10" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex justify-between items-center">
                                                                    <h5 className="text-[14px] font-medium text-text-1 truncate">{pName}</h5>
                                                                    {pRole === 'admin' && (
                                                                        <span className="text-[10px] text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded ml-2">Group Admin</span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[12px] text-text-2 truncate">{pInfo.about || "Hey there! I am using WhatsClone."}</p>
                                                            </div>

                                                            {/* Admin Actions Overlay */}
                                                            {amIAdmin && !isMe && (
                                                                <div className="absolute right-0 top-0 bottom-0 bg-surface-elevated/95 px-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-l-lg shadow-sm border-l border-border/50">
                                                                    {pRole !== 'admin' ? (
                                                                        <button
                                                                            onClick={() => handlePromote(uid)}
                                                                            className="text-[10px] bg-green-500/10 text-green-600 px-2 py-1 rounded hover:bg-green-500/20"
                                                                            title="Make Group Admin"
                                                                        >
                                                                            Make Admin
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleDismiss(uid)}
                                                                            className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2 py-1 rounded hover:bg-yellow-500/20"
                                                                            title="Dismiss as Admin"
                                                                        >
                                                                            Dismiss
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => handleRemoveUser(uid)}
                                                                        className="text-[10px] bg-red-500/10 text-red-600 px-2 py-1 rounded hover:bg-red-500/20"
                                                                        title="Remove from Group"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <button className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-red-500/10 transition-colors text-red-500 border-b border-border/30 group mt-4 rounded-2xl bg-surface-elevated/50 shadow-sm border-t border-border/30" onClick={handleExitGroup}>
                                            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                                <FaSignOutAlt className="ml-0.5" />
                                            </div>
                                            <span className="text-[14px] sm:text-[15px] font-medium">Exit Group</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>

                    {/* Media Tabs Slide-over */}
                    <AnimatePresence>
                        {showMediaTabs && (
                            <motion.div
                                initial={{ x: '100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed inset-0 lg:static z-[80] lg:z-10 flex flex-col bg-surface overflow-hidden"
                            >
                                <div className="h-16 px-4 flex items-center gap-4 bg-surface-elevated/80 backdrop-blur-md border-b border-border/50 shrink-0">
                                    <Button variant="ghost" size="icon" onClick={() => setShowMediaTabs(false)} className="text-text-2 hover:text-text-1">
                                        <FaArrowLeft />
                                    </Button>
                                    <h3 className="text-[16px] font-medium text-text-1">Media</h3>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4">
                                    <div className="flex gap-4 border-b border-border/30 mb-4">
                                        {['media', 'docs', 'links'].map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setMediaTab(tab)}
                                                className={cn(
                                                    "pb-2 text-sm font-medium capitalize transition-colors relative",
                                                    mediaTab === tab ? "text-primary" : "text-text-2 hover:text-text-1"
                                                )}
                                            >
                                                {tab}
                                                {mediaTab === tab && (
                                                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {mediaTab === 'media' && (
                                        <div className="grid grid-cols-3 gap-2">
                                            {mediaItems.media.map(m => (
                                                <div key={m.id} className="aspect-square relative group overflow-hidden rounded-lg bg-surface-elevated">
                                                    {m.type === 'video' ? (
                                                        <video src={m.videoUrl || m.fileUrl} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img src={m.mediaUrl || m.imageUrl || m.fileUrl} alt="media" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                            ))}
                                            {mediaItems.media.length === 0 && <p className="text-text-2 text-sm col-span-3 text-center py-8">No media shared</p>}
                                        </div>
                                    )}

                                    {mediaTab === 'docs' && (
                                        <div className="space-y-2">
                                            {mediaItems.docs.map(m => (
                                                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-elevated/50 border border-border/30">
                                                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                                                        <FaFileAlt />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-text-1 truncate">{m.fileName || 'Document'}</p>
                                                        <p className="text-xs text-text-2">{m.fileSize ? (m.fileSize / 1024).toFixed(1) + ' KB' : 'Unknown size'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {mediaItems.docs.length === 0 && <p className="text-text-2 text-sm text-center py-8">No documents shared</p>}
                                        </div>
                                    )}

                                    {mediaTab === 'links' && (
                                        <div className="space-y-2">
                                            {mediaItems.links.map(m => (
                                                <div key={m.id} className="p-3 rounded-lg bg-surface-elevated/50 border border-border/30">
                                                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline break-all block">
                                                        {m.url}
                                                    </a>
                                                    <p className="text-xs text-text-2 mt-1">{format(m.timestamp?.toDate ? m.timestamp.toDate() : new Date(), 'MMM d, yyyy')}</p>
                                                </div>
                                            ))}
                                            {mediaItems.links.length === 0 && <p className="text-text-2 text-sm text-center py-8">No links shared</p>}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

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
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </AnimatePresence>
    );
}
