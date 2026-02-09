import React, { useState } from "react";
import { FaPhone, FaVideo, FaSearch, FaEllipsisV, FaArrowLeft } from "react-icons/fa";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

export default function ChatHeader({
    otherUser,
    presence,
    getStatusText,
    startCall,
    chat,
    onBack,
    onShowInfo,
    onToggleSearch,
    showSearch
}) {
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);

    return (
        <div className="h-[60px] md:h-[72px] px-2 md:px-6 flex justify-between items-center glass border-b border-border/30 z-20 shrink-0 sticky top-0 shadow-sm transition-all">
            <div className="flex items-center gap-2 md:gap-4 cursor-pointer overflow-hidden flex-1 group" onClick={onShowInfo}>
                <button
                    className="md:hidden text-text-2 p-1.5 -ml-1 hover:bg-surface-elevated rounded-full shrink-0 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onBack(); }}
                >
                    <FaArrowLeft className="text-lg" />
                </button>
                <Avatar
                    src={otherUser.photoURL}
                    alt={otherUser.displayName}
                    size="md"
                    className="h-9 w-9 md:h-11 md:w-11 shrink-0 transition-transform group-hover:scale-105"
                />
                <div className="flex flex-col justify-center min-w-0">
                    <h3 className="font-semibold text-text-1 text-[15px] md:text-[16px] leading-snug truncate group-hover:text-primary transition-colors">
                        {otherUser.displayName}
                    </h3>
                    <p className={cn(
                        "text-[11px] md:text-[12px] leading-tight truncate transition-colors max-w-[150px] md:max-w-none",
                        presence?.state === 'online' ? "text-primary font-semibold" : "text-text-2"
                    )}>
                        {getStatusText()}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-0.5 md:gap-2 text-text-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full hover:text-text-1 w-9 h-9 md:w-10 md:h-10"
                    onClick={() => startCall(otherUser, 'video', chat.id)}
                >
                    <FaVideo className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full hover:text-text-1 w-9 h-9 md:w-10 md:h-10"
                    onClick={() => startCall(otherUser, 'audio', chat.id)}
                >
                    <FaPhone className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </Button>

                <div className="h-6 w-px bg-border/50 mx-1 hidden md:block"></div>

                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("rounded-full transition-colors w-9 h-9 md:w-10 md:h-10 hidden md:inline-flex", showSearch ? "text-primary bg-primary/10" : "hover:text-text-1")}
                    onClick={onToggleSearch}
                >
                    <FaSearch className="w-4 h-4" />
                </Button>

                <div className="relative">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("rounded-full transition-colors w-9 h-9 md:w-10 md:h-10", showHeaderMenu ? "bg-surface-elevated text-text-1" : "hover:text-text-1")}
                        onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                    >
                        <FaEllipsisV className="w-4 h-4" />
                    </Button>

                    {showHeaderMenu && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowHeaderMenu(false)}></div>
                            <div className="absolute top-12 right-0 w-56 bg-surface rounded-2xl shadow-premium-hover py-2 border border-border/50 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-hidden">
                                <button
                                    className="w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium"
                                    onClick={() => {
                                        onShowInfo();
                                        setShowHeaderMenu(false);
                                    }}
                                >
                                    Contact info
                                </button>
                                <button
                                    className="w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium md:hidden"
                                    onClick={() => {
                                        onToggleSearch();
                                        setShowHeaderMenu(false);
                                    }}
                                >
                                    Search messages
                                </button>
                                <button
                                    className="w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium"
                                    onClick={() => setShowHeaderMenu(false)}
                                >
                                    Close chat
                                </button>
                                <div className="h-px bg-border/50 my-1 mx-2" />
                                <button
                                    className="w-full text-left px-4 py-3 text-[14px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors font-medium"
                                    onClick={() => setShowHeaderMenu(false)}
                                >
                                    Delete chat
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
