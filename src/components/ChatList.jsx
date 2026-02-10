import React, { useEffect, useState } from "react";
import { ChatListSkeleton } from "./ui/Skeleton";
import ChatListItem from "./ChatListItem";
import { db } from "../firebase"; // Keeping for search fallback if needed, or move search to service
import { collection, getDocs } from "firebase/firestore"; // For search
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./ui/Avatar";
import { Link } from "react-router-dom";
import { subscribeToUserChats } from "../services/chatListService";
import { searchUsers } from "../services/userService";

const ChatList = ({ searchTerm }) => {
    const { currentUser } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToUserChats(currentUser.uid, (chatData) => {
            // Filter out chats that were cleared after the last message
            const filteredChats = chatData.filter(chat => {
                const clearedAt = chat.clearedBy?.[currentUser.uid]?.toDate?.() || 0;
                const lastMsgTime = chat.lastMessageTimestamp?.toDate?.() || 0;
                return lastMsgTime > clearedAt;
            });
            setChats(filteredChats);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Handle Search
    useEffect(() => {
        const handleSearch = async () => {
            if (!searchTerm || !searchTerm.trim()) {
                setSearchResults([]);
                setSearching(false);
                return;
            }
            setSearching(true);
            try {
                // Optimized Search
                const results = await searchUsers(searchTerm, currentUser.uid);
                setSearchResults(results);
            } catch (e) {
                console.error("Search error:", e);
            }
        };

        const timeout = setTimeout(handleSearch, 300); // Debounce
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
                    <Link to={`/c/${user.id}`} key={user.id} className="flex items-center gap-3 p-3 hover:bg-muted transition-colors cursor-pointer border-b border-border/50">
                        <Avatar src={user.photoURL} alt={user.displayName} size="md" />
                        <div className="flex-1 min-w-0 text-left">
                            <h3 className="font-medium text-foreground truncate">{user.displayName}</h3>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        </div>
                    </Link>
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
