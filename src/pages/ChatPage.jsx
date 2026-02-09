import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import ChatWindow from "../components/ChatWindow";

const ChatPage = () => {
    const { id } = useParams(); // Could be a chat ID OR a user ID for legacy links
    const { currentUser } = useAuth();
    const [chat, setChat] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (!id || !currentUser) return;

        const fetchChat = async () => {
            setLoading(true);
            try {
                // 1. Try fetching as a Chat ID directly
                let chatDoc = await getDoc(doc(db, "chats", id));

                if (!chatDoc.exists()) {
                    // 2. Try finding a private chat with this user ID
                    const q = query(
                        collection(db, "chats"),
                        where("participants", "array-contains", currentUser.uid),
                        where("type", "==", "private"),
                        limit(50)
                    );
                    const qSnap = await getDocs(q);
                    const existingChat = qSnap.docs.find(d => d.data().participants.includes(id));

                    if (existingChat) {
                        setChat({ id: existingChat.id, ...existingChat.data() });
                        setLoading(false);
                        return;
                    }

                    // 3. Fallback: If it's a User ID, we might need to "create" a temporary chat object 
                    // or redirect to contacts. For now, let's treat it as a ghost chat.
                    const userSnap = await getDoc(doc(db, "users", id));
                    if (userSnap.exists()) {
                        setChat({
                            id: [currentUser.uid, id].sort().join("_"),
                            type: "private",
                            participants: [currentUser.uid, id],
                            participantInfo: {
                                [id]: userSnap.data(),
                                [currentUser.uid]: { displayName: currentUser.displayName, photoURL: currentUser.photoURL }
                            },
                            isGhost: true // Frontend can handle creating it on first message
                        });
                    }
                } else {
                    setChat({ id: chatDoc.id, ...chatDoc.data() });
                }
            } catch (error) {
                console.error("Error fetching chat:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchChat();
    }, [id, currentUser]);

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
