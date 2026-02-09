import React, { useEffect, useState, memo } from "react";
import { Avatar } from "./ui/Avatar";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const ChatListItem = memo(({ chat, currentUserId }) => {
    const { id } = useParams();

    // Determine metadata for Group or Private chat
    let displayInfo = {
        name: chat.groupName || "Unknown",
        photo: chat.photoURL || chat.groupImage,
        id: chat.id
    };

    if (chat.type !== 'group') {
        const otherUserId = chat.participants?.find(uid => uid !== currentUserId);
        const userInfo = chat.participantInfo?.[otherUserId];

        displayInfo = {
            name: userInfo?.displayName || "User",
            photo: userInfo?.photoURL,
            id: otherUserId || chat.id
        };
    }

    const isActive = id === chat.id; // Match against chat ID for the list
    const lastMessageDate = chat.lastMessageTimestamp ? new Date(chat.lastMessageTimestamp.seconds * 1000) : null;

    return (
        <Link
            to={`/c/${chat.id}`}
            className={cn(
                "group flex items-center gap-4 px-4 py-3 hover:bg-surface transition-all duration-200 cursor-pointer relative",
                isActive && "bg-surface"
            )}
        >
            {/* Active Indicator Bar */}
            {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-full" />
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
                                : (typeof chat.lastMessage === 'object' ? chat.lastMessage.text : (chat.lastMessage || "Start a conversation"))}
                        </span>
                    </p>

                    {chat.unreadCount?.[currentUserId] > 0 && (
                        <div className="bg-primary text-primary-foreground min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-bold px-1.5 shadow-sm">
                            {chat.unreadCount[currentUserId]}
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
});

export default ChatListItem;
