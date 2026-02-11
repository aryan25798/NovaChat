import React, { useState, useEffect } from 'react';
import { db, functions } from '../../firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import { Megaphone, Send, Clock, AlertTriangle, Info, Bell, Trash2, Archive, Activity, Zap, Shield } from 'lucide-react';

const Announcements = () => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [toggling, setToggling] = useState(null);

    // Form State
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [type, setType] = useState('info'); // info, warning, alert
    const [priority, setPriority] = useState('normal');

    useEffect(() => {
        const q = query(collection(db, 'announcements'), orderBy('timestamp', 'desc'), limit(20));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!title || !body) return;

        setSending(true);
        try {
            const sendFn = httpsCallable(functions, 'sendGlobalAnnouncement');
            await sendFn({ title, body, type, priority });

            // Reset Form
            setTitle('');
            setBody('');
            setType('info');
            setPriority('normal');
        } catch (error) {
            console.error("Broadcast Error:", error);
            alert("Failed to send: " + error.message);
        } finally {
            setSending(false);
        }
    };

    const handleToggleStatus = async (id, currentActive) => {
        setToggling(id);
        try {
            const toggleFn = httpsCallable(functions, 'toggleAnnouncementStatus');
            await toggleFn({ id, active: !currentActive });
        } catch (error) {
            console.error("Toggle Error:", error);
            alert("Failed to update status: " + error.message);
        } finally {
            setToggling(null);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("ARE YOU SURE? This will permanently erase this broadcast from logs.")) return;
        setToggling(id);
        try {
            const toggleFn = httpsCallable(functions, 'toggleAnnouncementStatus');
            await toggleFn({ id, deleteFlag: true });
        } catch (error) {
            console.error("Delete Error:", error);
            alert("Failed to delete: " + error.message);
        } finally {
            setToggling(null);
        }
    };

    const getTypeStyles = (type) => {
        switch (type) {
            case 'warning': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'alert': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
            default: return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
        }
    }

    const getTypeIcon = (type) => {
        switch (type) {
            case 'warning': return <AlertTriangle size={14} />;
            case 'alert': return <Zap size={14} />;
            default: return <Activity size={14} />;
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-[#fcfcfd] dark:bg-[#0b0f1a]">
            {/* Neural Header */}
            <div className="mb-12 flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20">
                            <Megaphone className="text-white" size={24} />
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight uppercase">
                            Megaphone <span className="text-indigo-600 italic">Net</span>
                        </h2>
                    </div>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest pl-14">System-Wide Neuro-Broadcast Control</p>
                </div>
                <div className="flex items-center gap-4 px-4 py-2 bg-white dark:bg-[#1f2937] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter italic font-mono">Status: Broadcast Node Alpha (Active)</span>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                {/* Composition Terminal */}
                <div className="xl:col-span-4 self-start sticky top-0">
                    <form onSubmit={handleSend} className="bg-white dark:bg-[#1f2937] p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-indigo-500/5 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap size={80} className="text-indigo-600" />
                        </div>

                        <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                            <Shield size={16} className="text-indigo-500" />
                            Neuro-Blast Config
                        </h3>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Broadcast Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="CRITICAL_UPDATE_V1.2"
                                    className="w-full px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Transmission Content</label>
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="All neural links initialized. System status nominal..."
                                    className="w-full px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl text-sm font-bold text-gray-900 dark:text-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none min-h-[160px] transition-all placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-none"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Signal Type</label>
                                    <select
                                        value={type}
                                        onChange={(e) => setType(e.target.value)}
                                        className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none cursor-pointer focus:border-indigo-500 transition-colors"
                                    >
                                        <option value="info">DATA_INFO</option>
                                        <option value="warning">CAUTION_WARN</option>
                                        <option value="alert">SYS_ALERT</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Priority</label>
                                    <select
                                        value={priority}
                                        onChange={(e) => setPriority(e.target.value)}
                                        className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs font-bold text-gray-900 dark:text-white outline-none cursor-pointer focus:border-indigo-500 transition-colors"
                                    >
                                        <option value="normal">BALANCED</option>
                                        <option value="high">URGENT (INTENSE)</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                className={`w-full py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 relative overflow-hidden active:scale-95 ${sending ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-500/40 hover:-translate-y-1'}`}
                            >
                                {sending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        SYNCING SIGNAL...
                                    </>
                                ) : (
                                    <>
                                        ENGAGE MEGAPHONE
                                        <Zap size={18} className="fill-current" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Broadcast Feed */}
                <div className="xl:col-span-8 space-y-6">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.3em] flex items-center gap-3">
                            <Clock size={16} className="text-indigo-500" />
                            Transmission Logs
                        </h3>
                        {announcements.length > 0 && (
                            <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1 rounded-full uppercase italic">
                                Total Feed: {announcements.length} Nodes
                            </span>
                        )}
                    </div>

                    {announcements.length === 0 ? (
                        <div className="bg-white dark:bg-[#1f2937] p-24 text-center rounded-[2.5rem] border border-dashed border-gray-200 dark:border-gray-800">
                            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Megaphone className="text-gray-300" size={32} />
                            </div>
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Static detected. No active signals.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {announcements.map((ann) => (
                                <div key={ann.id} className={`group bg-white dark:bg-[#1f2937] border-2 rounded-[2rem] p-6 shadow-xl shadow-black/[0.02] transition-all hover:shadow-indigo-500/10 flex flex-col h-full relative overflow-hidden ${ann.active === false ? 'opacity-60 border-gray-200 dark:border-gray-800/50 grayscale-[0.5]' : 'border-transparent'}`}>

                                    {/* Scanline Effect if Active */}
                                    {ann.active !== false && (
                                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-[shimmer_3s_infinite]" />
                                    )}

                                    <div className="flex justify-between items-start mb-5 relative z-10">
                                        <div className="flex flex-wrap gap-2">
                                            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${getTypeStyles(ann.type)}`}>
                                                {getTypeIcon(ann.type)}
                                                {ann.type}
                                            </span>
                                            {ann.priority === 'high' && (
                                                <span className="bg-purple-500/10 text-purple-500 border border-purple-500/20 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest animate-pulse">
                                                    URGENT_PHASE
                                                </span>
                                            )}
                                            {ann.active === false && (
                                                <span className="bg-gray-500/10 text-gray-500 border border-gray-500/20 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest">
                                                    ARCHIVED
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-gray-400 tabular-nums">
                                            {ann.timestamp?.toDate ? format(ann.timestamp.toDate(), 'yy.MM.dd | HH:mm') : 'PENDING...'}
                                        </span>
                                    </div>

                                    <div className="flex-1 relative z-10">
                                        <h4 className="font-extrabold text-gray-900 dark:text-gray-100 text-lg mb-2 tracking-tight line-clamp-2">{ann.title}</h4>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed line-clamp-3">{ann.body}</p>
                                    </div>

                                    <div className="mt-6 pt-5 border-t border-gray-50 dark:border-gray-800/50 flex justify-between items-center relative z-10">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] font-black text-indigo-500 border border-indigo-100 dark:border-indigo-800">
                                                {ann.senderName?.charAt(0) || 'A'}
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">OP: {ann.senderName?.split(' ')[0] || 'ADMIN'}</span>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleToggleStatus(ann.id, ann.active)}
                                                disabled={toggling === ann.id}
                                                className={`p-2.5 rounded-xl transition-all active:scale-90 ${ann.active === false ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 hover:bg-indigo-100' : 'bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-amber-500 hover:bg-amber-50'}`}
                                                title={ann.active === false ? "Re-activate Signal" : "Archive Signal"}
                                            >
                                                {toggling === ann.id ? (
                                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                ) : ann.active === false ? <Zap size={16} /> : <Archive size={16} />}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(ann.id)}
                                                disabled={toggling === ann.id}
                                                className="p-2.5 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                                                title="Hard Erase"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Announcements;

