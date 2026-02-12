import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs, limit, onSnapshot, updateDoc } from "firebase/firestore";
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

        let isCancelled = false;
        let unsubscribe = () => { };

        const resolveChat = async () => {
            setLoading(true);
            try {
                const { GEMINI_BOT_ID } = await import("../constants");
                const isBot = id === GEMINI_BOT_ID || id.startsWith('gemini_');

                let targetRef = null;
                const ghostId = isBot ? id : [currentUser.uid, id].sort().join("_");
                const ghostChatRef = doc(db, "chats", ghostId);

                if (isBot) {
                    targetRef = ghostChatRef;
                } else {
                    // Try direct ID first
                    const directRef = doc(db, "chats", id);
                    try {
                        const snap = await getDoc(directRef);
                        if (snap.exists() && !isCancelled) {
                            targetRef = directRef;
                        }
                    } catch (e) { }
                }

                if (!targetRef && !isCancelled) {
                    // Check if 'id' is a user UID
                    try {
                        const userSnap = await getDoc(doc(db, "users", id));
                        if (userSnap.exists()) {
                            targetRef = ghostChatRef;
                        }
                    } catch (e) { }
                }

                if (!targetRef && !isCancelled) {
                    // Fallback: search for private chat match
                    const q = query(
                        collection(db, "chats"),
                        where("participants", "array-contains", currentUser.uid),
                        where("type", "==", "private"),
                        limit(50)
                    );
                    const qSnap = await getDocs(q);
                    const match = qSnap.docs.find(d => (d.data().participants || []).includes(id));
                    if (match) targetRef = match.ref;
                }

                if (!targetRef || isCancelled) {
                    if (!isCancelled) {
                        setChat(null);
                        setLoading(false);
                    }
                    return;
                }

                const listenerKey = `chat-${targetRef.id}`;
                unsubscribe = onSnapshot(targetRef, async (docSnap) => {
                    if (isCancelled) return;

                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        // Self-healing metadata
                        if (data.type === 'private' && !data.participantInfo) {
                            const otherUid = data.participants?.find(uid => uid !== currentUser.uid);
                            if (otherUid) {
                                const uSnap = await getDoc(doc(db, "users", otherUid));
                                if (uSnap.exists()) {
                                    data.participantInfo = {
                                        [otherUid]: uSnap.data(),
                                        [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                                    };
                                    updateDoc(docSnap.ref, { participantInfo: data.participantInfo }).catch(() => { });
                                }
                            }
                        }
                        setChat({ id: docSnap.id, ...data });
                    } else if (targetRef.id === ghostChatRef.id) {
                        // Handle ghost creation state (including bot)
                        if (isBot) {
                            setChat({
                                id: id,
                                type: "gemini",
                                participants: [currentUser.uid, id],
                                isGhost: true,
                                groupName: "Gemini AI",
                                participantInfo: {
                                    [id]: { displayName: "Gemini AI", photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" },
                                    [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                                }
                            });
                        } else {
                            const userSnap = await getDoc(doc(db, "users", id));
                            if (userSnap.exists() && !isCancelled) {
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
                            }
                        }
                    } else {
                        setChat(null);
                    }
                    setLoading(false);
                }, (err) => {
                    if (!isCancelled) {
                        listenerManager.handleListenerError(err, 'ChatPage');
                        setLoading(false);
                    }
                });

                listenerManager.subscribe(listenerKey, unsubscribe);

            } catch (error) {
                if (!isCancelled) {
                    console.error("Critical error resolving chat:", error);
                    setLoading(false);
                }
            }
        };

        if (id) updateActiveChat(id);
        resolveChat();

        return () => {
            isCancelled = true;
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
