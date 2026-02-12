import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
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
            // NEW: Speculative Speculation (Zero-Wait)
            const { GEMINI_BOT_ID } = await import("../constants");
            const isBot = id === GEMINI_BOT_ID || id.startsWith('gemini_');
            const speculatedId = isBot ? id : (id.includes('_') ? id : [currentUser.uid, id].sort().join("_"));

            // 1. If we have state, use it immediately
            if (location.state?.chatData) {
                setChat(location.state.chatData);
                setLoading(false);
            }
            // 2. OR Speculate if it's a direct URL hit (UID or encoded ID)
            else if (id.length === 28 || id.includes('_')) {
                setChat({
                    id: speculatedId,
                    isGhost: true, // Treat as ghost until we confirm existence
                    participants: isBot ? [currentUser.uid, id] : (id.includes('_') ? null : [currentUser.uid, id]),
                    type: isBot ? "gemini" : (id.includes('_') ? "group" : "private")
                });
                setLoading(false);
            } else {
                setLoading(true);
            }

            try {
                // Background metadata resolution
                const ghostId = isBot ? id : [currentUser.uid, id].sort().join("_");
                const ghostChatRef = doc(db, "chats", ghostId);
                const directRef = doc(db, "chats", id);
                let targetRef = null;
                let initialData = null;

                const results = await Promise.allSettled([
                    getDoc(directRef),
                    !isBot ? getDoc(doc(db, "users", id)) : Promise.resolve(null),
                    getDoc(ghostChatRef)
                ]);

                if (isCancelled) return;
                const [directSnap, userSnap, ghostSnap] = results.map(r => r.status === 'fulfilled' ? r.value : null);

                if (directSnap?.exists()) {
                    targetRef = directRef;
                } else if (ghostSnap?.exists()) {
                    targetRef = ghostChatRef;
                } else if (isBot) {
                    initialData = {
                        id: id, type: "gemini", participants: [currentUser.uid, id], isGhost: true,
                        participantInfo: {
                            [id]: { displayName: "Gemini AI", photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" },
                            [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                        }
                    };
                } else if (userSnap?.exists()) {
                    initialData = {
                        id: ghostId, type: "private", participants: [currentUser.uid, id], isGhost: true,
                        participantInfo: {
                            [id]: userSnap.data(),
                            [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                        }
                    };
                }

                if (!targetRef && !initialData) {
                    // Final fallback Search
                    const qSnaps = await getDocs(query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid), limit(20)));
                    const match = qSnaps.docs.find(d => (d.data().participants || []).includes(id));
                    if (match && !isCancelled) targetRef = match.ref;
                }

                if (initialData && !isCancelled) {
                    setChat(initialData);
                }

                if (targetRef && !isCancelled) {
                    const listenerKey = `chat-${targetRef.id}`;
                    unsubscribe = onSnapshot(targetRef, async (docSnap) => {
                        if (isCancelled || !docSnap.exists()) return;
                        const data = docSnap.data();
                        setChat({ id: docSnap.id, ...data, isGhost: false });
                    }, (err) => {
                        if (!isCancelled) listenerManager.handleListenerError(err, 'ChatPage');
                    });
                    listenerManager.subscribe(listenerKey, unsubscribe);
                }
            } catch (error) {
                console.error("Chat Resolution Error:", error);
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
