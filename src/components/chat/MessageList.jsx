import React, { useEffect, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import Message from "../Message";
import { MessageSkeleton } from "../ui/Skeleton";

export default function MessageList({
    messages,
    chat,
    currentUser,
    handleDelete,
    handleReact,
    setReplyTo,
    inputRef,
    messagesEndRef,
    loading
}) {
    const virtuosoRef = useRef(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messages.length > 0 && virtuosoRef.current) {
            const lastMessage = messages[messages.length - 1];
            // If the last message is from the current user, or we are already near bottom, scroll to bottom
            // Virtuoso handles 'followOutput' automatically but we trigger it here for initial load consistency
            setTimeout(() => {
                virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: "end", behavior: "smooth" });
            }, 100);
        }
    }, [messages.length]);

    if (loading) {
        return (
            <div className="flex-1 relative w-full overflow-hidden bg-transparent">
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
                    <MessageSkeleton />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 relative w-full overflow-hidden bg-transparent">
            {/* 
                Virtuoso handles virtualization. 
                We use 'followOutput' to keep scroll at bottom when new items are added 
            */}
            <Virtuoso
                ref={virtuosoRef}
                style={{ height: "100%", width: "100%" }}
                data={messages}
                initialTopMostItemIndex={messages.length - 1} // Start at bottom
                followOutput={"smooth"} // Auto-scroll behavior
                alignToBottom={true} // Stick to bottom on load
                itemContent={(index, msg) => {
                    // Safe access in case messages array is manipulated during render
                    if (!msg) return null;

                    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                    const showTail = !nextMsg || nextMsg.senderId !== msg.senderId;

                    return (
                        <div className="px-4 md:px-[8%] lg:px-[12%] py-0.5">
                            <Message
                                key={msg.id}
                                message={msg}
                                chat={chat}
                                isOwn={msg.senderId === currentUser.uid}
                                showTail={showTail}
                                onDelete={handleDelete}
                                onReact={handleReact}
                                onReply={(m) => {
                                    setReplyTo(m);
                                    inputRef.current?.focus();
                                }}
                                showBlueTicks={true}
                            />
                        </div>
                    );
                }}
            />
        </div>
    );
}
