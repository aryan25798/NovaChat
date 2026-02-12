import React, { useState, memo, useEffect } from 'react';
import { FaCheck, FaCheckDouble, FaChevronDown, FaReply, FaCopy, FaPhone, FaVideo, FaTrash, FaDownload, FaFileAlt, FaFilePdf, FaFileWord, FaFileExcel, FaFilePowerpoint, FaFileArchive, FaFileAudio, FaPlay, FaPause, FaClock } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { format } from 'date-fns';
import { GEMINI_BOT_ID } from '../constants';
import { Avatar } from './ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cacheMedia, getCachedMedia } from '../utils/mediaCache';
import MessageBubble from './chat/MessageBubble';

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

const Message = memo(({ message, chat, isOwn, onDelete, onReply, onReact, onMediaClick, showBlueTicks, showTail }) => {
    const [showMenu, setShowMenu] = useState(false);
    const { currentUser } = useAuth();


    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            if (isNaN(date.getTime())) return "";
            return format(date, 'HH:mm');
        } catch (e) {
            return "";
        }
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
        const url = message.mediaUrl || message.fileUrl || message.imageUrl || message.videoUrl;
        if (!url) return;
        try {
            const response = await fetch(url);
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

    return (
        <div
            id={`msg-${message.id}`}
            className={cn(
                "flex flex-col w-full relative mb-1 min-h-[40px] md:min-h-[44px]",
                isOwn ? "items-end" : "items-start",
                showTail ? "mt-2" : ""
            )}
        >
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
                        "px-2 py-0.5",
                        "text-[14.2px] leading-[19px]"
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
                                    {(message.mediaUrl || message.fileUrl || message.imageUrl || message.videoUrl) && (
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
                                {message.replyTo.senderName || "Unknown"}
                            </div>
                            <div className={cn("text-[13px] truncate", isOwn ? "text-white/80" : "text-text-2")}>
                                {message.replyTo.text || "Message"}
                            </div>
                        </div>
                    )}

                    {/* Message Bubble Content */}
                    <div className="flex flex-col">
                        {!isOwn && message.senderId !== GEMINI_BOT_ID && !chat?.isPrivate && (
                            <div className="text-[12px] font-bold text-primary mb-1 tracking-tight px-1">{message.senderName}</div>
                        )}

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
                            </div>
                        ) : (
                            <MessageBubble
                                message={message}
                                isOwn={isOwn}
                                onMediaClick={onMediaClick}
                            />
                        )}

                        {/* Timestamp & Status */}
                        <div className="flex items-center gap-1 self-end mt-1 min-w-[60px] justify-end pb-0.5 pr-1">
                            <span className={cn(
                                "text-[11px] font-normal min-w-fit opacity-60",
                                isOwn ? "text-black dark:text-white" : "text-black dark:text-white"
                            )}>
                                {formatTime(message.timestamp)}
                            </span>
                            {isOwn && (
                                <span className={cn(
                                    "text-[15px] transition-colors duration-300 -mt-0.5",
                                    message.read ? "text-[#53bdeb]" : "text-black/30 dark:text-white/30"
                                )}>
                                    {message.status === 'pending' ? <FaClock className="text-[10px]" /> : (message.read ? <FaCheckDouble /> : (message.delivered ? <FaCheckDouble /> : <FaCheck />))}
                                </span>
                            )}
                        </div>
                    </div>

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
        </div>
    );
});

export default Message;
