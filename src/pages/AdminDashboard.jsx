import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserRegistry from '../components/admin/UserRegistry';
import UserDossier from '../components/admin/UserDossier'; // Import UserDossier
import GodMap from '../components/admin/GodMap';
import SpyChatViewer from '../components/admin/SpyChatViewer';
import AdminOverview from '../components/admin/AdminOverview';
import ModerationQueue from '../components/admin/ModerationQueue';
import Announcements from '../components/admin/Announcements'; // Import New Component
import { db, auth, functions } from '../firebase';
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import { LogOut, LayoutDashboard, Users, Map, Eye, ShieldAlert, Megaphone, Menu, X, Search } from 'lucide-react';

// Sub-component for chat selection in Spy Mode
const ChatSelector = ({ onSelectChat, onSwitchToRegistry, activeChatId }) => {
    const [chats, setChats] = useState([]);
    const [participants, setParticipants] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const loadChats = async () => {
        setLoading(true);
        setError(null);
        try {
            const q = query(collection(db, 'chats'), orderBy('lastMessage.timestamp', 'desc'), limit(50));
            const snap = await getDocs(q);
            const chatList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setChats(chatList);

            // Fetch all unique participant IDs
            const uids = [...new Set(chatList.flatMap(c => c.participants || []))];
            const pMap = {};

            // Batched fetch for participants (limit to 30 for Firebase IN query)
            for (let i = 0; i < uids.length; i += 30) {
                const batch = uids.slice(i, i + 30);
                const uQuery = query(collection(db, 'users'), where('__name__', 'in', batch));
                const uSnap = await getDocs(uQuery);
                uSnap.docs.forEach(doc => {
                    pMap[doc.id] = doc.data();
                });
            }
            setParticipants(pMap);
        } catch (err) {
            console.error("Admin Fetch Error:", err);
            setError(err.code === 'permission-denied' ? 'PERMISSION_DENIED' : 'SYSTEM_FAILURE');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadChats(); }, []);

    return (
        <div className="h-full bg-white dark:bg-[#1f2937] border-r border-gray-200 dark:border-gray-700 flex flex-col shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111827]">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-gray-900 dark:text-white font-bold text-sm tracking-tight uppercase">Recent Chats</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter opacity-60">Live activity monitor</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                        type="text"
                        placeholder="Search users or chat ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-gray-800 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="p-4 space-y-3">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
                        ))}
                    </div>
                ) : error === 'PERMISSION_DENIED' ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                            ⚠️
                        </div>
                        <div>
                            <h4 className="text-gray-900 dark:text-white font-bold text-sm">Access Restricted</h4>
                            <p className="text-xs text-gray-500 mt-1">Permission claims required</p>
                        </div>
                        <button
                            onClick={onSwitchToRegistry}
                            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            Sync Permissions
                        </button>
                    </div>
                ) : (
                    chats.filter(chat => {
                        const pNames = chat.participants?.map(uid => participants[uid]?.displayName?.toLowerCase() || '').join(' ') || '';
                        return chat.id.toLowerCase().includes(searchTerm.toLowerCase()) || pNames.includes(searchTerm.toLowerCase());
                    }).map(chat => {
                        const targetUid = chat.participants?.find(uid => uid !== auth.currentUser?.uid) || chat.participants?.[0];
                        const targetUser = participants[targetUid] || {};
                        return (
                            <div
                                key={chat.id}
                                onClick={() => onSelectChat(chat.id)}
                                className={`p-4 border-b border-gray-100 dark:border-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 cursor-pointer transition-all ${activeChatId === chat.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-l-indigo-500' : ''}`}
                            >
                                <div className="flex gap-3">
                                    <div className="relative flex-shrink-0">
                                        <img
                                            src={targetUser.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${targetUid}`}
                                            className="w-10 h-10 rounded-full border border-gray-200 dark:border-gray-800 object-cover"
                                        />
                                        {targetUser.isOnline && (
                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-[#1f2937]" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                                {chat.type === 'group' ? chat.groupName : (targetUser.displayName || 'Anonymous')}
                                            </h4>
                                            <span className="text-[10px] text-gray-400 font-bold">
                                                {chat.lastMessage?.timestamp?.toDate ? format(chat.lastMessage.timestamp.toDate(), 'HH:mm') : 'Active'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate tracking-tight">
                                            {chat.lastMessage?.text || 'Empty conversation'}
                                        </p>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <span className="text-[9px] font-mono font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-tighter bg-indigo-50 dark:bg-indigo-900/30 px-1 rounded">
                                                ID: {chat.id.slice(0, 8)}
                                            </span>
                                            {chat.type === 'group' && (
                                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1 rounded uppercase tracking-tighter">Group</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div >
        </div >
    );
};


const AdminDashboard = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') || 'overview';
    const spyChatId = searchParams.get('chat');
    const [selectedUserDossier, setSelectedUserDossier] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const navigate = useNavigate();
    const { logout } = useAuth();

    const setActiveTab = (tab) => {
        setSearchParams({ tab });
        setIsSidebarOpen(false);
    };

    const setSpyChatId = (chatId) => {
        const params = { tab: 'spy' };
        if (chatId) params.chat = chatId;
        setSearchParams(params);
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch {
            alert('Failed to log out');
        }
    };

    const handleBan = async (uid, currentStatus) => {
        if (!window.confirm(`Are you sure you want to ${currentStatus ? 'Unban' : 'Ban'} this user?`)) return;
        try {
            const userRef = doc(db, 'users', uid);
            await updateDoc(userRef, { isBanned: !currentStatus });
            if (selectedUserDossier && selectedUserDossier.id === uid) {
                setSelectedUserDossier(prev => ({ ...prev, isBanned: !currentStatus }));
            }
            alert(`User ${currentStatus ? 'Unbanned' : 'Banned'} successfully.`);
        } catch (error) {
            console.error("Action failed:", error);
            alert("Error: " + error.message);
        }
    };

    const handleNuke = async (uid) => {
        const confirmWord = prompt("DANGER: This will permanently delete ALL user data. Type 'PURGE' to confirm for ID: " + uid);
        if (confirmWord !== 'PURGE') return;

        try {
            const nukeFn = httpsCallable(functions, 'nukeUser');
            await nukeFn({ targetUid: uid });
            alert("Success: User Nuked.");
            if (selectedUserDossier && selectedUserDossier.id === uid) {
                setSelectedUserDossier(null);
            }
        } catch (error) {
            console.error("Purge failed:", error);
            alert("Failed: " + error.message);
        }
    };

    const tabs = [
        { id: 'overview', label: 'Command Center', icon: LayoutDashboard },
        { id: 'registry', label: 'User Registry', icon: Users },
        { id: 'moderation', label: 'Moderation Queue', icon: ShieldAlert },
        { id: 'announcements', label: 'Megaphone', icon: Megaphone },
        { id: 'spy', label: 'Spy Mode', icon: Eye },
        { id: 'map', label: 'Marauder Map', icon: Map },
    ];

    return (
        <div className="flex h-screen w-full bg-[#f9fafb] dark:bg-[#0b0f1a] text-gray-900 dark:text-[#f3f4f6] font-sans overflow-hidden select-none">
            {/* Mobile Header */}
            <div className="lg:hidden absolute top-0 left-0 right-0 h-16 bg-white/80 dark:bg-[#1f2937]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-[50] flex items-center px-4 justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold italic">N</div>
                    <h1 className="font-bold text-lg bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">Admin</h1>
                </div>
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
                >
                    <Menu size={24} />
                </button>
            </div>

            {/* Sidebar Overlay (Mobile) */}
            {isSidebarOpen && (
                <div
                    onClick={() => setIsSidebarOpen(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 w-[280px] bg-white dark:bg-[#111827] border-r border-gray-200 dark:border-gray-800 z-[70] transform transition-transform duration-300 ease-out flex flex-col flex-shrink-0
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="h-20 flex items-center px-6 w-full border-b border-gray-100 dark:border-gray-800/50 justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black italic shadow-lg shadow-indigo-500/20">N</div>
                        <div>
                            <h1 className="font-extrabold text-xl tracking-tight text-gray-900 dark:text-white">NOVA</h1>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">System Online</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 w-full p-4 space-y-1.5 mt-4 overflow-y-auto custom-scrollbar">
                    <div className="px-3 mb-4 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
                        Management
                        <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
                    </div>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    w-full p-3.5 rounded-xl flex items-center transition-all duration-200 group active:scale-95
                                    ${isActive
                                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-500/20 z-10'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                                    }
                                `}
                            >
                                <Icon size={20} className={`flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`} />
                                <span className="ml-3.5 text-sm font-semibold tracking-wide">{tab.label}</span>
                                {isActive && (
                                    <div className="ml-auto w-1.5 h-6 rounded-full bg-white/40" />
                                )}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 w-full border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/30 dark:bg-gray-800/10">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center px-4 py-3.5 rounded-xl text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all font-bold text-sm shadow-sm group"
                    >
                        <LogOut size={18} className="mr-2.5 transition-transform group-hover:-translate-x-1" />
                        Terminate Session
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col relative overflow-hidden pt-16 lg:pt-0 w-full animate-in fade-in slide-in-from-right-2 duration-500">
                <div className="flex-1 relative z-0 h-full w-full overflow-hidden flex flex-col">
                    {/* Viewport Header (Desktop only tooltips/context) */}
                    <div className="hidden lg:flex h-16 px-8 items-center justify-between border-b border-gray-100 dark:border-gray-800/50 backdrop-blur-md bg-white/30 dark:bg-transparent">
                        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-3">
                            {tabs.find(t => t.id === activeTab)?.label}
                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
                            <span className="text-[10px] lowercase font-normal italic">admin.novachat.io</span>
                        </h2>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-bold ring-1 ring-indigo-200/50 dark:ring-transparent">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-ping" />
                                Live Feed
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        {/* Tab Content with simple exit/entry animation logic if needed */}
                        <div className="h-full w-full overflow-hidden">
                            {activeTab === 'overview' && <AdminOverview />}
                            {activeTab === 'registry' && (
                                <UserRegistry
                                    onOpenDossier={setSelectedUserDossier}
                                    onBan={handleBan}
                                    onNuke={handleNuke}
                                />
                            )}
                            {activeTab === 'moderation' && <ModerationQueue />}
                            {activeTab === 'announcements' && <Announcements />}

                            {activeTab === 'spy' && (
                                <div className="flex flex-col lg:flex-row h-full w-full">
                                    <div className={`${spyChatId ? 'hidden lg:flex' : 'flex'} w-full lg:w-[340px] h-full flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex-col`}>
                                        <ChatSelector
                                            onSelectChat={setSpyChatId}
                                            onSwitchToRegistry={() => setActiveTab('registry')}
                                            activeChatId={spyChatId}
                                        />
                                    </div>
                                    <div className={`${spyChatId ? 'flex' : 'hidden lg:flex'} flex-1 relative bg-gray-50 dark:bg-[#0b0f1a] h-full overflow-hidden flex-col`}>
                                        {spyChatId ? (
                                            <SpyChatViewer
                                                chatId={spyChatId}
                                                onClose={() => setSpyChatId(null)}
                                                onOpenDossier={setSelectedUserDossier}
                                            />
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-gray-400 flex-col space-y-6">
                                                <div className="relative">
                                                    <div className="absolute -inset-4 bg-indigo-500/10 blur-2xl rounded-full" />
                                                    <Eye size={64} className="opacity-20 relative text-indigo-500" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400 tracking-wide uppercase">Monitoring Inactive</p>
                                                    <p className="text-xs text-gray-400 mt-2">Select a neural feed to monitor real-time traffic</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'map' && <GodMap />}
                        </div>
                    </div>
                </div>
            </main>

            {/* Global Dossier Modal */}
            {selectedUserDossier && (
                <UserDossier
                    user={selectedUserDossier}
                    onClose={() => setSelectedUserDossier(null)}
                    onBan={handleBan}
                    onNuke={handleNuke}
                />
            )}
        </div>
    );
};

export default AdminDashboard;
