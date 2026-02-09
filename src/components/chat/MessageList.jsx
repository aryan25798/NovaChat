import React from "react";
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
        <div className="flex-1 relative w-full overflow-hidden">
            <div className="absolute inset-0 overflow-y-auto p-4 md:px-[8%] lg:px-[12%] flex flex-col gap-1 custom-scrollbar scroll-smooth">
                {messages.map((msg, index, filteredMsgs) => {
                    const nextMsg = index < filteredMsgs.length - 1 ? filteredMsgs[index + 1] : null;
                    const showTail = !nextMsg || nextMsg.senderId !== msg.senderId;
                    return (
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
                    );
                })}
                <div ref={messagesEndRef} className="h-4" />
            </div>
        </div>
    );
}
