import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { FaArrowLeft, FaPlus, FaCamera, FaPen, FaEllipsisV } from "react-icons/fa";
import StatusViewer from "./StatusViewer";
import StatusCreator from "./StatusCreator";
import { motion } from "framer-motion";
import { subscribeToMyStatus, subscribeToRecentUpdates } from "../services/statusService";
import { cn } from "../lib/utils";

export default function StatusDrawer({ onClose }) {
    const { currentUser } = useAuth();
    const [myStatus, setMyStatus] = useState(null);
    const [recentUpdates, setRecentUpdates] = useState([]);
    const [viewedUpdates, setViewedUpdates] = useState([]);
    const [viewingStatus, setViewingStatus] = useState(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (!currentUser) return;

        const unsubMy = subscribeToMyStatus(currentUser.uid, setMyStatus);
        const unsubUpdates = subscribeToRecentUpdates(currentUser.uid, ({ recent, viewed }) => {
            setRecentUpdates(recent);
            setViewedUpdates(viewed);
        });

        return () => { unsubMy(); unsubUpdates(); };
    }, [currentUser]);

    if (viewingStatus) {
        return <StatusViewer
            initialUser={viewingStatus}
            allStatuses={[...(myStatus ? [myStatus] : []), ...recentUpdates, ...viewedUpdates]}
            onClose={() => setViewingStatus(null)}
        />;
    }

    if (isCreating) {
        return <StatusCreator onClose={() => setIsCreating(false)} />;
    }

    return (
        <motion.div
            className="absolute inset-0 z-10 flex flex-col bg-surface-elevated"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
        >
            {/* Header */}
            <div className="h-16 md:h-20 px-4 md:px-8 flex items-center justify-between border-b border-border/50 shrink-0 bg-surface z-20">
                <div className="flex items-center gap-4 text-text-1">
                    <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-surface-elevated transition-colors">
                        <FaArrowLeft className="text-xl" />
                    </button>
                    <h3 className="text-xl font-bold">Status</h3>
                </div>
                <div>
                    <button className="p-2 -mr-2 rounded-full hover:bg-surface-elevated transition-colors text-text-1">
                        <FaEllipsisV className="text-xl" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-surface/50">
                <div className="max-w-3xl mx-auto w-full py-6">
                    {/* My Status */}
                    <div
                        className="flex items-center p-4 cursor-pointer hover:bg-surface transition-colors border-b border-border/30 rounded-2xl mx-4 mb-6 shadow-sm bg-surface"
                        onClick={() => myStatus ? setViewingStatus(myStatus) : setIsCreating(true)}
                    >
                        <div className="relative w-14 h-14 mr-4 shrink-0">
                            <img
                                src={currentUser.photoURL || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + currentUser.uid}
                                className="w-full h-full rounded-full object-cover ring-2 ring-surface"
                                alt="My Status"
                            />
                            {!myStatus && (
                                <div className="absolute bottom-0 right-0 bg-primary text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-surface text-[10px] shadow-sm">
                                    <FaPlus />
                                </div>
                            )}
                            {myStatus && (
                                <div className="absolute -inset-[3px] rounded-full border-2 border-primary pointer-events-none" />
                            )}
                        </div>
                        <div className="flex flex-col justify-center">
                            <span className="text-text-1 font-medium text-[17px]">My status</span>
                            <span className="text-text-2 text-[14px]">
                                {myStatus ? "Tap to view update" : "Tap to add status update"}
                            </span>
                        </div>
                    </div>

                    {/* Recent Updates */}
                    {recentUpdates.length > 0 && (
                        <div className="py-2 mb-4">
                            <h4 className="px-6 pb-3 text-primary text-[14px] font-bold uppercase tracking-wider">Recent updates</h4>
                            <div className="bg-surface rounded-2xl mx-4 shadow-sm overflow-hidden border border-border/30">
                                {recentUpdates.map((status, i) => (
                                    <div
                                        key={status.userId}
                                        className={cn(
                                            "flex items-center p-4 cursor-pointer hover:bg-surface-elevated transition-colors",
                                            i !== recentUpdates.length - 1 && "border-b border-border/30"
                                        )}
                                        onClick={() => setViewingStatus(status)}
                                    >
                                        <div className="relative w-12 h-12 mr-4 shrink-0">
                                            <div className="absolute -inset-[2px] rounded-full border-2 border-primary" />
                                            <img src={status.userPhoto} className="w-full h-full rounded-full object-cover p-[2px] border-2 border-transparent" alt={status.userName} />
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <span className="text-text-1 font-medium text-[16px]">{status.userName}</span>
                                            <span className="text-text-2 text-[13px]">
                                                {status.items[status.items.length - 1]?.timestamp?.toDate
                                                    ? new Date(status.items[status.items.length - 1].timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : "Just now"
                                                }
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Viewed Updates */}
                    {viewedUpdates.length > 0 && (
                        <div className="py-2">
                            <h4 className="px-6 pb-3 text-text-2 text-[14px] font-bold uppercase tracking-wider">Viewed updates</h4>
                            <div className="bg-surface rounded-2xl mx-4 shadow-sm overflow-hidden border border-border/30">
                                {viewedUpdates.map((status, i) => (
                                    <div
                                        key={status.userId}
                                        className={cn(
                                            "flex items-center p-4 cursor-pointer hover:bg-surface-elevated transition-colors",
                                            i !== viewedUpdates.length - 1 && "border-b border-border/30"
                                        )}
                                        onClick={() => setViewingStatus(status)}
                                    >
                                        <div className="relative w-12 h-12 mr-4 shrink-0">
                                            <div className="absolute -inset-[2px] rounded-full border-2 border-text-2/30" />
                                            <img src={status.userPhoto} className="w-full h-full rounded-full object-cover p-[2px] border-2 border-transparent" alt={status.userName} />
                                        </div>
                                        <div className="flex flex-col justify-center">
                                            <span className="text-text-1 font-medium text-[16px]">{status.userName}</span>
                                            <span className="text-text-2 text-[13px]">
                                                {status.items[status.items.length - 1]?.timestamp?.toDate
                                                    ? new Date(status.items[status.items.length - 1].timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : "Just now"
                                                }
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!recentUpdates.length && !viewedUpdates.length && !myStatus && (
                        <div className="py-12 text-center text-text-2 text-sm flex flex-col items-center gap-3 opacity-60">
                            <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center mb-2">
                                <FaCamera className="text-2xl" />
                            </div>
                            <p>No status updates to show</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Buttons */}
            <div className="absolute bottom-8 right-8 flex flex-col gap-4">
                <button
                    className="w-12 h-12 rounded-xl bg-surface-elevated text-text-2 shadow-lg flex items-center justify-center text-lg hover:shadow-xl hover:scale-110 transition-all border border-border/30"
                    onClick={() => setIsCreating(true)}
                    aria-label="Text Status"
                >
                    <FaPen />
                </button>
                <button
                    className="w-16 h-16 rounded-2xl bg-primary text-white shadow-xl flex items-center justify-center text-2xl hover:shadow-primary/40 hover:scale-105 transition-all active:scale-95"
                    onClick={() => setIsCreating(true)}
                    aria-label="Camera Status"
                >
                    <FaCamera />
                </button>
            </div>
        </motion.div>
    );
}
