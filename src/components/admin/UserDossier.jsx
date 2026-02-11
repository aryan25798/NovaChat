import React from 'react';
import { X, Shield, ShieldAlert, Trash2, Mail, Phone, Calendar, Activity, Info, AlertCircle, MapPin, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

const UserDossier = ({ user, location, onClose, onBan, onNuke }) => {
    if (!user) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            <div className="relative w-full max-w-2xl bg-white dark:bg-[#1f2937] rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent pointer-events-none" />

                <div className="relative p-8 px-10">
                    <div className="flex justify-between items-start mb-8">
                        <div className="flex items-center gap-6">
                            <div className="relative">
                                <div className="absolute -inset-1.5 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full blur-sm opacity-20" />
                                <img
                                    src={user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.id}`}
                                    alt=""
                                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl relative z-10"
                                />
                                {user.isOnline && (
                                    <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-white dark:border-[#1f2937] z-20" />
                                )}
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{user.displayName || 'Anonymous'}</h2>
                                <div className="flex items-center gap-3 mt-1.5">
                                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                        UID: {user.id}
                                    </span>
                                    {user.isAdmin && (
                                        <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-tighter">Verified Admin</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl transition-all group active:scale-95"
                        >
                            <X className="text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" size={24} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                        {/* Vital Stats */}
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Neural Data</h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4 group">
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                                        <Mail size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Encryption Link</p>
                                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{user.email || 'Hidden Signal'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 group">
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                                        <Phone size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Secure Frequency</p>
                                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{user.phoneNumber || 'None Established'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 group">
                                    <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                                        <Calendar size={18} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Initial Uplink</p>
                                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                            {user.createdAt?.toDate ? format(user.createdAt.toDate(), 'PPP') : 'Pre-Epoch'}
                                        </p>
                                    </div>
                                </div>
                                {location && (
                                    <div className="flex items-center gap-4 group">
                                        <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                                            <MapPin size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Last Known Coordinates</p>
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                                                </p>
                                                <a
                                                    href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-indigo-500 transition-colors"
                                                    title="View on Google Maps"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Engagement & Risk */}
                        <div className="space-y-6">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Telemetry Overlook</h3>
                            <div className="p-5 rounded-3xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Activity size={64} />
                                </div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Risk Integrity</span>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${user.isBanned ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                        {user.isBanned ? 'Compromised' : 'Nominal'}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${user.isBanned ? 'bg-red-500 w-full' : 'bg-emerald-500 w-1/4'}`}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center text-[11px] font-bold text-gray-500">
                                        <span>Confidence: 98.4%</span>
                                        <span>Rank: {user.isBanned ? 'Restricted' : 'Standard'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-8 border-t border-gray-100 dark:border-gray-800 flex gap-4">
                        <button
                            onClick={() => onBan(user.id, user.isBanned)}
                            className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg shadow-indigo-500/5 ${user.isBanned
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                : 'bg-amber-500 text-white hover:bg-amber-600'
                                }`}
                        >
                            {user.isBanned ? <Shield size={18} /> : <ShieldAlert size={18} />}
                            {user.isBanned ? 'Restore Access' : 'Restrict Identity'}
                        </button>
                        <button
                            onClick={() => onNuke(user.id)}
                            className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-500/20"
                        >
                            <Trash2 size={18} />
                            Nuke User & Data
                        </button>
                    </div>

                    <p className="mt-8 text-center text-[9px] font-bold text-gray-400 uppercase tracking-widest opacity-30">
                        Secure Neural Dossier Link — Authorized Admin Eyes Only
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UserDossier;
