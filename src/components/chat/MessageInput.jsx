import React, { useState, useEffect } from "react";
import { FaRegSmile, FaPaperclip, FaMicrophone, FaPaperPlane, FaTimes, FaMagic } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { getSmartReplies } from "../../services/AIAgentService";

export default function MessageInput({
    newMessage,
    setNewMessage,
    handleInputChange,
    handleSendMessage,
    handleFileUpload,
    replyTo,
    setReplyTo,
    inputRef,
    chat,
    otherUser,
    messages
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!messages || messages.length === 0) return;
            // Only fetch if the last message is from the other user
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.senderId === otherUser.uid && lastMessage.type === 'text') {
                setIsLoadingSuggestions(true);
                try {
                    // Send last 5 messages for context to optimize speed
                    const replies = await getSmartReplies(messages.slice(-5));
                    setSuggestions(replies);
                } catch (e) {
                    console.warn("Smart replies failed:", e);
                } finally {
                    setIsLoadingSuggestions(false);
                }
            } else {
                setSuggestions([]);
            }
        };

        const timer = setTimeout(fetchSuggestions, 800);
        return () => clearTimeout(timer);
    }, [messages.length, otherUser.uid]);

    const handleSuggestionClick = (suggestion) => {
        setNewMessage(suggestion);
        setSuggestions([]);
    };

    return (
        <div className="flex flex-col w-full relative z-20">
            {/* Smart Replies */}
            <AnimatePresence>
                {suggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="flex gap-2 px-4 py-3 bg-transparent overflow-x-auto no-scrollbar scroll-smooth"
                    >
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="whitespace-nowrap bg-surface border border-border/50 text-text-1 text-[13px] px-4 py-1.5 rounded-full shadow-sm hover:border-primary/50 hover:bg-surface-elevated transition-all duration-200 active:scale-95 font-medium"
                            >
                                {suggestion}
                            </button>
                        ))}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full shrink-0"
                            onClick={() => setSuggestions([])}
                        >
                            <FaTimes size={10} className="text-text-2" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input Toolbar */}
            {/* Input Toolbar */}
            <div className="min-h-[56px] md:min-h-[80px] glass px-1.5 md:px-4 py-1.5 md:py-3 flex items-end gap-1 md:gap-3 border-t border-border/30 relative transition-all">
                {chat.status === 'pending' ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full py-3 flex flex-col items-center gap-3"
                    >
                        <p className="text-[13px] text-text-2 font-medium">Accept message request from {otherUser.displayName}?</p>
                        <div className="flex gap-2">
                            <Button variant="surface" size="sm" className="text-red-500 hover:bg-red-50 transition-colors h-8">Block</Button>
                            <Button size="sm" className="shadow-premium h-8">Accept</Button>
                        </div>
                    </motion.div>
                ) : (
                    <>
                        <div className="flex items-center gap-0.5 md:gap-2 mb-0.5 shrink-0">
                            <Button variant="ghost" size="icon" className="rounded-full text-text-2 hover:text-primary transition-colors min-w-[38px] min-h-[38px] w-10 h-10 md:w-10 md:h-10 flex items-center justify-center">
                                <FaRegSmile className="text-lg md:text-xl" />
                            </Button>
                            <label className="relative cursor-pointer">
                                <div className="rounded-full text-text-2 hover:text-primary transition-colors min-w-[38px] min-h-[38px] w-10 h-10 md:w-10 md:h-10 flex items-center justify-center hover:bg-surface-elevated">
                                    <FaPaperclip className="text-lg md:text-lg" />
                                    <input type="file" name="file-upload" id="file-upload" hidden onChange={handleFileUpload} />
                                </div>
                            </label>
                        </div>

                        <form className="flex-1 flex flex-col gap-1 relative mb-0.5" onSubmit={handleSendMessage}>
                            {replyTo && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-surface-elevated p-1.5 md:p-3 rounded-xl border-l-[3px] border-primary flex justify-between items-center mb-1 shadow-sm"
                                >
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-[11px] font-bold text-primary">{replyTo.senderName}</span>
                                        <p className="text-[12px] text-text-2 truncate">{replyTo.text}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setReplyTo(null)} className="h-5 w-5 rounded-full">
                                        <FaTimes className="text-[8px]" />
                                    </Button>
                                </motion.div>
                            )}
                            <Input
                                ref={inputRef}
                                type="text"
                                name="message"
                                id="message-input"
                                placeholder="Type a message"
                                value={newMessage}
                                onChange={handleInputChange}
                                className="bg-surface/50 border-transparent focus:border-primary/20 focus:bg-surface h-9 md:h-11 shadow-sm rounded-xl px-2.5 md:px-4 py-1.5 text-[14px] md:text-[15px] placeholder:text-text-2/60 transition-all duration-300"
                            />
                        </form>

                        <div className="flex items-center mb-0.5 shrink-0 ml-0.5">
                            {newMessage.trim() === "" ? (
                                <Button variant="ghost" size="icon" className="rounded-full text-text-2 hover:text-primary transition-colors min-w-[38px] min-h-[38px] w-10 h-10 md:w-10 md:h-10 flex items-center justify-center">
                                    <FaMicrophone className="text-lg md:text-xl" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={handleSendMessage}
                                    className="rounded-full min-w-[38px] min-h-[38px] w-10 h-10 md:w-11 md:h-11 p-0 shadow-premium hover:shadow-premium-hover active:scale-95 transition-all flex items-center justify-center"
                                >
                                    <FaPaperPlane className="text-base md:text-lg" />
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
