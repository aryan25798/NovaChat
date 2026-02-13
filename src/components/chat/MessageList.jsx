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
        <div className="flex-1 w-full h-full relative bg-transparent overflow-hidden min-h-0">
            {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-500">
                    No messages yet. Say hi!
                </div>
            ) : (
                <Virtuoso
                    ref={virtuosoRef}
                    style={{ height: "100%", width: "100%" }}
                    data={messages}
                    // totalCount={messages.length} // Let Virtuoso handle it
                    // initialItemCount={Math.min(messages.length, 20)} 
                    computeItemKey={msg => msg.id || `msg-${Math.random()}`} // Safe fallback
                    context={contextValue}
                    itemContent={itemContent}
                    initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                    followOutput={(isAtBottom) => isAtBottom ? "auto" : false}
                    alignToBottom={true}
                    defaultItemHeight={72} // Estimate
                    increaseViewportBy={800}
                    atBottomThreshold={100}
                    overscan={200}
                    components={{
                        Footer: () => <div className="h-4 w-full invisible" />,
                        Header: () => <div className="h-4 w-full invisible" />
                    }}
                />
            )}
        </div>
    );
}

export const MemoizedMessageList = React.memo(MessageList);
export default MemoizedMessageList;
