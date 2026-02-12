import React, { useEffect, useState, useMemo } from "react";
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
import { Virtuoso } from "react-virtuoso";
import { cn } from "../lib/utils";
import { getChatId } from "../utils/chatUtils";

const SearchAction = React.memo(({ userId }) => {
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
});

// Persistent cache for chat list to prevent "white flash" on re-mount
let cachedChats = [];
let hasInitiallyLoaded = false;

const ChatList = React.memo(({ searchTerm }) => {
    const { currentUser } = useAuth();
    const [chats, setChats] = useState(cachedChats);
    const [loading, setLoading] = useState(!hasInitiallyLoaded);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!currentUser) {
            // Clear cache on logout to prevent data leakage/stale state
            cachedChats = [];
            hasInitiallyLoaded = false;
            setChats([]);
            setLoading(false);
            return;
        }

        const unsubscribe = subscribeToUserChats(currentUser.uid, (chatData) => {
            const filteredChats = chatData.filter(chat => {
                const clearedAt = chat.clearedAt?.[currentUser.uid]?.toDate?.() || 0;
                const lastMsgTime = chat.lastMessageTimestamp?.toDate?.() || null;
                const isHidden = chat.hiddenBy?.includes(currentUser.uid);
                // Allow chats with pending (null) timestamps to show up
                return (!lastMsgTime || lastMsgTime > clearedAt) && !isHidden;
            });
            cachedChats = filteredChats;
            setChats(filteredChats);
            setLoading(false);
            hasInitiallyLoaded = true;
        }, 30, 'ChatList');

        return () => unsubscribe();
    }, [currentUser]);

    // Filter AND Sort existing chats locally
    const filteredChats = useMemo(() => {
        let result = chats;

        if (searchTerm && searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase().trim();
            result = result.filter(chat => {
                const chatName = (chat.name || chat.chatName || '').toLowerCase();
                const participantNames = (chat.participantNames || []).map(n => (n || '').toLowerCase());
                return chatName.includes(lowerTerm) || participantNames.some(n => n.includes(lowerTerm));
            });
        }

        return result;
    }, [chats, searchTerm]);

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
            } finally {
                setSearching(false);
            }
        };

        const timeout = setTimeout(handleSearch, 200);
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

    // When searching: show combined results in a virtualized list
    if (searching || (searchTerm && searchTerm.trim())) {
        // Deduplicate: Exclude users from searchResults if they already appear in filteredChats
        const activeChatUserIds = new Set(
            chats.flatMap(c => c.participants || [])
                .filter(uid => uid !== currentUser.uid)
        );

        const uniquePeopleResults = searchResults.filter(u => !activeChatUserIds.has(u.id));

        const combinedResults = [
            ...(filteredChats.length > 0 ? [{ type: 'header', label: 'Chats' }, ...filteredChats] : []),
            ...(uniquePeopleResults.length > 0 ? [{ type: 'header', label: 'People' }, ...uniquePeopleResults] : [])
        ];

        return (
            <div style={{ flex: '1 1 auto', minHeight: "300px", height: '100%' }} className="w-full h-full relative overflow-hidden">
                <Virtuoso
                    data={combinedResults}
                    style={{ height: '100%', width: '100%' }}
                    totalCount={combinedResults.length}
                    initialItemCount={Math.min(combinedResults.length, 12)}
                    increaseViewportBy={300}
                    defaultItemHeight={72}
                    className="custom-scrollbar"
                    itemContent={(index, item) => {
                        if (!item) return null;

                        if (item.type === 'header') {
                            return (
                                <div className={cn(
                                    "p-2 text-xs font-semibold uppercase sticky top-0 bg-surface z-20",
                                    item.label === 'Chats' ? "text-muted-foreground" : "text-whatsapp-teal"
                                )}>
                                    {item.label}
                                </div>
                            );
                        }

                        // Case 1: Active Chat Item
                        if (item.participants || item.lastMessage) {
                            return <ChatListItem key={item.id} chat={item} currentUserId={currentUser.uid} />;
                        }

                        // Case 2: User Search Result (Search mode)
                        return (
                            <Link
                                to={`/c/${getChatId(currentUser.uid, item.id)}`}
                                key={item.id}
                                className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors border-b border-border/10"
                            >
                                <Avatar src={item.photoURL} alt={item.displayName} size="lg" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-text-1 truncate">{item.displayName || "Unknown User"}</h3>
                                    <p className="text-sm text-text-2 truncate">{item.email || "Click to start chatting"}</p>
                                </div>
                            </Link>
                        );
                    }}
                    components={{
                        EmptyPlaceholder: () => (
                            !searching && <div className="p-4 text-center text-muted-foreground">No results found.</div>
                        ),
                        Footer: () => (
                            <div className="p-4 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground border-t border-border/10 mt-10">
                                {searching ? (
                                    <>
                                        <div className="w-3 h-3 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    combinedResults.length === 0 && <p>No results found for "{searchTerm}"</p>
                                )}
                            </div>
                        )
                    }}
                />
            </div>
        );
    }

    return (
        <div style={{ flex: '1 1 auto', minHeight: "300px", height: '100%' }} className="h-full w-full relative overflow-hidden">
            <Virtuoso
                data={chats}
                useWindowScroll={false}
                totalCount={chats.length}
                initialItemCount={Math.min(chats.length, 12)}
                increaseViewportBy={300}
                style={{ height: '100%', width: '100%' }}
                defaultItemHeight={72}
                itemContent={(index, chat) => {
                    if (!chat || !currentUser) return null;
                    return <ChatListItem key={chat.id} chat={chat} currentUserId={currentUser.uid} />;
                }}
                components={{
                    Header: () => <div className="h-2" />,
                    Footer: () => <div className="h-4" />,
                }}
                className="custom-scrollbar"
            />
        </div>
    );
});

export default ChatList;
