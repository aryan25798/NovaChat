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
import { Avatar } from '../components/ui/Avatar';

// Sub-component for chat selection in Spy Mode (Refactored for User-Centric Intelligence)
const ChatSelector = ({ onSelectChat, onSwitchToRegistry, activeChatId }) => {
    const [groupedUsers, setGroupedUsers] = useState([]);
    const [participants, setParticipants] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [chatLimit, setChatLimit] = useState(50);
    const [hasMoreChats, setHasMoreChats] = useState(true);
    const [expandedUser, setExpandedUser] = useState(null);

    const loadIntel = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Fetch recent active chats
            const q = query(collection(db, 'chats'), orderBy('lastMessage.timestamp', 'desc'), limit(chatLimit));
            const snap = await getDocs(q);
            const chatList = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // 2. Identify all unique participants (excluding current admin)
            const uids = [...new Set(chatList.flatMap(c => c.participants || []))];
            const pMap = {};

            // 3. Batched Profile Fetch
            for (let i = 0; i < uids.length; i += 30) {
                const batch = uids.slice(i, i + 30);
                const uQuery = query(collection(db, 'users'), where('__name__', 'in', batch));
                const uSnap = await getDocs(uQuery);
                uSnap.docs.forEach(doc => {
                    pMap[doc.id] = doc.data();
                });
            }
            setParticipants(pMap);

            // 4. Intelligence Grouping: Group chats under Users
            const userGroups = {};
            chatList.forEach(chat => {
                // Find participants in this chat (excluding the admin and filtering invalid UIDs)
                const realParticipants = chat.participants?.filter(uid => uid && uid !== auth.currentUser?.uid) || [];

                realParticipants.forEach(uid => {
                    if (!userGroups[uid]) {
                        userGroups[uid] = {
                            profile: pMap[uid] || { uid, displayName: 'Anonymous' },
                            chats: [],
                            latestActivity: chat.lastMessage?.timestamp
                        };
                    }
                    userGroups[uid].chats.push(chat);
                    // Keep track of the absolute latest activity for this user
                    if (chat.lastMessage?.timestamp > (userGroups[uid].latestActivity || 0)) {
                        userGroups[uid].latestActivity = chat.lastMessage.timestamp;
                    }
                });
            });

            // Convert to sorted array
            const sortedUsers = Object.values(userGroups).sort((a, b) =>
                (b.latestActivity?.toMillis?.() || 0) - (a.latestActivity?.toMillis?.() || 0)
            );

            setGroupedUsers(sortedUsers);
            setHasMoreChats(snap.docs.length >= chatLimit);
        } catch (err) {
            console.error("Spy Intel Load Error:", err);
            setError(err.code === 'permission-denied' ? 'PERMISSION_DENIED' : 'SYSTEM_FAILURE');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadIntel(); }, [chatLimit]);

    const loadMoreIntel = () => setChatLimit(prev => prev + 50);

    const filteredUsers = groupedUsers.filter(group => {
        const nameMatch = group.profile.displayName?.toLowerCase().includes(searchTerm.toLowerCase());
        const emailMatch = group.profile.email?.toLowerCase().includes(searchTerm.toLowerCase());
        const chatMatch = group.chats.some(c => c.id.toLowerCase().includes(searchTerm.toLowerCase()));
        return nameMatch || emailMatch || chatMatch;
    });

    return (
        <div className="h-full bg-white dark:bg-[#1f2937] border-r border-gray-200 dark:border-gray-700 flex flex-col shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111827]">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-gray-900 dark:text-white font-bold text-sm tracking-tight uppercase">Intelligence Feed</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter opacity-60">Grouped by active users</p>
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
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-gray-800 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading ? (
                    <div className="p-4 space-y-4">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="space-y-2">
                                <div className="h-14 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" />
                                <div className="h-4 w-2/3 ml-4 bg-gray-50 dark:bg-gray-800/50 animate-pulse rounded" />
                            </div>
                        ))}
                    </div>
                ) : error === 'PERMISSION_DENIED' ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">⚠️</div>
                        <div>
                            <h4 className="text-gray-900 dark:text-white font-bold text-sm text-red-500">Access Restricted</h4>
                            <p className="text-xs text-gray-500 mt-1">High-level clearance required</p>
                        </div>
                        <button key="sync-btn" onClick={onSwitchToRegistry} className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">Sync Permissions</button>
                    </div>
                ) : (
                    <div key="intel-list-container">
                        {filteredUsers.map((group, index) => (
                            <div key={`user-group-${group.profile.uid || index}`} className="border-b border-gray-100 dark:border-gray-800">
                                {/* User Accordion Trigger */}
                                <div
                                    onClick={() => setExpandedUser(expandedUser === group.profile.uid ? null : group.profile.uid)}
                                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-all flex items-center gap-3 ${expandedUser === group.profile.uid ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                                >
                                    <div className="relative">
                                        <Avatar
                                            src={group.profile.photoURL}
                                            alt={group.profile.displayName}
                                            fallback={group.profile.displayName?.[0]}
                                            className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700"
                                        />
                                        {group.profile.isOnline && (
                                            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-[#1f2937]" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                            {group.profile.displayName || 'Anonymous'}
                                        </h4>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-tighter">
                                            {group.chats.length} Active Stream(s)
                                        </p>
                                    </div>
                                    <div className={`transition-transform duration-300 ${expandedUser === group.profile.uid ? 'rotate-180' : ''}`}>
                                        <Menu size={14} className="text-gray-400" />
                                    </div>
                                </div>

                                {/* Expanded Chats */}
                                {expandedUser === group.profile.uid && (
                                    <div className="bg-gray-50/50 dark:bg-gray-900/20 py-1 slide-down overflow-hidden">
                                        {group.chats.map(chat => {
                                            const otherParticipants = chat.participants?.filter(uid => uid !== group.profile.uid && uid !== auth.currentUser?.uid) || [];
                                            const otherUser = participants[otherParticipants[0]] || { displayName: 'Multiple' };

                                            return (
                                                <div
                                                    key={chat.id}
                                                    onClick={() => onSelectChat(chat.id)}
                                                    className={`pl-14 pr-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer border-l-4 transition-all ${activeChatId === chat.id ? 'border-l-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-l-transparent'}`}
                                                >
                                                    <div className="flex justify-between items-start mb-0.5">
                                                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">
                                                            {chat.type === 'group' ? `Group: ${chat.groupName}` : `With: ${otherUser.displayName || 'Anonymous'}`}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-gray-400">
                                                            {chat.lastMessage?.timestamp?.toDate ? format(chat.lastMessage.timestamp.toDate(), 'HH:mm') : 'Active'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 truncate opacity-80">
                                                        {chat.lastMessage?.text || 'Empty secure line'}
                                                    </p>
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <span className="text-[8px] font-mono font-black text-indigo-500 uppercase tracking-tighter bg-indigo-50 dark:bg-indigo-900/40 px-1 rounded">
                                                            ID: {chat.id.slice(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {hasMoreChats && !loading && (
                    <div key="load-more-intel" className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/10">
                        <button
                            onClick={loadMoreIntel}
                            className="w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase rounded-lg hover:bg-indigo-100 transition-all border border-indigo-100 dark:border-indigo-900/50"
                        >
                            Load More Intel
                        </button>
                    </div>
                )}
            </div>
        </div>
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
