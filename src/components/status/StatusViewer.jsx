import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IoClose, IoChevronBack, IoPaperPlane, IoVolumeMute, IoVolumeHigh, IoChevronUp } from "react-icons/io5";
import { FaEllipsisV } from "react-icons/fa";
import { Avatar } from "../ui/Avatar";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "../../contexts/AuthContext";
import { markStatusAsViewed, replyToStatus } from "../../services/statusService";

const StatusViewer = ({ statusGroup, onClose, allStatuses = [] }) => {
    const { currentUser } = useAuth();
    const [currentGroup, setCurrentGroup] = useState(statusGroup);

    // Sync if statusGroup prop changes
    useEffect(() => {
        setCurrentGroup(statusGroup);
    }, [statusGroup]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [showMenu, setShowMenu] = useState(false);
    const [muted, setMuted] = useState(false);

    const currentStatus = currentGroup?.statuses[currentIndex];

    // Mark as viewed
    useEffect(() => {
        if (!currentStatus || !currentUser) return;
        if (currentGroup.user.uid !== currentUser.uid) {
            markStatusAsViewed(
                currentGroup.id || currentGroup.user.uid,
                currentIndex,
                currentUser.uid,
                currentGroup.statuses,
                currentStatus.viewers
            );
        }
    }, [currentIndex, currentGroup, currentUser]);

    // Timer Logic
    useEffect(() => {
        if (!currentStatus || isPaused) return;

        setProgress(0);
        let duration = 5000;
        if (currentStatus.type === 'video') duration = 30000;

        const interval = 50;
        const timer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    handleNext();
                    return 0;
                }
                return prev + (100 / (duration / interval));
            });
        }, interval);

        return () => clearInterval(timer);
    }, [currentIndex, currentGroup, isPaused]);

    const handleNext = () => {
        if (currentIndex < currentGroup.statuses.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Check if there is a next group in allStatuses
            if (allStatuses.length > 0) {
                const currentGroupIndex = allStatuses.findIndex(g => g.user.uid === currentGroup.user.uid);
                if (currentGroupIndex !== -1 && currentGroupIndex < allStatuses.length - 1) {
                    setCurrentGroup(allStatuses[currentGroupIndex + 1]);
                    setCurrentIndex(0);
                    return;
                }
            }
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        } else {
            // Check previous group
            if (allStatuses.length > 0) {
                const currentGroupIndex = allStatuses.findIndex(g => g.user.uid === currentGroup.user.uid);
                if (currentGroupIndex > 0) {
                    const prevGroup = allStatuses[currentGroupIndex - 1];
                    setCurrentGroup(prevGroup);
                    setCurrentIndex(prevGroup.statuses.length - 1);
                    return;
                }
            }
        }
    };

    const handleReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;
        setIsPaused(true);
        try {
            await replyToStatus(currentUser, currentGroup.user, currentStatus, replyText);
            setReplyText("");
            alert("Reply sent!");
        } catch (error) {
            alert("Failed to send reply.");
        } finally {
            setIsPaused(false);
        }
    };

    // Desktop Sidebar Selection
    const handleSelectGroup = (group) => {
        setCurrentGroup(group);
        setCurrentIndex(0);
    };

    if (!currentStatus) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex bg-[#111b21]"
            >
                {/* DESKTOP SIDEBAR (Hidden on mobile) */}
                <div className="hidden md:flex w-[350px] bg-background border-r border-border flex-col overflow-y-auto">
                    <div className="p-4 border-b border-border">
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-foreground">Status</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {allStatuses.map((group) => (
                            <div
                                key={group.user.uid}
                                className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${currentGroup.user.uid === group.user.uid ? 'bg-muted' : ''}`}
                                onClick={() => handleSelectGroup(group)}
                            >
                                <Avatar src={group.user.photoURL} className={`w-12 h-12 border-2 ${currentGroup.user.uid === group.user.uid ? 'border-whatsapp-teal' : 'border-transparent'}`} />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-foreground truncate">{group.user.displayName}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(group.statuses[group.statuses.length - 1].timestamp.toDate())}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* MAIN VIEWER AREA */}
                <div className="flex-1 relative bg-black flex flex-col items-center justify-center h-full">
                    {/* Close / Back Button */}
                    <button className="absolute top-4 right-4 z-50 text-white p-2 hover:bg-white/10 rounded-full md:hidden" onClick={onClose}>
                        <IoClose className="w-8 h-8" />
                    </button>
                    <button className="absolute top-4 right-4 z-50 text-white p-2 hover:bg-white/10 rounded-full hidden md:block" onClick={onClose}>
                        <IoClose className="w-6 h-6" />
                    </button>

                    {/* Progress Bar Container */}
                    <div className="absolute top-2 w-full max-w-2xl px-2 flex gap-1 z-40">
                        {currentGroup.statuses.map((_, idx) => (
                            <div key={idx} className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden">
                                <div
                                    className={`h-full bg-white transition-all duration-75 ease-linear ${idx < currentIndex ? 'w-full' : idx === currentIndex ? '' : 'w-0'}`}
                                    style={{ width: idx === currentIndex ? `${progress}%` : undefined }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Header Info */}
                    <div className="absolute top-6 w-full max-w-2xl px-4 flex items-center justify-between z-40 text-white">
                        <div className="flex items-center gap-3">
                            <button className="md:hidden" onClick={onClose}><IoChevronBack className="w-6 h-6" /></button>
                            <Avatar src={currentGroup.user.photoURL} className="w-10 h-10 border border-white/20" />
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm">{currentGroup.user.displayName}</span>
                                <span className="text-xs text-white/70">
                                    {currentStatus.timestamp ? formatDistanceToNow(currentStatus.timestamp.toDate()) : 'Just now'}
                                </span>
                            </div>
                        </div>
                        <div className="relative">
                            <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-white/10 rounded-full">
                                <FaEllipsisV />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-10 bg-[#233138] text-[#d1d7db] py-2 rounded shadow-xl w-40 z-50">
                                    <button
                                        className="w-full text-left px-4 py-2 hover:bg-[#111b21] flex items-center gap-2"
                                        onClick={() => { setMuted(!muted); setShowMenu(false); }}
                                    >
                                        {muted ? <IoVolumeHigh /> : <IoVolumeMute />}
                                        {muted ? "Unmute" : "Mute"}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Media Content */}
                    <div className="w-full h-full flex items-center justify-center relative bg-black">
                        {/* Navigation Click Areas */}
                        <div
                            className="absolute left-0 top-0 w-1/3 h-[85%] z-30 cursor-pointer"
                            onClick={handlePrev}
                            onMouseDown={() => setIsPaused(true)}
                            onMouseUp={() => setIsPaused(false)}
                            onTouchStart={() => setIsPaused(true)}
                            onTouchEnd={() => setIsPaused(false)}
                        />
                        <div
                            className="absolute right-0 top-0 w-1/3 h-[85%] z-30 cursor-pointer"
                            onClick={handleNext}
                            onMouseDown={() => setIsPaused(true)}
                            onMouseUp={() => setIsPaused(false)}
                            onTouchStart={() => setIsPaused(true)}
                            onTouchEnd={() => setIsPaused(false)}
                        />

                        {currentStatus.type === 'text' ? (
                            <div
                                className="w-full h-full flex items-center justify-center text-center p-8 text-white font-bold text-2xl md:text-4xl"
                                style={{ backgroundColor: currentStatus.background || '#000000', fontFamily: currentStatus.font || 'sans-serif' }}
                            >
                                {currentStatus.content}
                            </div>
                        ) : currentStatus.type === 'video' ? (
                            <video src={currentStatus.content} className="max-h-full max-w-full object-contain" autoPlay={!isPaused} muted={muted} />
                        ) : (
                            <img
                                src={currentStatus.content}
                                className="max-h-full max-w-full object-contain"
                                alt="Status"
                            />
                        )}

                        {/* Caption Overlay */}
                        {currentStatus.caption && (
                            <div className="absolute bottom-20 md:bottom-24 w-full text-center p-2 bg-black/40 backdrop-blur-sm">
                                <p className="text-white text-base">{currentStatus.caption}</p>
                            </div>
                        )}
                    </div>

                    {/* Footer / Reply - Only if not own status */}
                    {currentUser?.uid !== currentGroup.user.uid && (
                        <div className="absolute bottom-0 w-full z-40 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-center">
                            <form
                                onSubmit={handleReply}
                                className="w-full max-w-2xl flex flex-col items-center gap-2"
                            >
                                <div className="flex items-end gap-2 w-full animate-slide-up">
                                    <IoChevronUp className="text-white/70 animate-bounce mx-auto mb-2 text-2xl cursor-pointer" onClick={() => document.querySelector('input.reply-input').focus()} />
                                </div>
                                <div className="w-full flex items-center gap-2 relative">
                                    <input
                                        type="text"
                                        placeholder="Type a reply..."
                                        className="reply-input w-full bg-[#202c33] text-white rounded-full px-6 py-3 border border-[#8696a0] focus:border-whatsapp-teal outline-none transition-colors placeholder:text-[#8696a0]"
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        onFocus={() => setIsPaused(true)}
                                        onBlur={() => setIsPaused(false)}
                                    />
                                    {replyText.trim() && (
                                        <button type="submit" className="bg-whatsapp-teal p-3 rounded-full text-white shadow-lg">
                                            <IoPaperPlane />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StatusViewer;
