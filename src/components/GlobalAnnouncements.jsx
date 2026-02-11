import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { X, Bell, AlertTriangle, Info, Megaphone, Activity, Zap, ShieldAlert } from 'lucide-react';
import { listenerManager } from '../utils/ListenerManager';

const GlobalAnnouncements = () => {
    const [latestAnnouncement, setLatestAnnouncement] = useState(null);
    const [dismissedId, setDismissedId] = useState(localStorage.getItem('last_dismissed_announcement'));
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Query for active announcements
        // Note: Requires composite index on [active: ASC, timestamp: DESC]
        const q = query(
            collection(db, 'announcements'),
            where('active', '==', true),
            orderBy('timestamp', 'desc'),
            limit(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const ann = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

                // Show if it's new or high priority
                if (ann.id !== dismissedId || ann.priority === 'high') {
                    setLatestAnnouncement(ann);
                    // Small delay for animation trigger if already visible
                    if (isVisible && ann.id !== latestAnnouncement?.id) {
                        setIsVisible(false);
                        setTimeout(() => setIsVisible(true), 100);
                    } else {
                        setIsVisible(true);
                    }
                }
            } else {
                setIsVisible(false);
            }
        }, (error) => {
            listenerManager.handleListenerError(error, 'Announcements');
        });

        // Register with ListenerManager so it gets cleaned up during logout
        listenerManager.subscribe('global-announcements', unsubscribe);

        return () => {
            listenerManager.unsubscribe('global-announcements');
        };
    }, [dismissedId]);

    const handleDismiss = () => {
        if (latestAnnouncement) {
            localStorage.setItem('last_dismissed_announcement', latestAnnouncement.id);
            setDismissedId(latestAnnouncement.id);
        }
        setIsVisible(false);
    };

    if (!isVisible || !latestAnnouncement) return null;

    const getTypeConfig = () => {
        switch (latestAnnouncement.type) {
            case 'warning': return {
                bg: 'bg-amber-600/90 dark:bg-amber-600/80',
                icon: <AlertTriangle size={18} className="text-white" />,
                label: 'CAUTION_SIGNAL',
                accent: 'bg-amber-400'
            };
            case 'alert': return {
                bg: 'bg-rose-700/90 dark:bg-rose-700/80',
                icon: <ShieldAlert size={18} className="text-white" />,
                label: 'SYS_CRITICAL',
                accent: 'bg-rose-400'
            };
            default: return {
                bg: 'bg-indigo-700/90 dark:bg-indigo-700/80',
                icon: <Activity size={18} className="text-white" />,
                label: 'INFO_LOG',
                accent: 'bg-cyan-400'
            };
        }
    };

    const config = getTypeConfig();

    return (
        <div className="fixed bottom-8 right-8 z-[10000] max-w-[380px] w-full animate-in slide-in-from-right-10 fade-in duration-500">
            <div className={`relative rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-white/20 backdrop-blur-xl ${config.bg} p-1`}>

                {/* Tactical Scanline */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

                <div className="p-5 flex gap-4 relative z-10">
                    <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10 shadow-inner">
                            {config.icon}
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] italic font-mono flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${config.accent} animate-pulse`} />
                                {config.label}
                            </span>
                            <button
                                onClick={handleDismiss}
                                className="w-6 h-6 -mr-1 -mt-1 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all active:scale-90"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <h4 className="font-black text-white text-base tracking-tight mb-2 leading-tight">
                            {latestAnnouncement.title}
                        </h4>

                        <p className="text-xs text-white/80 font-medium leading-relaxed mb-4 line-clamp-4">
                            {latestAnnouncement.body}
                        </p>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${config.accent}`} />
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest tabular-nums">
                                    NODE: {latestAnnouncement.id.slice(0, 6)}
                                </span>
                            </div>
                            {latestAnnouncement.priority === 'high' && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/10 rounded-full border border-white/10 animate-pulse">
                                    <Zap size={10} className="text-white fill-white" />
                                    <span className="text-[9px] font-black text-white uppercase tracking-tighter">URGENT</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Animated Progress Bar for High Priority */}
                {latestAnnouncement.priority === 'high' && (
                    <div className="h-1 bg-white/10 w-full relative overflow-hidden">
                        <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default GlobalAnnouncements;

