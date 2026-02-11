import React, { useState, memo, useEffect } from 'react';
import { FaCheck, FaCheckDouble, FaChevronDown, FaReply, FaCopy, FaPhone, FaVideo, FaTrash, FaDownload, FaFileAlt, FaFilePdf, FaFileWord, FaFileExcel, FaFilePowerpoint, FaFileArchive, FaFileAudio, FaPlay, FaPause } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { format } from 'date-fns';
import { GEMINI_BOT_ID } from '../constants';
import { Avatar } from './ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cacheMedia, getCachedMedia } from '../utils/mediaCache';

const Message = memo(({ message, chat, isOwn, onDelete, onReply, onReact, showBlueTicks, showTail }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showViewer, setShowViewer] = useState(false);
    const [cachedUrl, setCachedUrl] = useState(null);
    const { currentUser } = useAuth();

    const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

    // Smart Media Caching
    useEffect(() => {
        if (message.mediaUrl) {
            const loadMedia = async () => {
                const cached = await getCachedMedia(message.mediaUrl);
                if (cached) {
                    setCachedUrl(cached);
                } else {
                    // Auto-cache on view
                    // For now, we prefer lazy caching (only when fully loaded/viewed) 
                    // or eager caching (start downloading now). 
                    // Let's do lazy cache in background:
                    cacheMedia(message.mediaUrl).then(url => setCachedUrl(url));
                }
            }
            loadMedia();
        }
    }, [message.mediaUrl]);

    const displayUrl = cachedUrl || message.mediaUrl;

    if (message.hiddenBy && message.hiddenBy.includes(currentUser.uid)) {
        return null;
    }

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return format(date, 'HH:mm');
    };

    const handleCopy = () => {
        if (message.text) navigator.clipboard.writeText(message.text);
        setShowMenu(false);
    };

    const handleReply = () => {
        onReply(message);
        setShowMenu(false);
    };

    const handleEmojiClick = (emoji) => {
        onReact(message.id, emoji);
        setShowMenu(false);
    };

    const handleDownload = async (e) => {
        e.stopPropagation();
        try {
            const response = await fetch(displayUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = message.fileName || `download_${Date.now()}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Download failed:", error);
        }
    };

    const uniqueReactions = [...new Set(Object.values(message.reactions || {}))].slice(0, 3);
    const reactionCount = Object.keys(message.reactions || {}).length;

    const ImageLightbox = ({ url, onClose }) => (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
            <div className="absolute top-6 right-6 flex gap-4">
                <button className="text-white/70 hover:text-white p-2 transition-colors bg-white/10 rounded-full" onClick={handleDownload} title="Download">
                    <FaDownload />
                </button>
                <button className="text-white/70 hover:text-white p-2 transition-colors" onClick={onClose}>
                    <span className="text-4xl font-light leading-none">&times;</span>
                </button>
            </div>
            <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={url}
                alt="Full view"
                className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                onClick={e => e.stopPropagation()}
            />
        </div>
    );

    const getFileIcon = (mimeType) => {
        if (mimeType?.includes('pdf')) return <FaFilePdf className="text-red-500 text-3xl" />;
        if (mimeType?.includes('word')) return <FaFileWord className="text-blue-500 text-3xl" />;
        if (mimeType?.includes('excel') || mimeType?.includes('sheet')) return <FaFileExcel className="text-green-500 text-3xl" />;
        if (mimeType?.includes('powerpoint') || mimeType?.includes('presentation')) return <FaFilePowerpoint className="text-orange-500 text-3xl" />;
        if (mimeType?.includes('zip') || mimeType?.includes('rar')) return <FaFileArchive className="text-yellow-600 text-3xl" />;
        if (mimeType?.includes('audio')) return <FaFileAudio className="text-purple-500 text-3xl" />;
        return <FaFileAlt className="text-gray-500 text-3xl" />;
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            id={`msg-${message.id}`}
            className={cn(
                "flex flex-col w-full relative mb-1",
                isOwn ? "items-end" : "items-start",
                showTail ? "mt-2" : ""
            )}
        >
            {showViewer && <ImageLightbox url={displayUrl} onClose={() => setShowViewer(false)} />}

            <div className={cn("flex w-full group/row", isOwn ? "justify-end" : "justify-start items-end")}>
                {!isOwn && !chat?.isPrivate && message.senderId !== GEMINI_BOT_ID && showTail && (
                    <div className="mr-2 mb-1 shrink-0">
                        <Avatar src={message.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${message.senderId}`} size="sm" />
                    </div>
                )}

                {!isOwn && !chat?.isPrivate && message.senderId !== GEMINI_BOT_ID && !showTail && (
                    <div className="w-[32px] mr-2 shrink-0" />
                )}

                <div
                    className={cn(
                        "relative max-w-[85%] md:max-w-[70%] min-w-[80px] group cursor-pointer lg:cursor-default transition-all duration-200 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)]",
                        isOwn
                            ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-black dark:text-[#e9edef]" // WhatsApp Sent Bubble
                            : "bg-white dark:bg-[#202c33] text-black dark:text-[#e9edef]", // WhatsApp Received Bubble
                        // Asymmetric radius
                        isOwn
                            ? (showTail ? "rounded-l-lg rounded-tr-lg rounded-br-none" : "rounded-lg")
                            : (showTail ? "rounded-r-lg rounded-tl-lg rounded-bl-none" : "rounded-lg"),
                        "px-2 py-0.5", // Reduced padding
                        "text-[14.2px] leading-[19px]" // Precise typography
                    )}
                    onClick={() => setShowMenu(!showMenu)}
                >
                    {/* Menu Button */}
                    <button
                        className={cn(
                            "absolute top-1 right-1 z-20 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-full",
                            isOwn ? "hover:bg-black/10 text-white/70" : "hover:bg-surface text-text-2",
                            showMenu && "opacity-100"
                        )}
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                    >
                        <FaChevronDown className="text-[10px]" />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowMenu(false)}></div>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className="absolute top-8 right-0 bg-surface shadow-premium-hover rounded-2xl py-2 z-50 w-52 origin-top-right border border-border/50 overflow-hidden"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex gap-2 justify-center px-3 py-2 mb-2 bg-surface-elevated/50">
                                        {REACTION_EMOJIS.map(emoji => (
                                            <button key={emoji} onClick={() => handleEmojiClick(emoji)} className="text-[20px] hover:scale-125 hover:-translate-y-1 transition-all duration-200 active:scale-95">{emoji}</button>
                                        ))}
                                    </div>
                                    <button onClick={handleReply} className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated flex items-center gap-3 text-[14px] text-text-1 font-medium transition-colors">
                                        <FaReply className="text-text-2 w-3.5 h-3.5" /> Reply
                                    </button>
                                    <button onClick={handleCopy} className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated flex items-center gap-3 text-[14px] text-text-1 font-medium transition-colors">
                                        <FaCopy className="text-text-2 w-3.5 h-3.5" /> Copy
                                    </button>
                                    {(message.mediaUrl || message.fileUrl) && (
                                        <button onClick={handleDownload} className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated flex items-center gap-3 text-[14px] text-text-1 font-medium transition-colors">
                                            <FaDownload className="text-text-2 w-3.5 h-3.5" /> Download
                                        </button>
                                    )}
                                    <div className="h-px bg-border/40 my-1 mx-2" />
                                    <button onClick={() => { onDelete(message.id, 'me'); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 hover:bg-surface-elevated flex items-center gap-3 text-[14px] text-text-1 font-medium transition-colors">
                                        <FaTrash className="text-text-2 w-3.5 h-3.5" /> Delete for me
                                    </button>
                                    {isOwn && (
                                        <button onClick={() => { onDelete(message.id, 'everyone'); setShowMenu(false); }} className="w-full text-left px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-3 text-[14px] text-red-500 font-medium transition-colors">
                                            <FaTrash className="w-3.5 h-3.5" /> Delete for everyone
                                        </button>
                                    )}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Quoted Message */}
                    {message.replyTo && (
                        <div className={cn(
                            "mb-2 rounded-xl overflow-hidden border-l-[3px] p-2 transition-colors mx-1",
                            isOwn ? "bg-white/10 border-white/40" : "bg-surface border-primary/40"
                        )}>
                            <div className={cn("text-[12px] font-bold mb-0.5", isOwn ? "text-white" : "text-primary")}>
                                {message.replyTo.senderName}
                            </div>
                            <div className={cn("text-[13px] truncate", isOwn ? "text-white/80" : "text-text-2")}>
                                {message.replyTo.text}
                            </div>
                        </div>
                    )}

                    {/* Message Content */}
                    {message.type === 'call_log' ? (
                        <div className="flex items-center gap-3 p-1 px-2">
                            <div className={cn("rounded-full p-2.5 shadow-sm", isOwn ? "bg-white/20" : "bg-surface")}>
                                {message.status === 'missed' ? <FaPhone className="text-red-500" /> : <FaVideo className="text-primary" />}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[14px] font-semibold">{message.text}</span>
                                <span className={cn("text-[11px]", isOwn ? "text-white/70" : "text-text-2")}>{formatTime(message.timestamp)}</span>
                            </div>
                        </div>
                    ) : message.isSoftDeleted ? (
                        <div className={cn("italic flex items-center gap-2 text-[14px] py-1 px-2 opacity-70", isOwn ? "text-white" : "text-text-2")}>
                            <FaTrash className="text-[10px]" />
                            <span>This message was deleted</span>
                            <span className="text-[11px] ml-auto">{formatTime(message.timestamp)}</span>
                        </div>
                    ) : (
                        <div className="flex flex-col px-1">
                            {!isOwn && message.senderId !== GEMINI_BOT_ID && !chat?.isPrivate && (
                                <div className="text-[12px] font-bold text-primary mb-1 tracking-tight px-1">{message.senderName}</div>
                            )}

                            {/* Media Rendering */}
                            {message.mediaUrl && (
                                <div className="mb-2 rounded-lg overflow-hidden max-w-sm shadow-sm border border-black/5 bg-black/5 relative group/media">
                                    {(message.mediaType === 'image') && (
                                        <motion.img
                                            whileHover={{ scale: 1.02 }}
                                            src={displayUrl}
                                            alt="media"
                                            className="w-full max-h-[350px] object-cover cursor-pointer"
                                            onClick={(e) => { e.stopPropagation(); setShowViewer(true); }}
                                        />
                                    )}
                                    {message.mediaType === 'video' && (
                                        <video src={displayUrl} controls className="w-full max-h-[350px]" />
                                    )}
                                    {message.mediaType === 'file' && (
                                        <div className={cn("flex items-center gap-3 p-3 min-w-[200px]", isOwn ? "bg-white/10" : "bg-surface-elevated")}>
                                            <div className="shrink-0">
                                                {getFileIcon(message.fileType)}
                                            </div>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className={cn("text-sm font-medium truncate", isOwn ? "text-white" : "text-text-1")}>
                                                    {message.fileName || "File"}
                                                </span>
                                                <span className={cn("text-xs opacity-70", isOwn ? "text-white" : "text-text-2")}>
                                                    {formatFileSize(message.fileSize)} • {message.fileType?.split('/')[1]?.toUpperCase() || 'FILE'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={handleDownload}
                                                className={cn("p-2 rounded-full transition-colors shrink-0",
                                                    isOwn ? "hover:bg-white/20 text-white" : "hover:bg-surface-elevated-hover text-primary"
                                                )}
                                            >
                                                <FaDownload />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col relative px-1">
                                {message.text && message.mediaType !== 'file' && (
                                    <span className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</span>
                                )}
                                <div className="flex items-center gap-1 self-end mt-1 min-w-[60px] justify-end">
                                    <span className={cn(
                                        "text-[11px] font-normal min-w-fit",
                                        isOwn ? "text-black/60 dark:text-white/60" : "text-black/60 dark:text-white/60"
                                    )}>
                                        {formatTime(message.timestamp)}
                                    </span>
                                    {isOwn && (
                                        <span className={cn(
                                            "text-[15px] transition-colors duration-300 -mt-0.5",
                                            message.read ? "text-[#53bdeb]" : "text-black/30 dark:text-white/30" // Blue for read, gray for sent
                                        )}>
                                            {message.read ? <FaCheckDouble /> : (message.delivered ? <FaCheckDouble /> : <FaCheck />)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reactions */}
                    <AnimatePresence>
                        {reactionCount > 0 && (
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={cn(
                                    "absolute -bottom-3 z-30 bg-surface rounded-full px-2 py-0.5 shadow-premium border border-border/50 flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform",
                                    isOwn ? "left-1" : "right-1"
                                )}
                            >
                                <div className="flex -space-x-1">
                                    {uniqueReactions.map(r => <span key={r} className="text-[13px] leading-none drop-shadow-sm">{r}</span>)}
                                </div>
                                {reactionCount > 1 && <span className="text-[11px] text-text-1 font-bold pl-0.5">{reactionCount}</span>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
});

export default Message;
