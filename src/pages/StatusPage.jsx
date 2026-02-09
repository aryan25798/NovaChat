import React, { useState } from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoAdd, IoCamera, IoPencil, IoChevronDown, IoChevronUp } from "react-icons/io5";
import { useStatus } from "../contexts/StatusContext";
import { Avatar } from "../components/ui/Avatar";
import StatusViewer from "../components/status/StatusViewer";
import StatusCreator from "../components/status/StatusCreator";
import { formatDistanceToNow } from "date-fns";

const StatusPage = () => {
    const { statuses, myStatus } = useStatus(); // removed addStatus from here, used in Creator
    const [viewingGroup, setViewingGroup] = useState(null);
    const [showCreator, setShowCreator] = useState(false);
    const [showMuted, setShowMuted] = useState(false);

    // Mock Viewed/Muted logic (would normally come from statusService/Context)
    // For MVP, we'll assume all updates in 'statuses' are "Recent" unless marked viewed locally
    // Since complex viewed/muted persistence is out of scope for this step, we'll just list them.

    // In a real app, `statuses` would be split into `recent`, `viewed`, `muted`.
    // The `useStatus` hook currently returns `statuses` which are "active recent updates".

    // Check if duplicate StatusViewer is an issue:
    // We are using the one imported from '../components/status/StatusViewer'

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
                            {myStatus ? formatDistanceToNow(myStatus.statuses[0].timestamp.toDate()) : "Tap to add status update"}
                        </p>
                    </div>
                </div>

                <div className="px-4 py-2 text-sm font-bold text-muted-foreground uppercase bg-muted/20">
                    Recent updates
                </div>

                {/* Recent Updates */}
                {statuses.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        No recent updates from your contacts.
                    </div>
                ) : (
                    statuses.map((group) => (
                        <div
                            key={group.user.uid}
                            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors"
                            onClick={() => setViewingGroup(group)}
                        >
                            <div className="relative">
                                {/* Ring indicating unread status */}
                                <Avatar src={group.user.photoURL} size="lg" className="border-2 border-whatsapp-teal p-[2px]" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-foreground">{group.user.displayName}</h3>
                                <p className="text-sm text-muted-foreground">
                                    {formatDistanceToNow(group.statuses[group.statuses.length - 1].timestamp?.toDate() || new Date())}
                                </p>
                            </div>
                        </div>
                    ))
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
