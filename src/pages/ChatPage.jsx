import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs, limit, onSnapshot, updateDoc } from "firebase/firestore";
import ChatWindow from "../components/ChatWindow";
import { listenerManager } from "../utils/ListenerManager";
import { usePresence } from "../contexts/PresenceContext";
import { GEMINI_BOT_ID } from "../constants";


const ChatPage = () => {
    const { id } = useParams(); // Could be a chat ID OR a user ID for legacy links
    const { currentUser } = useAuth();
    const location = useLocation();
    const { updateActiveChat } = usePresence();
    const [chat, setChat] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!id || !currentUser) return;

        let isCancelled = false;
        let unsubscribe = () => { };

        const resolveChat = async () => {
            const isBot = id === GEMINI_BOT_ID || id.startsWith('gemini_');


            // CANONICAL ID ENFORCEMENT
            let speculatedId = id;
            if (!isBot) {
                if (id.includes('_')) {
                    // If it looks like a composite ID, split and sort to ensure A_B (canonical)
                    const parts = id.split('_');
                    if (parts.length === 2) {
                        speculatedId = parts.sort().join('_');
                    }
                } else {
                    // If it's a single UID, combine with current user and sort
                    speculatedId = [currentUser.uid, id].sort().join("_");
                }
            }

            if (speculatedId) updateActiveChat(speculatedId);

            // 1. If we have state, use it immediately
            if (location.state?.chatData) {
                const data = location.state.chatData;
                setChat(data);
                setLoading(false);
                if (!data.isGhost) {
                    // Start listener immediately for real-time updates without resolution
                    subscribeToChat(doc(db, "chats", data.id));
                    return;
                }
            }
            // 2. OR Speculate if it's a direct URL hit
            else if (id.length === 28 || id.includes('_')) {
                setChat({
                    id: speculatedId, // use strict canonical ID
                    isGhost: true,
                    participants: isBot ? [currentUser.uid, id] : (speculatedId.includes('_') ? speculatedId.split('_') : [currentUser.uid, speculatedId]),
                    type: isBot ? "gemini" : "private"
                });
                setLoading(false);
            } else {
                setLoading(true);
            }

            // Define listener logic as a reusable function
            function subscribeToChat(targetRef) {
                const listenerKey = `chat-${targetRef.id}`;
                unsubscribe = onSnapshot(targetRef, async (docSnap) => {
                    if (isCancelled || !docSnap.exists()) return;
                    const data = docSnap.data();

                    setChat(prev => {
                        // Deep Check: Only update if structural data changed
                        if (prev && prev.id === docSnap.id &&
                            prev.type === data.type &&
                            JSON.stringify(prev.participants) === JSON.stringify(data.participants) &&
                            prev.groupName === data.groupName &&
                            prev.groupImage === data.groupImage) {
                            return prev;
                        }
                        return { id: docSnap.id, ...data, isGhost: false };
                    });
                }, (err) => {
                    if (!isCancelled) listenerManager.handleListenerError(err, 'ChatPage');
                });
                listenerManager.subscribe(listenerKey, unsubscribe);
            }

            try {
                // Background metadata resolution
                const ghostId = speculatedId;
                const ghostChatRef = doc(db, "chats", ghostId);
                const directRef = doc(db, "chats", id); // Still check the RAW id just in case it's a group
                let targetRef = null;
                let initialData = null;

                const results = await Promise.allSettled([
                    getDoc(directRef),
                    !isBot && !id.includes('_') ? getDoc(doc(db, "users", id)) : Promise.resolve(null),
                    getDoc(ghostChatRef)
                ]);

                if (isCancelled) return;
                const [directSnap, userSnap, ghostSnap] = results.map(r => r.status === 'fulfilled' ? r.value : null);

                if (directSnap?.exists()) {
                    targetRef = directRef;
                    // If directRef exists and it WAS a private chat but unsorted in URL, we might want to redirect? 
                    // But for now, if the raw ID points to a real doc (e.g. valid group ID with underscore), use it.
                } else if (ghostSnap?.exists()) {
                    targetRef = ghostChatRef;
                } else if (isBot) {
                    // ... same gemini logic ...
                    initialData = {
                        id: id, type: "gemini", participants: [currentUser.uid, id], isGhost: true,
                        participantInfo: {
                            [id]: { displayName: "Gemini AI", photoURL: "https://uxwing.com/wp-content/themes/uxwing/download/brands-and-social-media/google-gemini-icon.png" },
                            [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                        }
                    };
                } else if (id.includes('_') || speculatedId.includes('_')) {
                    // Parse participants from the CANONICAL ID
                    const parts = speculatedId.split('_');
                    const otherUid = parts.find(uid => uid !== currentUser.uid);

                    // Try to fetch the other user's data to populate the UI
                    let otherUserData = null;
                    if (otherUid) {
                        try {
                            const snap = await getDoc(doc(db, "users", otherUid));
                            if (snap.exists()) otherUserData = snap.data();
                        } catch (e) {
                            console.warn("Failed to fetch other user data", e);
                        }
                    }

                    initialData = {
                        id: speculatedId, // use the sorted ID
                        type: "private",
                        participants: parts, // Use parsed parts
                        isGhost: true,
                        participantInfo: {
                            [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL },
                            ...(otherUid && otherUserData ? { [otherUid]: otherUserData } :
                                (otherUid ? { [otherUid]: { displayName: "User", photoURL: null } } : {}))
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
                    subscribeToChat(targetRef);
                }
            } catch (error) {
                console.error("Chat Resolution Error:", error);
            }
        };

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
