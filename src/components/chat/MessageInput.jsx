import React, { useState, useEffect, useRef } from "react";
import { FaRegSmile, FaPaperclip, FaMicrophone, FaPaperPlane, FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { getSmartReplies } from "../../services/AIAgentService";
import { lightningSync } from "../../services/LightningService";

export function MessageInput({
    handleSendMessage,
    handleFileUpload,
    replyTo,
    setReplyTo,
    inputRef,
    chat,
    otherUser,
    messages,
    currentUser
}) {
    const [text, setText] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const typingTimeoutRef = useRef(null);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!messages || messages.length === 0) return;
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.senderId === otherUser.uid && lastMessage.type === 'text') {
                setIsLoadingSuggestions(true);
                try {
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
        setText(suggestion);
        setSuggestions([]);
        inputRef.current?.focus();
    };

    const onInputChange = (e) => {
        const val = e.target.value;
        setText(val);

        if (!chat?.id || !currentUser?.uid) return;

        // Typing indicator
        lightningSync.setTyping(chat.id, currentUser.uid, true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            lightningSync.setTyping(chat.id, currentUser.uid, false);
        }, 3000);
    };

    const onSubmit = async (e) => {
        if (e) e.preventDefault();
        const textToSend = text.trim();
        if (!textToSend && !replyTo) return;

        setIsSending(true);
        const savedText = text;
        const savedReply = replyTo;

        setText(""); // Clear immediately

        try {
            await handleSendMessage(textToSend, savedReply);
            setSuggestions([]);
            // Ensure typing is cleared
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            lightningSync.setTyping(chat.id, currentUser.uid, false);
        } catch (err) {
            // Restore on failure
            setText(savedText);
            setReplyTo(savedReply);
            alert(`Failed to send: ${err.message || 'Check connection'}`);
        } finally {
            setIsSending(false);
        }
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

                        <form className="flex-1 flex flex-col gap-1 relative mb-0.5" onSubmit={onSubmit}>
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
                                value={text}
                                onChange={onInputChange}
                                autoComplete="off"
                                className="bg-surface/50 border-transparent focus:border-primary/20 focus:bg-surface h-9 md:h-11 shadow-sm rounded-xl px-2.5 md:px-4 py-1.5 text-[14px] md:text-[15px] placeholder:text-text-2/60 transition-all duration-300"
                            />
                        </form>

                        <div className="flex items-center mb-0.5 shrink-0 ml-0.5">
                            {text.trim() === "" ? (
                                <Button variant="ghost" size="icon" className="rounded-full text-text-2 hover:text-primary transition-colors min-w-[38px] min-h-[38px] w-10 h-10 md:w-10 md:h-10 flex items-center justify-center">
                                    <FaMicrophone className="text-lg md:text-xl" />
                                </Button>
                            ) : (
                                <Button
                                    onClick={onSubmit}
                                    disabled={isSending}
                                    className="rounded-full min-w-[38px] min-h-[38px] w-10 h-10 md:w-11 md:h-11 p-0 shadow-premium hover:shadow-premium-hover active:scale-95 transition-all flex items-center justify-center disabled:opacity-50"
                                >
                                    <FaPaperPlane className={`text-base md:text-lg ${isSending ? 'animate-pulse' : ''}`} />
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export const MemoizedMessageInput = React.memo(MessageInput);
export default MemoizedMessageInput;
