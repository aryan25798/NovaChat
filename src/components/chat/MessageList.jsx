import React, { useEffect, useRef } from "react";
import { Virtuoso } from "react-virtuoso";
import Message from "../Message";
import { MessageSkeleton } from "../ui/Skeleton";

export function MessageList({
    messages,
    chat,
    currentUser,
    handleDelete,
    handleReact,
    setReplyTo,
    inputRef,
    messagesEndRef,
    loading,
    onMediaClick
}) {
    const virtuosoRef = useRef(null);

    // Virtuoso handles 'followOutput' automatically when data length changes.
    // We only need a manual scroll for initial jump if alignToBottom isn't perfect.
    useEffect(() => {
        if (messages.length > 0 && virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({ index: messages.length - 1, align: "end" });
        }
    }, []); // Only on mount

    // Stable context for Virtuoso to avoid regenerating itemContent
    const contextValue = React.useMemo(() => ({
        messages,
        chat,
        currentUser,
        handleDelete,
        handleReact,
        setReplyTo,
        inputRef,
        onMediaClick
    }), [messages, chat, currentUser, handleDelete, handleReact, setReplyTo, inputRef, onMediaClick]);

    const itemContent = React.useCallback((index, msg, ctx) => {
        // Safe access in case messages array is manipulated during render
        if (!msg) return null;

        const { messages, chat, currentUser, handleDelete, handleReact, setReplyTo, inputRef, onMediaClick } = ctx;
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
                    onMediaClick={onMediaClick}
                    showBlueTicks={true}
                />
            </div>
        );
    }, []);

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
        <div className="flex-1 min-h-0 relative w-full overflow-hidden bg-transparent">
            {/* 
                Virtuoso handles virtualization. 
                We use 'followOutput' to keep scroll at bottom when new items are added 
            */}
            <Virtuoso
                ref={virtuosoRef}
                style={{ height: "100%", width: "100%" }}
                data={messages}
                context={contextValue}
                itemContent={itemContent}
                followOutput={"smooth"} // Auto-scroll behavior
                alignToBottom={true} // Stick to bottom on load
            />
        </div>
    );
}

export const MemoizedMessageList = React.memo(MessageList);
export default MemoizedMessageList;
