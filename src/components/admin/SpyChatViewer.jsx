import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';

const SpyChatViewer = ({ chatId, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [chatData, setChatData] = useState(null);
    const [participants, setParticipants] = useState({});
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!chatId) return;

        const fetchMetadata = async () => {
            try {
                const chatSnap = await getDoc(doc(db, 'chats', chatId));
                if (chatSnap.exists()) {
                    const data = chatSnap.data();
                    setChatData(data);

                    const pMap = {};
                    for (const uid of data.participants) {
                        const uSnap = await getDoc(doc(db, 'users', uid));
                        if (uSnap.exists()) pMap[uid] = uSnap.data();
                    }
                    setParticipants(pMap);
                }
            } catch (error) {
                console.error("Error fetching chat metadata:", error);
            }
        };
        fetchMetadata();

        // SPY MODE: Using onSnapshot to read messages BUT NOT UPDATING 'readBy' or anything else.
        // Pure read-only stream.
        const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (error) => {
            console.error("Error subscribing to SpyChat messages:", error);
        });

        return () => unsubscribe();
    }, [chatId]);

    return (
        <div className="flex flex-col h-full bg-[#0b141a] border-l border-white/10 relative">
            {/* Header */}
            <div className="p-4 bg-[#202c33] flex justify-between items-center border-b border-white/10 shadow-md z-10">
                <div>
                    <h3 className="text-white font-medium flex items-center gap-2">
                        🕵️ Spy Mode: <span className="text-whatsapp-teal font-mono">{chatId.slice(0, 8)}...</span>
                    </h3>
                    <p className="text-xs text-gray-400">
                        {Object.values(participants).map(p => p.displayName).join(' vs ')}
                    </p>
                </div>
                <button onClick={onClose} className="text-red-500 hover:bg-red-500/10 px-3 py-1 rounded transition">
                    Close Spy
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-fixed">
                {messages.map((msg) => {
                    const isMe = msg.senderId === chatData?.participants?.[0]; // Just picking one side to align right for visual layout
                    const sender = participants[msg.senderId];
                    const isDeleted = msg.isSoftDeleted; // Standardized field name

                    return (
                        <div key={msg.id} className={`flex flex-col mb-1 ${isMe ? 'items-end' : 'items-start'}`}>
                            <div className={`relative max-w-[85%] rounded-lg p-2 shadow-sm 
                        ${isMe ? 'bg-[#005c4b]' : 'bg-[#202c33]'} 
                        ${isDeleted ? 'border-2 border-red-500/70' : ''}
                    `}>
                                {/* Sender Name & Details */}
                                <div className={`text-[10px] mb-1 font-bold flex justify-between gap-4 ${isMe ? 'text-[#8696a0]' : 'text-orange-400'}`}>
                                    <span>{sender?.displayName || 'Unknown'}</span>
                                    {isDeleted && <span className="text-red-500 animate-pulse">DELETED</span>}
                                </div>

                                {/* Message Content */}
                                {msg.type === 'image' ? (
                                    <img src={msg.fileUrl} alt="Media" className="rounded-md max-h-64 object-cover" />
                                ) : (
                                    <div className="text-sm text-[#e9edef] whitespace-pre-wrap">{msg.text}</div>
                                )}

                                {/* Timestamp Footer */}
                                <div className="flex justify-end items-center gap-1 mt-1">
                                    <span className="text-[10px] text-[#8696a0]">
                                        {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                                    </span>
                                    {/* Force display Read status if available? Or hide because we are spying? */}
                                    {/* Let's show generic double tick to indicate sent */}
                                    <span className="text-blue-400 text-[10px]">✓✓</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Footer Warning */}
            <div className="p-3 bg-red-900/20 border-t border-red-500/20 text-center text-xs text-red-400 font-mono tracking-wider">
                ⚠️ DO NOT INTERVENE IN CASUALTIES ⚠️
            </div>
        </div>
    );
};

export default SpyChatViewer;
