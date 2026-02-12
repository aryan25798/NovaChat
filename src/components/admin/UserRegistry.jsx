import React, { useState, useEffect } from 'react';
import { db, functions } from '../../firebase';
import { collection, query, getDocs, doc, updateDoc, limit, startAfter, orderBy } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../contexts/AuthContext';
import SpyChatViewer from './SpyChatViewer';
import UserDossier from './UserDossier';
import { format } from 'date-fns';
import { Search, Filter, Shield, ShieldAlert, User, MoreHorizontal, RefreshCw, Eye, Trash2, MapPin, ExternalLink } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

const UserRegistry = ({ onOpenDossier, onBan, onNuke }) => {
    const { currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [selectedChat, setSelectedChat] = useState(null);
    const [nuking, setNuking] = useState(null);
    const [locations, setLocations] = useState({});

    // Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'banned'

    const DOCUMENTS_PER_PAGE = 50;

    const fetchUsers = async (isNextPage = false) => {
        setLoading(true);
        try {
            let q;
            // Note: Complex filtering with search usually requires Algolia/Typesense.
            // For this phase, we fetch latest 50 and filter client-side, 
            // or we could add simple Firestore 'where' clauses if needed.
            if (isNextPage && lastDoc) {
                q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(DOCUMENTS_PER_PAGE), startAfter(lastDoc));
            } else {
                q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(DOCUMENTS_PER_PAGE));
            }

            const snapshot = await getDocs(q);
            const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (snapshot.docs.length < DOCUMENTS_PER_PAGE) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

            setLastDoc(snapshot.docs[snapshot.docs.length - 1]);

            if (isNextPage) {
                setUsers(prev => {
                    const combined = [...prev, ...userList];
                    return Array.from(new Map(combined.map(item => [item.id, item])).values());
                });
            } else {
                setUsers(userList);
            }

            // --- FETCH LOCATIONS ---
            const locSnap = await getDocs(collection(db, 'user_locations'));
            const locMap = {};
            locSnap.docs.forEach(d => {
                locMap[d.id] = d.data();
            });
            setLocations(locMap);
            // -----------------------
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Filter Logic
    useEffect(() => {
        let result = users;

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(u =>
                (u.displayName && u.displayName.toLowerCase().includes(lowerTerm)) ||
                (u.email && u.email.toLowerCase().includes(lowerTerm)) ||
                u.id.toLowerCase().includes(lowerTerm)
            );
        }

        // Filter out Gemini AI and System accounts
        result = result.filter(u =>
            u.displayName !== "Gemini AI" &&
            u.email !== "gemini@ai.bot" // Assuming this is the email
        );

        if (filterStatus === 'banned') {
            result = result.filter(u => u.isBanned);
        } else if (filterStatus === 'active') {
            result = result.filter(u => !u.isBanned);
        }

        setFilteredUsers(result);
    }, [users, searchTerm, filterStatus]);



    if (selectedChat) {
        return <SpyChatViewer chatId={selectedChat} onClose={() => setSelectedChat(null)} />;
    }

    return (
        <div className="p-6 h-full overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-[#111827]">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        User Registry
                        <span className="text-xs font-normal text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            {users.length} Users Loaded
                        </span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Manage platform participants, permissions, and security.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchUsers(false)}
                        className="p-2 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 rounded-lg hover:text-indigo-600 transition-colors shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                        title="Refresh List"
                    >
                        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                const syncFn = httpsCallable(functions, 'syncAdminClaims');
                                const res = await syncFn();
                                if (currentUser && res.data.success) {
                                    await currentUser.getIdToken(true);
                                    alert("Identity Sync Complete.");
                                } else {
                                    alert(res.data.message);
                                }
                            } catch (e) { alert("Sync Failed: " + e.message); }
                        }}
                        className="px-4 py-2 bg-white dark:bg-[#1f2937] text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700 shadow-sm"
                    >
                        Sync Claims
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white dark:bg-[#1f2937] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">

                {/* Search */}
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search users by name, email, or ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                    />
                </div>

                {/* Filters */}
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    {['all', 'active', 'banned'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${filterStatus === status
                                ? 'bg-white dark:bg-[#1f2937] text-indigo-600 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col min-h-0 relative">
                <div className="overflow-x-auto custom-scrollbar flex-1 relative scroll-smooth">
                    {/* Horizontal Scroll Hint (Visible on mobile when scrollable) */}
                    <div className="lg:hidden absolute top-2 right-2 z-20 pointer-events-none">
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white text-[10px] font-bold animate-bounce">
                            <span>Swipe</span>
                            <MoreHorizontal size={12} />
                        </div>
                    </div>

                    <table className="w-full text-left border-collapse min-w-[1000px] relative">
                        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#111827] ring-1 ring-gray-100 dark:ring-gray-800">
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                <th className="p-5 w-12 text-center">
                                    <input type="checkbox" className="rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-transparent transition-all" />
                                </th>
                                <th className="p-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Platform Identity</th>
                                <th className="p-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Neural Uplink</th>
                                <th className="p-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Telemetry</th>
                                <th className="p-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em]">Clearance</th>
                                <th className="p-5 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] text-right">Direct Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                            {filteredUsers.map((user) => (
                                <tr
                                    key={user.id}
                                    onClick={() => onOpenDossier(user)}
                                    className="group hover:bg-gray-50/50 dark:hover:bg-indigo-900/10 transition-all cursor-pointer relative"
                                >
                                    <td className="p-5 text-center" onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" className="rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-transparent" />
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-4">
                                            <div className="relative flex-shrink-0">
                                                <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-20 blur-sm transition-opacity" />
                                                <Avatar
                                                    src={user.photoURL}
                                                    alt={user.displayName}
                                                    fallback={user.displayName?.[0]}
                                                    className="w-11 h-11 rounded-full border-2 border-white dark:border-gray-800 shadow-sm relative z-10"
                                                />
                                                {user.isOnline && (
                                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-[3px] border-white dark:border-[#1f2937] z-20" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-bold text-gray-800 dark:text-gray-100 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                    {user.displayName || 'Anonymous'}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded tracking-tighter">
                                                        UID: {user.id.slice(0, 8)}
                                                    </span>
                                                    {user.isAdmin && (
                                                        <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Admin</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="space-y-0.5">
                                            <div className="text-[13px] font-medium text-gray-600 dark:text-gray-300 truncate max-w-[180px]">{user.email || 'Encrypted Channel'}</div>
                                            <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500">{user.phoneNumber || 'Secondary Link'}</div>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex flex-col gap-1">
                                            <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 uppercase tracking-wide">
                                                <div className={`w-1.5 h-1.5 rounded-full ${user.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                {user.isOnline ? 'Active' : 'Offline'}
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-medium">
                                                {user.lastSeen?.toDate ? format(user.lastSeen.toDate(), 'dd MMM yyyy · HH:mm') : 'Connection Lost'}
                                            </div>
                                            {locations[user.id] && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${locations[user.id].lat},${locations[user.id].lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 mt-1 transition-colors"
                                                >
                                                    <MapPin size={10} />
                                                    Pin: {locations[user.id].lat.toFixed(4)}, {locations[user.id].lng.toFixed(4)}
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className={`
                                            inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
                                            ${user.isBanned
                                                ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30 shadow-sm'
                                                : 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                                            }
                                        `}>
                                            <span className="mr-1.5 text-xs">{user.isBanned ? '⚠️' : '🛡️'}</span>
                                            {user.isBanned ? 'Banned' : 'Verified'}
                                        </div>
                                    </td>
                                    <td className="p-5 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                                            <button
                                                onClick={() => onBan(user.id, user.isBanned)}
                                                className={`
                                                    w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-95
                                                    ${user.isBanned
                                                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30'
                                                        : 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/30'
                                                    }
                                                `}
                                                title={user.isBanned ? "Unban" : "Ban"}
                                            >
                                                {user.isBanned ? <Shield size={18} /> : <ShieldAlert size={18} />}
                                            </button>
                                            <button
                                                onClick={() => setSelectedChat(user.id)}
                                                className="w-9 h-9 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm"
                                                title="View Chats"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            {locations[user.id] && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${locations[user.id].lat},${locations[user.id].lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-9 h-9 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm"
                                                    title="View on Google Maps"
                                                >
                                                    <ExternalLink size={16} />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => {
                                                    const confirmed = window.confirm(
                                                        "CRITICAL ACTION REQUIRED!\n\n" +
                                                        "You are about to execute the NUKE sequence for this user.\n" +
                                                        "This will PERMANENTLY ERADICATE:\n" +
                                                        "- Auth Account\n" +
                                                        "- All Sent Messages (Group & Private)\n" +
                                                        "- All Media Assets (Images/Status)\n" +
                                                        "- Global Telemetry & Friend Links\n\n" +
                                                        "THIS ACTION CANNOT BE UNDONE.\n" +
                                                        "Continue with vaporization?"
                                                    );
                                                    if (confirmed) onNuke(user.id);
                                                }}
                                                className="w-9 h-9 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm"
                                                title="Nuke User"
                                            >
                                                {nuking === user.id ? (
                                                    <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <Trash2 size={18} />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {(loading || filteredUsers.length === 0) && (
                                <tr>
                                    <td colSpan="6" className="p-20 text-center">
                                        {loading ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">Syncing Neurons...</span>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 opacity-50">
                                                <div className="text-4xl">🔎</div>
                                                <div className="text-sm font-bold text-gray-500 mt-4 uppercase tracking-widest">No Matches Found</div>
                                                <p className="text-xs text-gray-400">Try adjusting your search filters</p>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {hasMore && !loading && !searchTerm && (
                        <div className="p-8 flex justify-center border-t border-gray-50 dark:border-gray-800/50 bg-gray-50/20 dark:bg-[#111827]/30">
                            <button
                                onClick={() => fetchUsers(true)}
                                className="px-6 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-[0.2em] hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-lg transition-all active:scale-95 shadow-sm"
                            >
                                Re-Link Data Points
                            </button>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default UserRegistry;
