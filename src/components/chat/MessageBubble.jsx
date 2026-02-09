import React from "react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { BsCheckAll, BsCheck } from "react-icons/bs";

const MessageBubble = ({ message, isGroup, isOwn }) => {
    // If isOwn is passed, use it. Fallback to message.senderId === 'me' only if legacy/debugging.
    // Ideally rely strictly on isOwn passed from parent.

    // Status Logic
    // sent: Check (Gray)
    // delivered: Double Check (Gray)
    // read: Double Check (Blue)

    const renderStatusIcon = () => {
        if (!isOwn) return null;

        const status = message.status || 'sent';
        const colorClass = status === 'read' ? 'text-blue-500' : 'text-gray-400';

        if (status === 'sent') {
            return <BsCheck className={cn("text-lg", colorClass)} />;
        }
        return <BsCheckAll className={cn("text-lg", colorClass)} />;
    };

    return (
        <div
            className={cn(
                "flex w-full mb-2",
                isOwn ? "justify-end" : "justify-start"
            )}
        >
            <div
                className={cn(
                    "relative max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm text-sm",
                    isOwn
                        ? "bg-[#d9fdd3] dark:bg-[#005c4b] rounded-tr-none"
                        : "bg-white dark:bg-[#202c33] rounded-tl-none"
                )}
            >
                {/* Triangle for bubble tail - simplified with CSS borders or pseudo-elements later if needed, utilizing rounded corners for now */}

                {!isOwn && isGroup && (
                    <p className={`text-xs font-bold mb-1 ${message.senderColor || 'text-orange-500'}`}>
                        {message.senderName}
                    </p>
                )}

                {message.type === 'image' && message.imageUrl && (
                    <div className="mb-1 rounded-lg overflow-hidden">
                        <img src={message.imageUrl} alt="Shared" className="max-w-full sm:max-w-[300px] object-cover" />
                    </div>
                )}

                {message.type === 'audio' && message.audioUrl && (
                    <div className="flex items-center gap-2 min-w-[200px] p-2">
                        <audio controls src={message.audioUrl} className="w-full h-8" />
                    </div>
                )}

                {message.type !== 'image' && message.type !== 'audio' && message.text && (
                    <p className="text-gray-800 dark:text-gray-100 leading-relaxed break-words whitespace-pre-wrap pb-2">
                        {message.text}
                    </p>
                )}

                <div className="flex items-center justify-end gap-1 absolute bottom-1 right-2 select-none">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 min-w-fit">
                        {message.timestamp ? format(new Date(message.timestamp.toDate ? message.timestamp.toDate() : message.timestamp), "HH:mm") : ""}
                    </span>
                    {isOwn && renderStatusIcon()}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
