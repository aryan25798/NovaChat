import React, { useState, useEffect } from 'react';
import { db, functions } from '../../firebase';
import { collection, query, getDocs, doc, updateDoc, limit, startAfter } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import SpyChatViewer from './SpyChatViewer';
import { format } from 'date-fns';

const UserRegistry = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [selectedChat, setSelectedChat] = useState(null); // For Spy Viewer
    const [nuking, setNuking] = useState(null);

    const DOCUMENTS_PER_PAGE = 50;

    const fetchUsers = async (isNextPage = false) => {
        setLoading(true);
        try {
            let q;
            if (isNextPage && lastDoc) {
                q = query(collection(db, 'users'), limit(DOCUMENTS_PER_PAGE), startAfter(lastDoc));
            } else {
                q = query(collection(db, 'users'), limit(DOCUMENTS_PER_PAGE));
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
                setUsers(prev => [...prev, ...userList]);
            } else {
                setUsers(userList);
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleBan = async (uid, currentStatus) => {
        if (!window.confirm(`Are you sure you want to ${currentStatus ? 'UNBAN' : 'BAN'} this user?`)) return;
        try {
            await updateDoc(doc(db, 'users', uid), { isBanned: !currentStatus });
            setUsers(users.map(u => u.id === uid ? { ...u, isBanned: !currentStatus } : u));
        } catch (error) {
            console.error("Ban failed:", error);
            alert("Ban failed: " + error.message);
        }
    };

    const handleNuke = async (uid) => {
        const confirmWord = prompt("TYPE 'NUKE' TO CONFIRM DELETION OF USER: " + uid);
        if (confirmWord !== 'NUKE') return;

        setNuking(uid);
        try {
            const nukeFn = httpsCallable(functions, 'nukeUser');
            const result = await nukeFn({ targetUid: uid });
            alert(result.data.message);
            setUsers(users.filter(u => u.uid !== uid));
        } catch (error) {
            console.error("Nuke failed:", error);
            alert("NUKE FAILED: " + error.message);
        } finally {
            setNuking(null);
        }
    };

    // Helper to find a chat for spying (finds most recent chat involving user)
    const handleSpy = async (uid) => {
        // This is a naive implementation; finding a chat efficiently requires better indexing or browsing chats
        // For 'God Mode', showing a list of their active chats first would be better.
        // For now, let's just alert that feature needs a defined chat ID, or we browse 'Chats' collection.
        alert("Spy functionality requires selecting a specific chat. Please go to 'Spy Chat' tab to browse active conversations.");
    };

    if (selectedChat) {
        return <SpyChatViewer chatId={selectedChat} onClose={() => setSelectedChat(null)} />;
    }

    return (
        <div className="p-6 bg-[#111b21] h-full overflow-y-auto text-[#e9edef]">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">User Registry ({users.length}+)</h2>
                <button onClick={() => fetchUsers(false)} className="bg-[#00a884] px-4 py-2 rounded text-[#111b21] font-bold hover:bg-[#00a884]/90">
                    Refresh
                </button>
            </div>

            <div className="overflow-x-auto bg-[#202c33] rounded-lg border border-white/10">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-700 text-gray-400 uppercase text-xs">
                            <th className="p-4">User</th>
                            <th className="p-4">Email / Phone</th>
                            <th className="p-4">Last Active</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">God Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b border-gray-700/50 hover:bg-[#2a3942] transition">
                                <td className="p-4 flex items-center gap-3">
                                    <img src={user.photoURL || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full bg-gray-600" />
                                    <div>
                                        <div className="font-bold text-white">{user.displayName}</div>
                                        <div className="text-xs text-mono text-gray-500">{user.id}</div>
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-gray-300">
                                    {user.email || user.phoneNumber || 'N/A'}
                                </td>
                                <td className="p-4 text-sm text-gray-400">
                                    {user.lastSeen?.toDate ? format(user.lastSeen.toDate(), 'MMM dd, HH:mm') : 'Never'}
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${user.isBanned ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                                        {user.isBanned ? 'BANNED' : 'ACTIVE'}
                                    </span>
                                    {user.isOnline && <span className="ml-2 px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded animate-pulse">ONLINE</span>}
                                </td>
                                <td className="p-4 text-right space-x-2">
                                    <button
                                        onClick={() => handleBan(user.id, user.isBanned)}
                                        className="text-yellow-500 hover:text-yellow-400 font-bold text-sm px-2"
                                    >
                                        {user.isBanned ? 'UNBAN' : 'BAN'}
                                    </button>
                                    <button
                                        onClick={() => handleNuke(user.id)}
                                        disabled={nuking === user.id}
                                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow-lg uppercase tracking-wider font-bold"
                                    >
                                        {nuking === user.id ? 'NUKING...' : 'NUKE'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {loading && (
                            <tr><td colSpan="5" className="p-8 text-center">Scanning humanity...</td></tr>
                        )}
                    </tbody>
                </table>
                {hasMore && !loading && (
                    <div className="p-4 flex justify-center">
                        <button
                            onClick={() => fetchUsers(true)}
                            className="bg-[#2a3942] hover:bg-[#374248] text-whatsapp-teal px-6 py-2 rounded-full font-bold transition"
                        >
                            Load More Souls
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserRegistry;
