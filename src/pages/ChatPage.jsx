import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs, limit, onSnapshot } from "firebase/firestore";
import ChatWindow from "../components/ChatWindow";
import { listenerManager } from "../utils/ListenerManager";
import { usePresence } from "../contexts/PresenceContext";

const ChatPage = () => {
    const { id } = useParams(); // Could be a chat ID OR a user ID for legacy links
    const { currentUser } = useAuth();
    const { updateActiveChat } = usePresence();
    const [chat, setChat] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!id || !currentUser) return;

        let unsubscribe = () => { };

        const resolveChat = async () => {
            setLoading(true);
            try {
                // Determine potential IDs
                const directChatRef = doc(db, "chats", id);
                const ghostId = [currentUser.uid, id].sort().join("_");
                const ghostChatRef = doc(db, "chats", ghostId);

                // Try finding a private chat with this user ID via query first (Best discovery)
                const q = query(
                    collection(db, "chats"),
                    where("participants", "array-contains", currentUser.uid),
                    where("type", "==", "private"),
                    limit(50)
                );
                let targetRef = null;

                // 1. Try finding a private chat with this user ID via query (already authorized)
                try {
                    const q = query(
                        collection(db, "chats"),
                        where("participants", "array-contains", currentUser.uid),
                        where("type", "==", "private"),
                        limit(50)
                    );
                    const qSnap = await getDocs(q);
                    const existingChatDoc = qSnap.docs.find(d => {
                        const parts = d.data().participants || [];
                        return parts.includes(id);
                    });

                    if (existingChatDoc) {
                        targetRef = existingChatDoc.ref;
                    }
                } catch (e) {
                    console.warn("Chat query error:", e);
                }

                // 2. If not found, check if 'id' is a valid target user for a ghost chat
                if (!targetRef) {
                    try {
                        const userSnap = await getDoc(doc(db, "users", id));
                        if (userSnap.exists()) {
                            targetRef = ghostChatRef;
                        } else {
                            // If it's not a user, it might be a direct chat ID (e.g. group chat)
                            targetRef = directChatRef;
                        }
                    } catch (e) {
                        // If we can't even check the user, it might be a superAdmin or direct chat ID
                        targetRef = directChatRef;
                    }
                }

                if (!targetRef) {
                    setChat(null);
                    setLoading(false);
                    return;
                }

                // Now listen to the target chat document (Real-time)
                const listenerKey = `chat-${targetRef.id}`;

                unsubscribe = onSnapshot(targetRef, async (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();

                        // IDENTITY FIX: If participantInfo is missing, fetch it manually
                        if (data.type === 'private' && !data.participantInfo) {
                            const otherUid = data.participants?.find(uid => uid !== currentUser.uid);
                            if (otherUid) {
                                try {
                                    const userSnap = await getDoc(doc(db, "users", otherUid));
                                    if (userSnap.exists()) {
                                        data.participantInfo = {
                                            [otherUid]: userSnap.data(),
                                            [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                                        };
                                        // Optional: Patch the document for efficiency next time
                                        const { updateDoc } = await import("firebase/firestore");
                                        updateDoc(docSnap.ref, { participantInfo: data.participantInfo }).catch(() => { });
                                    }
                                } catch (e) {
                                    console.warn("Could not fetch missing participant info:", e);
                                }
                            }
                        }

                        // AUTO-UNHIDE: If user visits a hidden chat, unhide it for them
                        if (data.hiddenBy?.includes(currentUser.uid)) {
                            const { updateDoc, arrayRemove } = await import("firebase/firestore");
                            await updateDoc(docSnap.ref, {
                                hiddenBy: arrayRemove(currentUser.uid)
                            });
                        }
                        setChat({ id: docSnap.id, ...data });
                    } else if (targetRef.id === ghostChatRef.id) {
                        // Only handle ghost state if we were specifically looking for this ghost chat
                        try {
                            const userSnap = await getDoc(doc(db, "users", id));
                            if (userSnap.exists()) {
                                setChat({
                                    id: ghostId,
                                    type: "private",
                                    participants: [currentUser.uid, id],
                                    participantInfo: {
                                        [id]: userSnap.data(),
                                        [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                                    },
                                    isGhost: true
                                });
                            } else {
                                setChat(null);
                            }
                        } catch (e) {
                            setChat(null);
                        }
                    } else {
                        setChat(null);
                    }
                    setLoading(false);
                }, (err) => {
                    listenerManager.handleListenerError(err, 'ChatPage');
                    setChat(null);
                    setLoading(false);
                });

                // Register with manager
                listenerManager.subscribe(listenerKey, unsubscribe);

            } catch (error) {
                console.error("Critical error resolving chat:", error);
                setLoading(false);
            }
        };

        if (id) {
            updateActiveChat(id);
        }

        resolveChat();
        return () => {
            unsubscribe();
            updateActiveChat(null);
        };
    }, [id, currentUser?.uid]);

    if (loading) return (
        <div className="h-full flex items-center justify-center p-10 bg-[#efeae2] dark:bg-[#0b141a]">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-whatsapp-teal"></div>
        </div>
    );

    if (!chat) return (
        <div className="h-full flex flex-col items-center justify-center p-10 bg-[#efeae2] dark:bg-[#0b141a] text-center">
            <h2 className="text-xl font-semibold mb-2">Chat not found</h2>
            <button onClick={() => navigate('/')} className="text-whatsapp-teal font-medium hover:underline">Go back to Home</button>
        </div>
    );

    return <ChatWindow chat={chat} setChat={setChat} />;
};

export default ChatPage;
