import React, { useEffect, useState } from "react";
import { ChatListSkeleton } from "./ui/Skeleton";
import ChatListItem from "./ChatListItem";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./ui/Avatar";
import { Link } from "react-router-dom";
import { subscribeToUserChats } from "../services/chatListService";
import { searchUsers } from "../services/userService";
import { useFriend } from "../contexts/FriendContext";
import { IoPersonAdd } from "react-icons/io5";

const SearchAction = ({ userId }) => {
    const { getFriendStatus, sendRequest } = useFriend();
    const status = getFriendStatus(userId);

    if (status === 'friend') return <span className="text-[10px] font-bold text-whatsapp-teal bg-whatsapp-teal/10 px-2 py-1 rounded">FRIEND</span>;
    if (status === 'sent') return <span className="text-[10px] font-bold text-text-2 bg-muted px-2 py-1 rounded">SENT</span>;
    if (status === 'received') return <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">PENDING</span>;

    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                sendRequest(userId);
            }}
            className="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors"
        >
            <IoPersonAdd className="w-4 h-4" />
        </button>
    );
};

const ChatList = ({ searchTerm }) => {
    const { currentUser } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToUserChats(currentUser.uid, (chatData) => {
            const filteredChats = chatData.filter(chat => {
                const clearedAt = chat.clearedBy?.[currentUser.uid]?.toDate?.() || 0;
                const lastMsgTime = chat.lastMessageTimestamp?.toDate?.() || 0;
                const isHidden = chat.hiddenBy?.includes(currentUser.uid);
                return lastMsgTime > clearedAt && !isHidden;
            });
            setChats(filteredChats);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => {
        const handleSearch = async () => {
            if (!searchTerm || !searchTerm.trim()) {
                setSearchResults([]);
                setSearching(false);
                return;
            }
            setSearching(true);
            try {
                const results = await searchUsers(searchTerm, currentUser.uid);
                setSearchResults(results);
            } catch (e) {
                console.error("Search error:", e);
            }
        };

        const timeout = setTimeout(handleSearch, 300);
        return () => clearTimeout(timeout);
    }, [searchTerm, currentUser]);

    if (loading) {
        return <ChatListSkeleton />;
    }

    if (chats.length === 0 && !searching) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
                <p>No chats yet.</p>
                <p className="text-sm">Start a new conversation from contacts.</p>
            </div>
        );
    }

    if (searching) {
        if (searchResults.length === 0) {
            return <div className="p-4 text-center text-muted-foreground">No users found.</div>;
        }
        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-2 text-xs font-semibold text-whatsapp-teal uppercase">Search Results</div>
                {searchResults.map(user => (
                    <div key={user.id} className="relative group border-b border-border/30 last:border-0 hover:bg-surface-elevated transition-colors">
                        <Link to={`/c/${user.id}`} className="flex items-center gap-4 p-4 cursor-pointer">
                            <Avatar src={user.photoURL} alt={user.displayName} size="lg" />
                            <div className="flex-1 min-w-0 text-left">
                                <h3 className="font-bold text-text-1 truncate text-[16px]">{user.displayName}</h3>
                                <p className="text-sm text-text-2 truncate">{user.email}</p>
                            </div>
                        </Link>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            <SearchAction userId={user.id} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            {chats.map((chat) => (
                <ChatListItem key={chat.id} chat={chat} currentUserId={currentUser.uid} />
            ))}
        </div>
    );
};

export default ChatList;
