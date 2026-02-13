import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoCheckmark, IoClose, IoPersonAdd, IoPeopleOutline, IoPlanetOutline } from "react-icons/io5";
import { BsTelephone, BsCameraVideo, BsSearch } from "react-icons/bs";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useCall } from "../contexts/CallContext";
import { useFriend } from "../contexts/FriendContext";
import { useAuth } from "../contexts/AuthContext";
import { getPagedUsers, searchUsers, getUsersByIds } from "../services/userService";
import { Virtuoso } from "react-virtuoso";
import { getChatId } from "../utils/chatUtils";

const ContactsPage = () => {
    const { startCall } = useCall();
    const { currentUser } = useAuth();
    const { sendRequest, acceptRequest, rejectRequest, getFriendStatus, incomingRequests, friends } = useFriend();

    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('friends'); // 'friends', 'discover', or 'requests'

    // Pagination state for Discover
    const [globalUsers, setGlobalUsers] = useState([]);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Friend details fetch
    const [friendUsers, setFriendUsers] = useState([]);
    const friendCacheRef = useRef(new Map());

    useEffect(() => {
        const fetchFriendDetails = async () => {
            if (friends.length === 0) {
                setFriendUsers([]);
                return;
            }

            // 1. Immediately show cached friends (Zero-Wait)
            const initiallyResolved = friends.map(fid => friendCacheRef.current.get(fid)).filter(Boolean);
            setFriendUsers(initiallyResolved);

            const uncachedIds = friends.filter(fid => !friendCacheRef.current.has(fid));
            if (uncachedIds.length === 0) return;

            // 2. Parallelized Fetching (Ultra-Lightning)
            // Instead of waiting for one chunk to finish, we trigger all fetches simultaneously.
            const CHUNK_SIZE = 10;
            const chunks = [];
            for (let i = 0; i < uncachedIds.length; i += CHUNK_SIZE) {
                chunks.push(uncachedIds.slice(i, i + CHUNK_SIZE));
            }

            try {
                // Fetch ALL chunks in parallel
                const chunkResults = await Promise.all(
                    chunks.map(chunk => getUsersByIds(chunk))
                );

                // Update Cache
                chunkResults.flat().forEach(user => {
                    if (user && user.id) friendCacheRef.current.set(user.id, user);
                });

                // Final sync to UI
                setFriendUsers(friends.map(fid => friendCacheRef.current.get(fid)).filter(Boolean));
            } catch (e) {
                console.error("[Contacts] Parallel fetch failed:", e);
            }
        };
        fetchFriendDetails();
    }, [friends]);

    // Initial load for Discover
    useEffect(() => {
        if (view === 'discover' && globalUsers.length === 0) {
            loadInitialGlobalUsers();
        }
    }, [view]);

    const loadInitialGlobalUsers = async () => {
        setLoading(true);
        const { users, lastDoc: newLastDoc } = await getPagedUsers(null, 20, currentUser?.uid);
        setGlobalUsers(users);
        setLastDoc(newLastDoc);
        setHasMore(users.length === 20);
        setLoading(false);
    };

    const loadMoreGlobalUsers = async () => {
        if (loadingMore || !hasMore || !!searchTerm) return;
        setLoadingMore(true);
        const { users, lastDoc: newLastDoc } = await getPagedUsers(lastDoc, 20, currentUser?.uid);
        if (users.length > 0) {
            setGlobalUsers(prev => [...prev, ...users]);
            setLastDoc(newLastDoc);
            setHasMore(users.length === 20);
        } else {
            setHasMore(false);
        }
        setLoadingMore(false);
    };

    // Handle Search
    useEffect(() => {
        const delayDebounce = setTimeout(async () => {
            if (searchTerm.trim().length > 0) {
                setLoading(true);
                try {
                    const results = await searchUsers(searchTerm, currentUser.uid);
                    setSearchResults(results);
                } catch (error) {
                    console.error("Error searching:", error);
                } finally {
                    setLoading(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 200); // 200ms for "instant" feel
        return () => clearTimeout(delayDebounce);
    }, [searchTerm, currentUser.uid]);

    const handleCall = (e, contact, type) => {
        e.stopPropagation();
        e.preventDefault();
        startCall({
            uid: contact.id,
            displayName: contact.displayName || contact.name || "User",
            photoURL: contact.photoURL
        }, type);
    };



    const renderContactItem = (index, contact) => {
        if (!contact) return null;
        const status = getFriendStatus(contact.id);
        const isFriend = status === 'friend';
        const isSent = status === 'sent';
        const isReceived = status === 'received';

        // Generate Canonical Chat ID
        const chatId = getChatId(currentUser?.uid, contact.id);

        return (
            <div className="relative group border-b border-border/10 last:border-0 bg-surface hover:bg-surface-elevated transition-all duration-200">
                <div className="flex items-center gap-4 p-4">
                    <Link
                        to={`/c/${chatId}`}
                        state={{
                            chatData: {
                                id: chatId,
                                participants: [currentUser?.uid, contact.id],
                                type: 'private',
                                participantInfo: {
                                    [contact.id]: { displayName: contact.displayName, photoURL: contact.photoURL },
                                    [currentUser?.uid]: { displayName: currentUser?.displayName, photoURL: currentUser?.photoURL }
                                }
                            }
                        }}
                        onClick={e => !isFriend && e.preventDefault()}
                        className={`flex items-center gap-4 flex-1 min-w-0 ${isFriend ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                        <div className="relative">
                            <Avatar src={contact.photoURL} alt={contact.displayName} size="lg" className="border border-border/20 shadow-sm" />
                            {/* Online Status Indicator */}
                            {contact.isOnline && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-surface rounded-full shadow-sm"></span>}
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-text-1 truncate text-[16px] leading-snug">{contact.displayName || contact.name || "Unknown"}</h3>
                                {isFriend && <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Friend</span>}
                            </div>

                            {/* NEW: Show Email for better identification */}
                            {contact.email && (
                                <p className="text-xs text-text-2/70 truncate font-mono">{contact.email}</p>
                            )}

                            {/* NEW: Show About/Bio */}
                            <p className="text-sm text-text-2/80 truncate mt-0.5">
                                {contact.about || contact.bio || "Hey there! I am using NovaChat."}
                            </p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2 shrink-0">
                        {isFriend ? (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2.5 text-primary bg-primary/5 hover:bg-primary/10 rounded-full transition-colors" onClick={(e) => handleCall(e, contact, 'audio')} title="Audio Call"><BsTelephone className="w-5 h-5" /></button>
                                <button className="p-2.5 text-primary bg-primary/5 hover:bg-primary/10 rounded-full transition-colors" onClick={(e) => handleCall(e, contact, 'video')} title="Video Call"><BsCameraVideo className="w-5 h-5" /></button>
                                <Link to={`/c/${chatId}`} className="p-2.5 text-primary bg-primary/5 hover:bg-primary/10 rounded-full transition-colors" title="Message"><IoPeopleOutline className="w-5 h-5" /></Link>
                            </div>
                        ) : isSent ? (
                            <span className="flex items-center gap-2 text-xs font-bold text-text-2 bg-surface-elevated pl-3 pr-4 py-2 rounded-full border border-border/50 select-none shadow-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                                </span>
                                REQUEST SENT
                            </span>
                        ) : isReceived ? (
                            <button onClick={() => setView('requests')} className="flex items-center gap-1 text-xs font-bold text-white bg-primary px-4 py-2 rounded-full hover:bg-primary-dark transition-all shadow-md active:scale-95">
                                RESPOND
                            </button>
                        ) : (
                            <Button
                                size="sm"
                                className="bg-surface-elevated hover:bg-primary hover:text-white text-text-1 border border-border/50 h-9 px-5 rounded-full text-xs font-bold shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                                onClick={(e) => { e.stopPropagation(); sendRequest(contact.id); }}
                            >
                                <IoPersonAdd className="w-4 h-4" /> ADD FRIEND
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const getDisplayData = () => {
        if (searchTerm) return searchResults;
        if (view === 'friends') return friendUsers;
        if (view === 'discover') return globalUsers;
        return [];
    };

    const displayData = getDisplayData();

    return (
        <div className="flex flex-col h-full bg-surface relative shadow-sm max-w-full overflow-hidden">
            {/* Header */}
            <div className="bg-primary h-[85px] flex items-center px-6 gap-5 text-white shadow-lg shrink-0 z-20">
                <Link to="/" className="text-xl hover:bg-white/10 p-2 rounded-full transition-colors">
                    <IoArrowBack />
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-lg font-bold leading-tight">
                        {view === 'friends' ? 'My Friends' : view === 'discover' ? 'Discover People' : 'Friend Requests'}
                    </h1>
                    <p className="text-xs text-white/80">
                        {searchTerm ? `${searchResults.length} results` : view === 'friends' ? `${friendUsers.length} contacts` : view === 'discover' ? 'Global Directory' : `${incomingRequests.length} pending`}
                    </p>
                </div>
            </div>

            {/* View Switcher Tabs */}
            <div className="flex bg-surface-elevated px-4 pt-0 shadow-sm z-10 shrink-0 border-b border-border/50">
                <button className={`flex-1 py-4 text-xs font-bold uppercase transition-all relative flex items-center justify-center gap-2 ${view === 'friends' ? 'text-primary' : 'text-text-2'}`} onClick={() => setView('friends')}>
                    <IoPeopleOutline className="text-lg" /> Friends
                    {view === 'friends' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
                <button className={`flex-1 py-4 text-xs font-bold uppercase transition-all relative flex items-center justify-center gap-2 ${view === 'discover' ? 'text-primary' : 'text-text-2'}`} onClick={() => setView('discover')}>
                    <IoPlanetOutline className="text-lg" /> Discover
                    {view === 'discover' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
                <button className={`flex-1 py-4 text-xs font-bold uppercase transition-all relative flex items-center justify-center gap-2 ${view === 'requests' ? 'text-primary' : 'text-text-2'}`} onClick={() => setView('requests')}>
                    Requests {incomingRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">{incomingRequests.length}</span>}
                    {view === 'requests' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
            </div>

            {/* Search Bar (Only for Friends/Discover) */}
            {view !== 'requests' && (
                <div className="p-3 bg-surface z-10 border-b border-border/30 space-y-3">
                    <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-2 group-focus-within:text-primary transition-colors"><BsSearch className="w-4 h-4" /></span>
                        <Input placeholder={view === 'friends' ? "Search your friends..." : "Find new people globaly..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-10 bg-surface-elevated border-none placeholder:text-text-2/60 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl text-sm transition-all" />
                    </div>
                </div>
            )}

            {/* ADMIN DEBUG MENU */}
            {(currentUser?.superAdmin || currentUser?.isAdmin) && (
                <div className="px-4 py-2 bg-red-500/5 mt-1 mx-2 rounded-lg border border-red-500/20">
                    <h3 className="text-[10px] uppercase font-bold text-red-500 mb-2 tracking-wider">Admin Zone</h3>
                    <Button
                        onClick={async () => {
                            if (window.confirm("⚠️ DANGER ZONE ⚠️\n\nThis will delete ALL users, chats, and messages (except your account).\n\nAre you sure you want to RESET THE APP?")) {
                                if (window.confirm("Really? There is no undo.")) {
                                    const { httpsCallable, getFunctions } = await import('firebase/functions');
                                    const functions = getFunctions();
                                    const debugResetApp = httpsCallable(functions, 'debugResetApp');

                                    const toast = (await import('react-hot-toast')).default;
                                    const toastId = toast.loading("Reseting App... Do not close.");

                                    try {
                                        await debugResetApp();
                                        toast.success("App Reset Complete!", { id: toastId });
                                        window.location.reload();
                                    } catch (e) {
                                        toast.error("Reset Failed: " + e.message, { id: toastId });
                                    }
                                }
                            }
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white text-xs h-8"
                    >
                        ⛔ FACTORY RESET APP
                    </Button>
                </div>
            )}

            {/* List Content */}
            <div style={{ flex: '1 1 auto', minHeight: "400px", height: '100%' }} className="bg-surface relative overflow-hidden">
                {loading && displayData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-2 animate-pulse gap-3">
                        <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                        <p className="text-sm font-medium">Fetching users...</p>
                    </div>
                ) : view === 'requests' ? (
                    <div className="h-full overflow-y-auto custom-scrollbar">
                        {incomingRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full opacity-60 text-text-2 gap-2">
                                <IoPersonAdd className="w-12 h-12 stroke-1" />
                                <p className="text-sm">No pending requests</p>
                            </div>
                        ) : (
                            incomingRequests.map(req => (
                                <div key={req.id} className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors border-b border-border/30">
                                    <Avatar src={req.fromPhoto} size="lg" />
                                    <div className="flex-1 min-w-0"><h3 className="font-bold text-text-1 truncate text-base">{req.fromName || "Unknown User"}</h3><p className="text-sm text-text-2">Sent you a friend request</p></div>
                                    <div className="flex gap-2">
                                        <button onClick={() => acceptRequest(req)} className="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors"><IoCheckmark className="w-5 h-5" /></button>
                                        <button onClick={() => rejectRequest(req.id)} className="p-2 bg-surface-elevated text-text-2 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"><IoClose className="w-5 h-5" /></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <Virtuoso
                        data={displayData}
                        totalCount={displayData.length}
                        initialItemCount={Math.min(displayData.length, 12)}
                        endReached={view === 'discover' && !searchTerm ? loadMoreGlobalUsers : undefined}
                        itemContent={renderContactItem}
                        increaseViewportBy={500}
                        style={{ height: '100%', width: '100%' }}
                        defaultItemHeight={80}
                        className="custom-scrollbar"
                        components={{
                            Footer: () => (
                                (loadingMore || (view === 'discover' && hasMore && !searchTerm)) ? (
                                    <div className="p-4 text-center text-text-2 text-xs flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                        Loading more...
                                    </div>
                                ) : displayData.length > 0 ? (
                                    <div className="p-10 text-center text-text-2 text-xs opacity-50 font-medium italic">You've reached the end of the list.</div>
                                ) : null
                            ),
                            EmptyPlaceholder: () => (
                                <div className="flex flex-col items-center justify-center h-full text-center text-text-2 p-10 gap-3 opacity-60">
                                    <IoPeopleOutline className="w-16 h-16 stroke-1" />
                                    <p className="text-sm">No one here yet. Try a different search!</p>
                                </div>
                            )
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default ContactsPage;
