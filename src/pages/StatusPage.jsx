import React, { useState } from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoAdd, IoCamera, IoPencil, IoChevronDown, IoChevronUp } from "react-icons/io5";
import { useStatus } from "../contexts/StatusContext";
import { Avatar } from "../components/ui/Avatar";
import StatusViewer from "../components/status/StatusViewer";
import StatusCreator from "../components/status/StatusCreator";
import { formatDistanceToNow } from "date-fns";

// Safe timestamp extractor — handles Firestore Timestamps, Dates, and raw numbers
const safeDate = (ts) => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    return new Date();
};

const StatusPage = () => {
    const { statuses, myStatus, viewedIds } = useStatus();
    const [viewingGroup, setViewingGroup] = useState(null);
    const [showCreator, setShowCreator] = useState(false);
    const [showMuted, setShowMuted] = useState(false);
    const [showViewed, setShowViewed] = useState(true);

    // Filter Logic — guarded against undefined IDs
    const recentUpdates = statuses.filter(group => {
        if (!group?.statuses?.length) return false;
        return group.statuses.some(s => s?.id && !viewedIds.has(s.id));
    });

    const viewedUpdates = statuses.filter(group => {
        if (!group?.statuses?.length) return false;
        return group.statuses.every(s => s?.id && viewedIds.has(s.id));
    });

    return (
        <div className="flex flex-col h-full bg-background md:max-w-md md:mx-auto md:border-x md:border-border relative">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 bg-muted/30 border-b border-border">
                <Link to="/" className="text-primary hover:bg-muted p-2 rounded-full">
                    <IoArrowBack className="w-6 h-6" />
                </Link>
                <h1 className="text-xl font-semibold">Status</h1>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
                {/* My Status */}
                <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors" onClick={() => myStatus ? setViewingGroup(myStatus) : setShowCreator(true)}>
                    <div className="relative">
                        <Avatar src={myStatus?.user?.photoURL} size="lg" className={myStatus ? "border-2 border-whatsapp-teal p-[2px]" : ""} />
                        {!myStatus && (
                            <div className="absolute bottom-0 right-0 bg-whatsapp-teal text-white rounded-full p-1 border-2 border-background">
                                <IoAdd className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-foreground">My Status</h3>
                        <p className="text-sm text-muted-foreground">
                            {myStatus ? formatDistanceToNow(safeDate(myStatus.statuses[0]?.timestamp)) : "Tap to add status update"}
                        </p>
                    </div>
                </div>

                <div className="px-4 py-2 text-sm font-bold text-muted-foreground uppercase bg-muted/20">
                    Recent updates
                </div>

                {/* Recent Updates */}
                {recentUpdates.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm italic opacity-60">
                        No new updates
                    </div>
                ) : (
                    recentUpdates.map((group) => (
                        <div
                            key={group.user.uid}
                            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors"
                            onClick={() => setViewingGroup(group)}
                        >
                            <div className="relative">
                                {/* Ring indicating unread status - Green */}
                                <Avatar src={group.user.photoURL} size="lg" className="border-2 border-whatsapp-teal p-[2px]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-foreground">{group.user.displayName}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {formatDistanceToNow(safeDate(group.statuses[group.statuses.length - 1]?.timestamp))}
                                </p>
                            </div>
                        </div>
                    ))
                )}

                {/* Viewed Updates (Accordion) */}
                {viewedUpdates.length > 0 && (
                    <div className="mt-2">
                        <div
                            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 bg-muted/10"
                            onClick={() => setShowViewed(!showViewed)}
                        >
                            <span className="text-sm font-bold text-muted-foreground uppercase">Viewed updates</span>
                            {showViewed ? <IoChevronUp className="text-muted-foreground" /> : <IoChevronDown className="text-muted-foreground" />}
                        </div>

                        {showViewed && viewedUpdates.map((group) => (
                            <div
                                key={group.user.uid}
                                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors opacity-75"
                                onClick={() => setViewingGroup(group)}
                            >
                                <div className="relative">
                                    {/* Gray Ring for Viewed */}
                                    <Avatar src={group.user.photoURL} size="lg" className="border-2 border-border p-[2px]" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-foreground">{group.user.displayName}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {formatDistanceToNow(safeDate(group.statuses[group.statuses.length - 1]?.timestamp))}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Muted Updates (Accordion) */}
                <div className="mt-4 border-t border-border/50">
                    <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => setShowMuted(!showMuted)}
                    >
                        <span className="text-sm font-bold text-muted-foreground uppercase">Muted updates</span>
                        {showMuted ? <IoChevronUp className="text-muted-foreground" /> : <IoChevronDown className="text-muted-foreground" />}
                    </div>
                    {showMuted && (
                        <div className="px-4 py-2 text-center text-sm text-muted-foreground">
                            No muted updates
                        </div>
                    )}
                </div>
            </div>

            {/* Floating Action Buttons */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-4">
                <button className="bg-muted text-gray-600 dark:text-gray-300 p-3 rounded-full shadow-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" onClick={() => setShowCreator(true)}>
                    <IoPencil className="w-5 h-5" />
                </button>
                <button className="bg-whatsapp-teal text-white p-4 rounded-full shadow-lg hover:bg-whatsapp-dark transition-colors" onClick={() => setShowCreator(true)}>
                    <IoCamera className="w-6 h-6" />
                </button>
            </div>

            {/* Status Viewer Overlay */}
            {viewingGroup && (
                <StatusViewer
                    statusGroup={viewingGroup}
                    allStatuses={statuses} // Pass all statuses for navigation/sidebar
                    onClose={() => setViewingGroup(null)}
                />
            )}

            {/* Status Creator Modal */}
            {showCreator && (
                <StatusCreator onClose={() => setShowCreator(false)} onSuccess={() => setShowCreator(false)} />
            )}
        </div>
    );
};

export default StatusPage;
