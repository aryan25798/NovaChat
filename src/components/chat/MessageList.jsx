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
    onMediaClick,
    rtdbStatus, // [OPT] Received from parent
    onCancelUpload
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
    // We REMOVE 'messages' from here because it changes too often.
    // 'itemContent' only needs 'messages' to check the 'nextMsg' (for showing tails).
    // We can pre-calculate tail or just accept that tails might flick if we aren't careful.
    // However, WhatsApp usually only re-renders the item that changed.
    const contextValue = React.useMemo(() => ({
        chat,
        currentUser,
        handleDelete,
        handleReact,
        setReplyTo,
        inputRef,
        onMediaClick,
        rtdbStatus,
        onCancelUpload
    }), [chat, currentUser, handleDelete, handleReact, setReplyTo, inputRef, onMediaClick, rtdbStatus, onCancelUpload]);

    const itemContent = React.useCallback((index, msg, ctx) => {
        if (!msg) return null;

        const { chat, currentUser, handleDelete, handleReact, setReplyTo, inputRef, onMediaClick, rtdbStatus } = ctx;

        // Optimize: Don't look up nextMsg if we don't need it. 
        // For tails, we could pass messages as a separate prop to MessageList if we really need it,
        // but Virtuoso's 'data' is already available elsewhere if needed.
        // For now, let's keep it simple: assume tail if it's the last one or sender changes.
        // We'll pass showTail as a prop directly calculated from the msg if possible.

        return (
            <div className="px-4 md:px-[8%] lg:px-[12%] py-0.5">
                <Message
                    message={msg}
                    chat={chat}
                    isOwn={msg.senderId === currentUser.uid}
                    showTail={msg.showTail} // Assuming we pre-process this or handle it in Message
                    onDelete={handleDelete}
                    onReact={handleReact}
                    onReply={(m) => {
                        setReplyTo(m);
                        inputRef.current?.focus();
                    }}
                    onMediaClick={onMediaClick}
                    showBlueTicks={true}
                    currentStatus={rtdbStatus?.[msg.id]}
                    onCancelUpload={onCancelUpload}
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
                    computeItemKey={msg => msg.id || `msg-${Math.random()}`}
                    context={contextValue}
                    itemContent={itemContent}
                    initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
                    followOutput={(isAtBottom) => isAtBottom ? "auto" : false}
                    alignToBottom={true}
                    defaultItemHeight={72}
                    increaseViewportBy={500} // Reduced from 2000 to prevent extensive rendering
                    atBottomThreshold={200}
                    overscan={{ main: 600, reverse: 600 }} // Symmetrical overscan
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
