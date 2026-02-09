import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserRegistry from '../components/admin/UserRegistry';
import GodMap from '../components/admin/GodMap';
import SpyChatViewer from '../components/admin/SpyChatViewer';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

// Sub-component for chat selection in Spy Mode
const ChatSelector = ({ onSelectChat }) => {
    const [chats, setChats] = useState([]);

    // Naive fetch of recent chats (admin sees all)
    // In production, this needs pagination and better filtering
    const loadChats = async () => {
        const q = query(collection(db, 'chats'), orderBy('lastMessage.timestamp', 'desc'), limit(50));
        const snap = await getDocs(q);
        setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    React.useEffect(() => { loadChats(); }, []);

    return (
        <div className="h-full bg-[#111b21] border-r border-white/10 overflow-y-auto">
            <h3 className="p-4 text-white font-bold border-b border-gray-700">Active Interceptions</h3>
            {chats.map(chat => (
                <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat.id)}
                    className="p-3 border-b border-gray-800 hover:bg-[#202c33] cursor-pointer text-gray-300"
                >
                    <div className="text-xs font-mono text-gray-500 mb-1">{chat.id}</div>
                    <div className="font-bold truncate text-white">
                        {/* Just showing last message as preview */}
                        {chat.lastMessage?.text || 'Image/Media'}
                    </div>
                </div>
            ))}
        </div>
    );
};


const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('registry'); // registry, spy, map
    const [spyChatId, setSpyChatId] = useState(null);
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-screen bg-[#0b141a] text-[#e9edef] font-sans">
            {/* Sidebar */}
            <div className="w-20 lg:w-64 flex flex-col items-center lg:items-start bg-[#202c33] text-[#aebac1] border-r border-[#2f3b43]">
                <div className="h-16 flex items-center justify-center w-full border-b border-[#2f3b43]">
                    <span className="text-2xl lg:text-3xl">👁️</span>
                    <span className="hidden lg:block ml-3 font-bold text-white tracking-widest">GOD MODE</span>
                </div>

                <nav className="flex-1 w-full space-y-2 p-2">
                    <button
                        onClick={() => setActiveTab('registry')}
                        className={`w-full p-3 rounded-lg flex items-center ${activeTab === 'registry' ? 'bg-[#00a884] text-white' : 'hover:bg-[#111b21]'}`}
                    >
                        <span>👥</span>
                        <span className="hidden lg:block ml-3 font-medium">Registry</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('spy')}
                        className={`w-full p-3 rounded-lg flex items-center ${activeTab === 'spy' ? 'bg-[#00a884] text-white' : 'hover:bg-[#111b21]'}`}
                    >
                        <span>🕵️</span>
                        <span className="hidden lg:block ml-3 font-medium">Spy Chat</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('map')}
                        className={`w-full p-3 rounded-lg flex items-center ${activeTab === 'map' ? 'bg-[#00a884] text-white' : 'hover:bg-[#111b21]'}`}
                    >
                        <span>🌍</span>
                        <span className="hidden lg:block ml-3 font-medium">God Map</span>
                    </button>
                </nav>

                <div className="p-4 w-full border-t border-[#2f3b43]">
                    <button
                        onClick={() => navigate('/')}
                        className="w-full text-left text-sm text-red-400 hover:text-red-300 flex items-center"
                    >
                        <span>↩️</span>
                        <span className="hidden lg:block ml-3">Exit to Mortal Realm</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {activeTab === 'registry' && <UserRegistry />}

                {activeTab === 'spy' && (
                    <div className="flex h-full">
                        <div className="w-1/3 min-w-[300px]">
                            <ChatSelector onSelectChat={setSpyChatId} />
                        </div>
                        <div className="flex-1 relative">
                            {spyChatId ? (
                                <SpyChatViewer chatId={spyChatId} onClose={() => setSpyChatId(null)} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500 flex-col">
                                    <span className="text-4xl mb-4">🦇</span>
                                    <p>Select a channel to intercept</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'map' && <GodMap />}
            </div>
        </div>
    );
};

export default AdminDashboard;
