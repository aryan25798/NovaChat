import React, { memo } from "react";
import { Avatar } from "./ui/Avatar";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { repairChatMetadata } from "../services/chatService";

const ChatListItem = memo(({ chat, currentUserId }) => {
    const { id } = useParams();
    const repairAttemptedRef = React.useRef(false);

    // Determine metadata for Group or Private chat
    const displayInfo = {
        name: chat.groupName || (chat.chatName || "Unknown"),
        photo: (chat.photoURL || chat.groupImage),
        id: chat.id
    };

    if (chat.type !== 'group') {
        const otherUserId = chat.participants?.find(uid => uid !== currentUserId);
        const userInfo = chat.participantInfo?.[otherUserId];

        displayInfo.name = userInfo?.displayName || "User";
        displayInfo.photo = userInfo?.photoURL;
        displayInfo.id = otherUserId || chat.id;

        // Self-Repair: If name is "User" or missing, try to fetch fresh metadata
        if ((!userInfo || !userInfo.displayName || userInfo.displayName === "User") && !repairAttemptedRef.current) {
            repairAttemptedRef.current = true;
            // Fire and forget repair
            repairChatMetadata(chat.id, currentUserId);
        }
    }

    const isActive = id === chat.id; // Match against chat ID for the list
    const lastMessageDate = React.useMemo(() => {
        const t = chat.lastMessageTimestamp;
        if (!t) return null;
        if (t instanceof Date) return t;
        if (typeof t === 'number') return new Date(t);
        if (typeof t.toDate === 'function') return t.toDate();
        if (t.seconds) return new Date(t.seconds * 1000);
        return null; // Fallback
    }, [chat.lastMessageTimestamp]);

    return (
        <motion.div initial={false} transition={{ type: 'spring', stiffness: 500, damping: 50, mass: 1 }}>
            <Link
                to={`/c/${chat.id}`}
                className={cn(
                    "group flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 hover:bg-surface/50 transition-all duration-200 cursor-pointer relative border-b border-border/30 last:border-0 min-h-[72px]",
                    isActive ? "bg-surface-elevated dark:bg-surface/80" : "bg-transparent"
                )}
            >
                {/* Active Indicator Bar */}
                {isActive && (
                    <motion.div layoutId="active-bar" className="absolute left-0 top-0 bottom-0 w-[4px] bg-primary" />
                )}

                <Avatar src={displayInfo.photo} alt={displayInfo.name} size="lg" className="shrink-0 shadow-sm" />

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                        <h3 className={cn(
                            "font-semibold text-[15px] truncate transition-colors",
                            isActive ? "text-primary" : "text-text-1"
                        )}>
                            {displayInfo.name}
                        </h3>
                        <span className={cn(
                            "text-[11px] whitespace-nowrap font-medium",
                            isActive ? "text-primary/70" : "text-text-2"
                        )}>
                            {lastMessageDate ? format(lastMessageDate, 'HH:mm') : ''}
                        </span>
                    </div>

                    <div className="flex justify-between items-center text-left">
                        <p className="text-[14px] md:text-[13.5px] text-text-2 truncate pr-2 max-w-full flex items-center gap-1.5 font-medium">
                            {chat.mutedBy?.[currentUserId] && <span className="opacity-40">🔔</span>}
                            <span className="truncate opacity-80">
                                {chat.lastMessage?.isSoftDeleted
                                    ? "🚫 This message was deleted"
                                    : (chat.lastMessage && typeof chat.lastMessage === 'object'
                                        ? chat.lastMessage.text
                                        : (chat.lastMessage || "Start a conversation"))}
                            </span>
                        </p>

                        {chat.unreadCount?.[currentUserId] > 0 && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="bg-primary text-primary-foreground min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-bold px-1.5 shadow-sm"
                            >
                                {chat.unreadCount[currentUserId]}
                            </motion.div>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    );
});

export default ChatListItem;
