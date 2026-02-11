import React, { useState, useEffect } from 'react';
import { db, functions } from '../../firebase';
import { collection, collectionGroup, query, where, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ShieldAlert, Trash2, CheckCircle, UserX, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const ModerationQueue = () => {
    const [flaggedMessages, setFlaggedMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actioning, setActioning] = useState(null);

    useEffect(() => {
        // Listen for messages where isFlagged is true
        // Using collectionGroup to query across all chat subcollections
        const q = query(
            collectionGroup(db, 'messages'),
            where('isFlagged', '==', true),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setFlaggedMessages(messages);
            setLoading(false);
        }, (error) => {
            console.error("Moderation Queue Listener Error:", error);
            setFlaggedMessages([]); // Set empty array on error instead of leaving loading state
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleClearFlag = async (messageId) => {
        setActioning(messageId);
        try {
            await updateDoc(doc(db, 'messages', messageId), {
                isFlagged: false,
                moderatedAt: new Date(),
                moderatedBy: 'admin'
            });
        } catch (error) {
            alert("Failed to clear flag: " + error.message);
        } finally {
            setActioning(null);
        }
    };

    const handleNukeMessage = async (messageId) => {
        if (!window.confirm("Delete this message permanently?")) return;
        setActioning(messageId);
        try {
            await deleteDoc(doc(db, 'messages', messageId));
        } catch (error) {
            alert("Failed to delete: " + error.message);
        } finally {
            setActioning(null);
        }
    };

    const handleBanUser = async (uid) => {
        if (!window.confirm("Ban this user from the platform?")) return;
        try {
            const banFn = httpsCallable(functions, 'banUser');
            await banFn({ targetUid: uid });
            alert("User has been banned.");
        } catch (error) {
            alert("Ban failed: " + error.message);
        }
    };

    if (loading) {
        return (
            <div className="p-8 space-y-4">
                <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 h-full overflow-y-auto custom-scrollbar bg-[#f9fafb] dark:bg-[#0b0f1a] space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">The Shield</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">Content moderation queue and automated threat detection.</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-xs font-bold ring-1 ring-red-200/50 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    {flaggedMessages.length} Incidents Pending
                </div>
            </div>

            {flaggedMessages.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                        <div className="absolute -inset-4 bg-emerald-500/10 blur-3xl rounded-full" />
                        <CheckCircle size={80} className="text-emerald-500 opacity-20 relative" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-wider">Perimeter Secure</h3>
                        <p className="text-sm text-gray-400 mt-2">No flagged content detected in the current stream.</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {flaggedMessages.map((msg) => (
                        <div key={msg.id} className="bg-white dark:bg-[#1f2937] p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                            {/* Danger Glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />

                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xl font-black shadow-inner">
                                        {msg.senderName?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                                            {msg.senderName || 'Anonymous'}
                                            <span className="text-[10px] text-gray-400 font-mono uppercase bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded">
                                                ID: {msg.senderId?.slice(0, 8)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-1 flex items-center gap-1">
                                            <AlertTriangle size={10} />
                                            Risk Score: {msg.flagScore || 'High'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                    <Clock size={12} />
                                    {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'HH:mm:ss') : 'Just Now'}
                                </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl mb-6 border border-gray-100 dark:border-gray-800 relative group-hover:border-red-500/20 transition-colors">
                                <p className="text-sm text-gray-700 dark:text-gray-300 italic leading-relaxed">"{msg.text}"</p>
                                {msg.translation && (
                                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 text-[11px] text-gray-400">
                                        <span className="font-bold text-indigo-500 uppercase mr-2 tracking-tighter text-[9px]">Uplink Sync:</span>
                                        {msg.translation}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    disabled={actioning === msg.id}
                                    onClick={() => handleClearFlag(msg.id)}
                                    className="px-4 py-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all flex items-center gap-2"
                                >
                                    <CheckCircle size={14} />
                                    Clear Flag
                                </button>
                                <button
                                    disabled={actioning === msg.id}
                                    onClick={() => handleNukeMessage(msg.id)}
                                    className="px-4 py-2 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/40 transition-all flex items-center gap-2"
                                >
                                    <Trash2 size={14} />
                                    Purge
                                </button>
                                <button
                                    onClick={() => handleBanUser(msg.senderId)}
                                    className="px-4 py-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 ml-auto"
                                >
                                    <UserX size={14} />
                                    Ban User
                                </button>
                            </div>

                            {actioning === msg.id && (
                                <div className="absolute inset-0 bg-white/60 dark:bg-gray-900/60 backdrop-blur-[2px] z-20 flex items-center justify-center">
                                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModerationQueue;
