import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoCheckmark, IoClose, IoPersonAdd } from "react-icons/io5";
import { BsTelephone, BsCameraVideo, BsSearch } from "react-icons/bs";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useCall } from "../contexts/CallContext";
import { useFriend } from "../contexts/FriendContext";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

const ContactsPage = () => {
    const { startCall } = useCall();
    const { currentUser } = useAuth();
    const { sendRequest, acceptRequest, rejectRequest, getFriendStatus, incomingRequests } = useFriend();
    const [contacts, setContacts] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('all'); // 'all' or 'requests'

    useEffect(() => {
        const fetchUsers = async () => {
            if (!currentUser) return;
            try {
                const querySnapshot = await getDocs(collection(db, "users"));
                const users = [];
                querySnapshot.forEach((doc) => {
                    if (doc.id !== currentUser.uid) {
                        users.push({ id: doc.id, ...doc.data() });
                    }
                });
                setContacts(users);
            } catch (error) {
                console.error("Error fetching contacts:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [currentUser]);

    const handleCall = (e, contact, type) => {
        e.stopPropagation();
        e.preventDefault();
        const user = {
            uid: contact.id,
            displayName: contact.displayName || contact.name || "User",
            photoURL: contact.photoURL
        };
        startCall(user, type);
    };

    const handleSendRequest = (e, uid) => {
        e.stopPropagation();
        e.preventDefault();
        sendRequest(uid);
    }

    const filteredContacts = contacts.filter(contact =>
        (contact.displayName || contact.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-surface md:max-w-2xl md:mx-auto md:border-x md:border-border relative shadow-sm">
            {/* Header */}
            <div className="bg-primary h-[70px] flex items-center px-4 gap-4 text-white shadow-md shrink-0 z-20">
                <Link to="/" className="text-xl hover:bg-white/10 p-2 rounded-full transition-colors">
                    <IoArrowBack />
                </Link>
                <div className="flex flex-col">
                    <h1 className="text-lg font-bold leading-tight">Select Contact</h1>
                    <p className="text-xs text-white/80">{contacts.length} contacts</p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-surface-elevated px-4 pt-0 shadow-sm z-10 shrink-0 border-b border-border/50">
                <button
                    className={`flex-1 py-4 text-sm font-medium uppercase transition-all relative ${view === 'all'
                        ? 'text-primary'
                        : 'text-text-2 hover:text-text-1'
                        }`}
                    onClick={() => setView('all')}
                >
                    All Contacts
                    {view === 'all' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
                <button
                    className={`flex-1 py-4 text-sm font-medium uppercase transition-all relative ${view === 'requests'
                        ? 'text-primary'
                        : 'text-text-2 hover:text-text-1'
                        }`}
                    onClick={() => setView('requests')}
                >
                    Requests
                    {incomingRequests.length > 0 && (
                        <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {incomingRequests.length}
                        </span>
                    )}
                    {view === 'requests' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-surface custom-scrollbar">
                {view === 'all' && (
                    <div className="p-3 bg-surface sticky top-0 z-10 border-b border-border/30">
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-2 group-focus-within:text-primary transition-colors">
                                <BsSearch className="w-4 h-4" />
                            </span>
                            <Input
                                placeholder="Search friends"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 h-10 bg-surface-elevated border-none placeholder:text-text-2/60 focus-visible:ring-1 focus-visible:ring-primary/50 rounded-xl text-sm transition-all"
                            />
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-text-2 animate-pulse">Loading contacts...</div>
                ) : view === 'requests' ? (
                    <div className="pb-4">
                        {incomingRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-60 text-text-2 gap-2">
                                <IoPersonAdd className="w-12 h-12 stroke-1" />
                                <p>No pending friend requests</p>
                            </div>
                        ) : (
                            incomingRequests.map(req => (
                                <div key={req.id} className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors border-b border-border/30">
                                    <Avatar src={req.fromPhoto} size="lg" />
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-text-1 truncate text-base">{req.fromName || "Unknown User"}</h3>
                                        <p className="text-sm text-text-2">Sent you a friend request</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => acceptRequest(req)} className="p-2 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors">
                                            <IoCheckmark className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => rejectRequest(req.id)} className="p-2 bg-surface-elevated text-text-2 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors">
                                            <IoClose className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="pb-4">
                        {filteredContacts.length === 0 ? (
                            <div className="p-8 text-center text-text-2">
                                <p>No contacts found.</p>
                            </div>
                        ) : (
                            filteredContacts.map(contact => {
                                const status = getFriendStatus(contact.id);
                                const isFriend = status === 'friend';
                                const isSent = status === 'sent';
                                const isReceived = status === 'received';

                                return (
                                    <div key={contact.id} className="relative group border-b border-border/30 last:border-0">
                                        {/* Clickable Area for Friends */}
                                        {isFriend ? (
                                            <Link to={`/c/${contact.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors cursor-pointer">
                                                <Avatar src={contact.photoURL} alt={contact.displayName} size="lg" />
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-text-1 truncate text-[16px]">{contact.displayName || contact.name || "Unknown"}</h3>
                                                    <p className="text-sm text-text-2 truncate">{contact.about || "Hey there! I am using WhatsClone AI."}</p>
                                                </div>
                                            </Link>
                                        ) : (
                                            <div className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors">
                                                <Avatar src={contact.photoURL} alt={contact.displayName} size="lg" />
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-text-1 truncate text-[16px]">{contact.displayName || contact.name || "Unknown"}</h3>
                                                    <p className="text-sm text-text-2 truncate">{contact.about || "Hey there! I am using WhatsClone AI."}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Action Buttons Overlay */}
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                            {isFriend ? (
                                                <>
                                                    <button
                                                        className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                                                        onClick={(e) => handleCall(e, contact, 'audio')}
                                                    >
                                                        <BsTelephone className="w-5 h-5" />
                                                    </button>
                                                    <button
                                                        className="p-2 text-primary hover:bg-primary/10 rounded-full transition-colors"
                                                        onClick={(e) => handleCall(e, contact, 'video')}
                                                    >
                                                        <BsCameraVideo className="w-5 h-5" />
                                                    </button>
                                                </>
                                            ) : isSent ? (
                                                <span className="text-xs font-bold text-text-2 bg-surface-elevated px-3 py-1.5 rounded-full border border-border/50">SENT</span>
                                            ) : isReceived ? (
                                                <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full">CHECK REQUESTS</span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="bg-primary hover:bg-primary/90 text-white h-8 px-4 rounded-full text-xs font-bold gap-1 shadow-sm"
                                                    onClick={(e) => handleSendRequest(e, contact.id)}
                                                >
                                                    <IoPersonAdd className="w-4 h-4" />
                                                    ADD
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ContactsPage;
