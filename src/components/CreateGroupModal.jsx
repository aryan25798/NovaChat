import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, serverTimestamp, getDoc, doc, query, where, documentId, getDocs } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useFriend } from "../contexts/FriendContext";
import { FaTimes, FaCheck, FaSearch, FaUsers } from "react-icons/fa";
import { Button } from "./ui/Button";
import { Avatar } from "./ui/Avatar";
import { Input } from "./ui/Input";

export default function CreateGroupModal({ onClose }) {
    const [groupName, setGroupName] = useState("");
    const [friendList, setFriendList] = useState([]);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const { currentUser } = useAuth();
    const { friends } = useFriend();

    useEffect(() => {
        const fetchFriendsData = async () => {
            if (!friends || friends.length === 0) {
                setLoading(false);
                return;
            }

            try {
                // Optimize: Chunked Queries to avoid N+1 reads
                // Firestore 'in' query supports max 10 items.
                const friendChunks = [];
                for (let i = 0; i < friends.length; i += 10) {
                    friendChunks.push(friends.slice(i, i + 10));
                }

                const friendsData = [];

                // Process chunks
                await Promise.all(friendChunks.map(async (chunk) => {
                    if (chunk.length === 0) return;
                    const q = query(
                        collection(db, "users"),
                        where(documentId(), 'in', chunk)
                    );
                    const querySnapshot = await getDocs(q);
                    querySnapshot.forEach(doc => {
                        friendsData.push({ id: doc.id, ...doc.data() });
                    });
                }));

                setFriendList(friendsData);
            } catch (error) {
                console.error("Error fetching friends:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFriendsData();
    }, [friends]);

    const handleSelectUser = (uid) => {
        if (selectedUsers.includes(uid)) {
            setSelectedUsers(selectedUsers.filter(id => id !== uid));
        } else {
            setSelectedUsers([...selectedUsers, uid]);
        }
    };

    const createGroup = async () => {
        if (!groupName || selectedUsers.length === 0) return;

        try {
            const participants = [currentUser.uid, ...selectedUsers];
            const chatRole = {
                [currentUser.uid]: "admin"
            };
            selectedUsers.forEach(uid => chatRole[uid] = "member");

            // Build participantInfo for faster lookup
            const participantInfo = {
                [currentUser.uid]: {
                    displayName: currentUser.displayName,
                    photoURL: currentUser.photoURL
                }
            };

            selectedUsers.forEach(uid => {
                const user = friendList.find(f => f.id === uid);
                participantInfo[uid] = {
                    displayName: user.displayName,
                    photoURL: user.photoURL
                };
            });

            await addDoc(collection(db, "chats"), {
                type: "group",
                groupName,
                groupAdmin: currentUser.uid,
                participants,
                chatRole,
                participantInfo,
                lastMessage: { text: `${currentUser.displayName} created this group` },
                lastMessageTimestamp: serverTimestamp(),
                photoURL: "https://upload.wikimedia.org/wikipedia/commons/9/93/Google_Contacts_icon.svg" // Placeholder
            });

            onClose();
        } catch (error) {
            console.error("Error creating group:", error);
        }
    };

    const filteredFriends = friendList.filter(f =>
        f.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-background w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-whatsapp-teal px-6 py-4 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                    <FaUsers className="text-xl" />
                    <h2 className="text-lg font-semibold">New Group</h2>
                </div>
                <button onClick={onClose} className="hover:bg-black/10 p-2 rounded-full transition-colors">
                    <FaTimes />
                </button>
            </div>

            <div className="p-6 space-y-6">
                {/* Group Details */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-whatsapp-teal uppercase tracking-wider">Group Name</label>
                    <Input
                        placeholder="Enter group subject"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="h-11 text-base border-0 border-b-2 border-muted focus-visible:ring-0 focus-visible:border-whatsapp-teal rounded-none px-0 transition-all bg-transparent"
                    />
                </div>

                {/* Participant Selection */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Add Friends ({selectedUsers.length})
                        </label>
                    </div>

                    <div className="relative">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
                        <Input
                            placeholder="Search friends"
                            className="h-9 pl-9 bg-muted border-none rounded-lg text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                        {loading ? (
                            <div className="py-10 text-center text-muted-foreground italic text-sm">
                                Loading friends...
                            </div>
                        ) : filteredFriends.length === 0 ? (
                            <div className="py-10 text-center text-muted-foreground italic text-sm">
                                {searchTerm ? "No friends found matching search" : "No friends found to add"}
                            </div>
                        ) : (
                            filteredFriends.map(friend => (
                                <div
                                    key={friend.id}
                                    className={`flex items-center gap-4 p-2 rounded-lg cursor-pointer transition-colors ${selectedUsers.includes(friend.id) ? 'bg-whatsapp-teal/10' : 'hover:bg-muted'
                                        }`}
                                    onClick={() => handleSelectUser(friend.id)}
                                >
                                    <div className="relative">
                                        <Avatar src={friend.photoURL} alt={friend.displayName} size="md" />
                                        {selectedUsers.includes(friend.id) && (
                                            <div className="absolute -bottom-1 -right-1 bg-whatsapp-teal text-white rounded-full p-0.5 border-2 border-background">
                                                <FaCheck className="w-2 h-2" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-foreground truncate">{friend.displayName}</p>
                                        <p className="text-xs text-muted-foreground truncate italic">{friend.bio || "Available"}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/30 border-t border-border flex justify-end gap-3">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button
                    variant="primary"
                    className="bg-whatsapp-teal hover:bg-whatsapp-dark text-white rounded-full px-8"
                    onClick={createGroup}
                    disabled={!groupName || selectedUsers.length === 0}
                >
                    Create Group
                </Button>
            </div>
        </div>
    );
}

