import React, { useState, useEffect, useRef } from 'react';
import { db, auth, functions } from '../../firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { format } from 'date-fns';
import { FaTrash, FaEyeSlash, FaSearch, FaUserShield, FaExternalLinkAlt, FaFileAlt, FaDownload } from 'react-icons/fa';
import { Search, ShieldAlert, User, MoreHorizontal, Info, X } from 'lucide-react';
import { subscribeToTypingStatus } from '../../services/typingService';
import { VideoPlayer } from '../ui/VideoPlayer';
import { downloadMedia } from '../../utils/downloadHelper';

const SpyChatViewer = ({ chatId, onClose, onOpenDossier }) => {
    const [messages, setMessages] = useState([]);
    const [chatData, setChatData] = useState(null);
    const [participants, setParticipants] = useState({});
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [typingUsers, setTypingUsers] = useState({});
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!chatId) return;

        const fetchMetadata = async () => {
            setError(null);
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
            } catch (err) {
                console.error("Metadata Load Error:", err);
                if (err.code === 'permission-denied') setError('PERMISSION_DENIED');
            }
        };
        fetchMetadata();

        const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }, (err) => {
            console.error("Signal Subscription Error:", err);
            if (err.code === 'permission-denied') setError('PERMISSION_DENIED');
        });

        const unsubscribeTyping = subscribeToTypingStatus(chatId, null, (typingData) => {
            setTypingUsers(typingData);
        });

        return () => {
            unsubscribe();
            unsubscribeTyping();
        };
    }, [chatId]);

    const hardDeleteMessage = async (msgId) => {
        if (!window.confirm("CRITICAL ACTION: Permanently erase this message from the database? This cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
        } catch (err) {
            alert("Hard Delete Failed: " + err.message);
        }
    };



    // ... (existing imports)

    const hardDeleteChat = async () => {
        if (!window.confirm("NUCLEAR OPTION: This will permanently delete this entire chat and all associated messages for ALL users. This action is irreversible. Continue?")) return;
        try {
            const deleteChatFn = httpsCallable(functions, 'adminDeleteChat');
            await deleteChatFn({ chatId });
            alert("Chat permanently erased.");
            onClose();
        } catch (err) {
            console.error(err);
            alert("Hard Delete Chat Failed: " + err.message);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#111827] border-l border-gray-200 dark:border-gray-800 relative overflow-hidden font-sans">
            {/* Tactical Header */}
            <div className="p-4 bg-white dark:bg-[#1f2937] border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row justify-between items-start md:items-center z-10 shadow-sm gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex -space-x-3 overflow-hidden p-1">
                        {Object.entries(participants).map(([uid, p], i) => (
                            <div
                                key={uid}
                                className="relative group cursor-pointer"
                                onClick={() => onOpenDossier({ id: uid, ...p })}
                            >
                                <img
                                    src={p.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${uid}`}
                                    className="w-10 h-10 rounded-full border-2 border-white dark:border-[#1f2937] object-cover ring-2 ring-transparent group-hover:ring-indigo-500 transition-all shadow-md"
                                />
                                {p.isOnline && (
                                    <div className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-[#1f2937]" />
                                )}
                                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-[9px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                    {p.displayName || 'Anonymous'}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div>
                        <h3 className="text-gray-900 dark:text-white font-bold text-sm tracking-tight">
                            Neural Feed: <span className="text-indigo-600 dark:text-indigo-400 font-mono">{chatId.slice(0, 12)}</span>
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">SECURED_LINE</span>
                            <span className="text-gray-300 dark:text-gray-700 mx-1">|</span>
                            {Object.values(participants).map((p, i) => (
                                <button
                                    key={i}
                                    onClick={() => onOpenDossier(p)}
                                    className="text-[9px] font-black text-gray-400 hover:text-indigo-500 uppercase transition-colors"
                                >
                                    {p.displayName}{i < Object.values(participants).length - 1 ? ' + ' : ''}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-48">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                        <input
                            type="text"
                            placeholder="Scan messages..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 dark:bg-[#111827] border border-gray-100 dark:border-gray-800 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-[10px] font-medium"
                        />
                    </div>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden md:block" />
                    <button
                        onClick={hardDeleteChat}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase rounded-lg hover:bg-red-100 transition-colors border border-red-100 dark:border-red-900/50 shadow-sm"
                        title="Permanently Delete Entire Chat"
                    >
                        <FaTrash size={10} />
                        Purge Chat
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-[#111827] custom-scrollbar">
                {error === 'PERMISSION_DENIED' ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                        <div className="text-4xl text-red-500 opacity-50">🚫</div>
                        <h4 className="text-gray-900 dark:text-white font-bold text-sm uppercase">Access Denied</h4>
                        <p className="text-xs text-gray-500 max-w-xs">
                            Administrative security clearance required for this stream.
                        </p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-xs font-medium text-gray-400 italic">No messages found in this chat</p>
                    </div>
                ) : (
                    messages.filter(msg =>
                        msg.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        participants[msg.senderId]?.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
                    ).map((msg, idx) => {
                        const sender = participants[msg.senderId] || {};
                        const isSoftDeleted = msg.isSoftDeleted;
                        const isHiddenByUser = msg.hiddenBy && msg.hiddenBy.length > 0;

                        return (
                            <div key={msg.id} className="flex gap-4 group animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div
                                    className="flex-shrink-0 cursor-pointer pt-1"
                                    onClick={() => onOpenDossier({ id: msg.senderId, ...sender })}
                                >
                                    <img
                                        src={sender.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${msg.senderId}`}
                                        className="w-9 h-9 rounded-xl object-cover border border-gray-200 dark:border-gray-800 shadow-sm"
                                    />
                                </div>
                                <div className={`
                                    relative p-4 rounded-2xl border transition-all flex-1
                                    ${(isSoftDeleted || isHiddenByUser)
                                        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 shadow-sm'
                                        : 'bg-white dark:bg-[#1f2937] border-gray-100 dark:border-gray-800 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/50'}
                                `}>
                                    {/* Action Toolbar (Visible on Hover) */}
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                        <button
                                            onClick={() => hardDeleteMessage(msg.id)}
                                            className="p-1.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                            title="Permanently Delete (Hard Delete)"
                                        >
                                            <FaTrash size={12} />
                                        </button>
                                    </div>

                                    {/* Header info */}
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                                                {sender?.displayName || 'Unknown'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium">
                                                {msg.timestamp?.toDate ? format(msg.timestamp.toDate(), 'p') : 'Pending'}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {isSoftDeleted && (
                                                <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 uppercase tracking-tighter">
                                                    <FaTrash size={8} /> Soft Deleted
                                                </span>
                                            )}
                                            {isHiddenByUser && (
                                                <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 uppercase tracking-tighter">
                                                    <FaEyeSlash size={8} /> Hidden by {msg.hiddenBy.length} User(s)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Content */}
                                    {/* Content */}
                                    {msg.type === 'image' && (
                                        <div className="relative rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 max-w-sm mt-2 group/media">
                                            <img src={msg.fileUrl || msg.imageUrl} alt="Payload" className="w-full object-cover max-h-60" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); downloadMedia(msg.fileUrl || msg.imageUrl, msg.fileName); }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-black/70"
                                                title="Download Image"
                                            >
                                                <FaDownload size={12} />
                                            </button>
                                        </div>
                                    )}

                                    {msg.type === 'video' && (
                                        <div className="rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 max-w-sm mt-2 relative group/media">
                                            <VideoPlayer
                                                src={msg.fileUrl || msg.videoUrl}
                                                className="max-h-60"
                                                fileName={msg.fileName}
                                            />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); downloadMedia(msg.fileUrl || msg.videoUrl, msg.fileName); }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover/media:opacity-100 transition-opacity hover:bg-black/70 z-20"
                                                title="Download Video"
                                            >
                                                <FaDownload size={12} />
                                            </button>
                                        </div>
                                    )}

                                    {msg.type === 'audio' && (
                                        <div className="flex items-center gap-2 mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 w-fit">
                                            <audio controls src={msg.fileUrl || msg.audioUrl} className="h-8 w-60" />
                                        </div>
                                    )}

                                    {msg.type === 'file' && (
                                        <div className="flex items-center gap-3 p-3 mt-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-w-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                            onClick={(e) => { e.stopPropagation(); downloadMedia(msg.fileUrl, msg.fileName); }}>
                                            <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2.5 rounded-full text-indigo-600 dark:text-indigo-400">
                                                <FaFileAlt size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                                                    {msg.fileName || "Document"}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase">
                                                    {msg.fileType?.split('/')[1] || 'FILE'} • {msg.fileSize ? `${(msg.fileSize / 1024).toFixed(0)} KB` : ''}
                                                </p>
                                            </div>
                                            <FaDownload className="text-gray-400" size={14} />
                                        </div>
                                    )}

                                    {(msg.text && (msg.type === 'text' || (!['image', 'video', 'audio', 'file'].includes(msg.type)))) && (
                                        <p className={`text-sm leading-relaxed ${isSoftDeleted ? 'text-gray-400 italic' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {msg.text}
                                        </p>
                                    )}

                                    {/* Metadata (Raw Debug) */}
                                    <div className="mt-3 pt-2 border-t border-gray-50 dark:border-gray-800/50 text-[9px] flex items-center justify-between text-gray-400 font-mono">
                                        <span>ID: {msg.id.slice(0, 8)}...</span>
                                        <span>TYPE: {msg.type?.toUpperCase() || 'TEXT'}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Footer / Status */}
            <div className="p-3 bg-gray-50 dark:bg-[#1f2937] border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-semibold tracking-tight uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                        Live Audit Connector Active
                    </div>
                    {Object.keys(typingUsers).length > 0 && (
                        <div className="flex items-center gap-2 animate-pulse">
                            <div className="flex -space-x-1">
                                {Object.keys(typingUsers).map(uid => (
                                    <img
                                        key={uid}
                                        src={participants[uid]?.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${uid}`}
                                        className="w-4 h-4 rounded-full border border-white dark:border-gray-800 object-cover"
                                    />
                                ))}
                            </div>
                            <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase italic">
                                {Object.keys(typingUsers).length === 1
                                    ? `${participants[Object.keys(typingUsers)[0]]?.displayName || 'Someone'} is typing...`
                                    : 'Multiple agents are typing...'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="text-[10px] text-gray-400 italic">
                    All actions are logged securely
                </div>
            </div>
        </div>
    );
};

export default SpyChatViewer;
