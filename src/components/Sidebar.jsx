import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ChatList from "./ChatList";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { FiMoreVertical, FiSearch, FiLoader } from "react-icons/fi";
import { BiCommentDetail } from "react-icons/bi";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import CreateGroupModal from "./CreateGroupModal";
import { logoutUser } from "../services/authService";
import { createGeminiChat } from "../services/chatService";
import { cn } from "../lib/utils";

const Sidebar = React.memo(() => {
    const { currentUser } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [showMenu, setShowMenu] = useState(false);
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await logoutUser(currentUser.uid);
        } catch (error) {
            console.error("Failed to log out", error);
        }
    };

    const handleCreateGeminiChat = async () => {
        if (!currentUser) return;
        try {
            const chatId = await createGeminiChat(currentUser.uid);
            setSearchTerm("");
            if (chatId) {
                navigate(`/c/${chatId}`);
            }
        } catch (error) {
            console.error("Failed to start Gemini chat", error);
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface-elevated border-r border-border/50 relative shadow-premium transition-all duration-300">
            {/* Header */}
            {/* Header - Hidden on Mobile because of BottomNav */}
            <div className="hidden md:flex h-[75px] px-6 py-4 items-center justify-between glass border-b border-border/50 z-20 shrink-0">
                <h1 className="text-3xl font-extrabold text-foreground tracking-tight py-2">Chats</h1>
                <div className="flex gap-1.5 text-muted-foreground relative shrink-0">
                    <Link to="/status">
                        <Button variant="ghost" size="icon" className="rounded-full" title="Status">
                            <FiLoader className="w-5 h-5" />
                        </Button>
                    </Link>
                    <Link to="/contacts">
                        <Button variant="ghost" size="icon" className="rounded-full" title="New Chat">
                            <BiCommentDetail className="w-5 h-5" />
                        </Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="rounded-full" title="Ask AI" onClick={handleCreateGeminiChat}>
                        <span className="text-lg">✨</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-full" title="Toggle Theme" onClick={toggleTheme}>
                        <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                    </Button>
                    <div className="relative">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn("rounded-full", showMenu ? 'bg-surface' : '')}
                            title="Menu"
                            onClick={() => setShowMenu(!showMenu)}
                        >
                            <FiMoreVertical className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Mobile Header (Title) */}
            <div className="md:hidden h-14 px-4 flex items-center justify-between glass border-b border-border/50 shrink-0">
                <h1 className="text-xl font-bold text-primary">Nova</h1>
                <div className="flex gap-2 relative">
                    <Button variant="ghost" size="icon" className="rounded-full" title="Ask AI" onClick={handleCreateGeminiChat}>
                        <span className="text-lg">✨</span>
                    </Button>
                    <Link to="/contacts">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <BiCommentDetail className="w-5 h-5" />
                        </Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowMenu(!showMenu)}>
                        <FiMoreVertical className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Sidebar Dropdown Menu (Shared for Mobile and Desktop) */}
            {showMenu && (
                <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowMenu(false)}></div>
                    <div className="absolute top-[65px] right-4 md:right-6 w-56 bg-surface rounded-2xl shadow-premium-hover py-2 border border-border/50 z-[101] animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-hidden">
                        <button
                            className="w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium"
                            onClick={() => {
                                setShowGroupModal(true);
                                setShowMenu(false);
                            }}
                        >
                            New group
                        </button>
                        <Link
                            to="/profile"
                            className="block w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium "
                            onClick={() => setShowMenu(false)}
                        >
                            Profile
                        </Link>
                        <Link
                            to="/settings"
                            className="block w-full text-left px-4 py-3 text-[14px] text-text-1 hover:bg-surface-elevated transition-colors font-medium"
                            onClick={() => setShowMenu(false)}
                        >
                            Settings
                        </Link>
                        <div className="h-px bg-border/50 my-1 mx-2" />
                        <button
                            className="w-full text-left px-4 py-3 text-[14px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors font-medium"
                            onClick={handleLogout}
                        >
                            Log out
                        </button>
                    </div>
                </>
            )}

            {/* Search */}
            <div className="px-4 py-3 border-b border-border/30 bg-surface-elevated z-10 transition-all duration-300">
                <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-2 group-focus-within:text-primary z-10 transition-colors">
                        <FiSearch className="h-4.5 w-4.5" />
                    </span>
                    <Input
                        placeholder="Search or start new chat"
                        className="pl-11 h-10 bg-surface border border-transparent focus:border-primary/30 placeholder:text-text-2/60 text-[14px] shadow-sm transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 min-h-0 bg-surface-elevated">
                <ChatList searchTerm={searchTerm} />
            </div>

            {/* Modals */}
            {showGroupModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-md animate-in slide-in-from-bottom-4 duration-300">
                        <CreateGroupModal onClose={() => setShowGroupModal(false)} />
                    </div>
                </div>
            )}
        </div>
    );
});

export default Sidebar;
