import React, { useState } from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoAdd, IoCamera, IoPencil } from "react-icons/io5";
import { useStatus } from "../contexts/StatusContext";
import { Avatar } from "../components/ui/Avatar";
import StatusViewer from "../components/status/StatusViewer";
import { formatDistanceToNow } from "date-fns";

const StatusPage = () => {
    const { statuses, myStatus, addStatus } = useStatus();
    const [viewingGroup, setViewingGroup] = useState(null);

    const handleCreateStatus = () => {
        // For now, simple prompt. In real app, open camera/editor.
        const text = prompt("Enter status text:");
        if (text) {
            addStatus('text', text, '#008069'); // Default teal background
        }
    };

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
                <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors" onClick={myStatus ? () => setViewingGroup(myStatus) : handleCreateStatus}>
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
                {statuses.map((group) => (
                    <div
                        key={group.user.uid}
                        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => setViewingGroup(group)}
                    >
                        <div className="relative">
                            {/* Ring indicating unread status (simplified) */}
                            <Avatar src={group.user.photoURL} size="lg" className="border-2 border-whatsapp-teal p-[2px]" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-foreground">{group.user.displayName}</h3>
                            <p className="text-sm text-muted-foreground">
                                {formatDistanceToNow(group.statuses[group.statuses.length - 1].timestamp?.toDate() || new Date())}
                            </p>
                        </div>
                    </div>
                ))}

                {statuses.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                        No recent updates from your contacts.
                    </div>
                )}
            </div>

            {/* Floating Action Buttons */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-4">
                <button className="bg-muted text-gray-600 dark:text-gray-300 p-3 rounded-full shadow-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" onClick={() => alert("Text status editor coming soon")}>
                    <IoPencil className="w-5 h-5" />
                </button>
                <button className="bg-whatsapp-teal text-white p-4 rounded-full shadow-lg hover:bg-whatsapp-dark transition-colors" onClick={handleCreateStatus}>
                    <IoCamera className="w-6 h-6" />
                </button>
            </div>

            {/* Status Viewer Overlay */}
            {viewingGroup && (
                <StatusViewer statusGroup={viewingGroup} onClose={() => setViewingGroup(null)} />
            )}
        </div>
    );
};

export default StatusPage;
