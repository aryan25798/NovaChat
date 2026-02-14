import React, { useState, useEffect } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { markStatusAsViewed } from "../services/statusService";

export default function StatusViewer({ initialUser, allStatuses, onClose }) {
    const { currentUser } = useAuth();
    const [userIndex, setUserIndex] = useState(0);
    const [itemIndex, setItemIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    // Sync initialUser with userIndex when component mounts or initialUser changes
    useEffect(() => {
        const idx = allStatuses.findIndex(s => s.userId === initialUser.userId);
        if (idx >= 0) setUserIndex(idx);
    }, [initialUser, allStatuses]);

    const currentUserData = allStatuses[userIndex];
    const currentItem = currentUserData?.items[itemIndex];

    // Mark as viewed logic
    useEffect(() => {
        if (!currentItem || !currentUserData) return;

        // Don't mark own status as viewed (opt) or check if already viewed
        if (currentUserData.userId === currentUser.uid) return;

        markStatusAsViewed(
            currentUserData.userId, // The document ID is the userId
            currentItem.id,
            currentUser.uid
        );

    }, [userIndex, itemIndex, currentUser.uid, currentUserData, currentItem]);

    // Timer Logic
    useEffect(() => {
        if (!currentItem) return;
        setProgress(0);

        const duration = currentItem.type === 'video' ? 30000 : 5000;
        const interval = 50;
        const step = 100 / (duration / interval);

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(timer);
                    nextStory();
                    return 100;
                }
                return prev + step;
            });
        }, interval);

        return () => clearInterval(timer);
    }, [currentItem]);

    const nextStory = () => {
        if (itemIndex < currentUserData.items.length - 1) {
            setItemIndex(prev => prev + 1);
        } else {
            if (userIndex < allStatuses.length - 1) {
                setUserIndex(prev => prev + 1);
                setItemIndex(0);
            } else {
                onClose();
            }
        }
    };

    const prevStory = () => {
        if (itemIndex > 0) {
            setItemIndex(prev => prev - 1);
        } else {
            if (userIndex > 0) {
                setUserIndex(prev => prev - 1);
                setItemIndex(allStatuses[userIndex - 1].items.length - 1);
            }
        }
    };

    if (!currentItem) return null;

    return (
        <motion.div
            className="fixed inset-0 bg-black z-[100000] flex flex-col font-sans"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
        >
            {/* Progress Bars */}
            <div className="flex gap-1.5 p-2 pt-4 z-20 w-full max-w-2xl mx-auto absolute top-0 left-0 right-0">
                {currentUserData.items.map((item, idx) => (
                    <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm">
                        <div
                            className="h-full bg-white transition-all duration-75 ease-linear shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                            style={{
                                width: idx < itemIndex ? '100%' : (idx === itemIndex ? `${progress}%` : '0%')
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-4 pt-8 z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent absolute top-0 left-0 right-0">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="text-white text-xl p-2 rounded-full hover:bg-white/10 transition-colors">
                        <FaArrowLeft />
                    </button>
                    <div className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative">
                            <img
                                src={currentUserData.userPhoto}
                                alt={currentUserData.userName}
                                className="w-10 h-10 rounded-full object-cover border-2 border-white/20 group-hover:border-white/50 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col drop-shadow-md">
                            <h4 className="text-white text-[15px] font-semibold leading-tight tracking-wide">{currentUserData.userName}</h4>
                            <span className="text-white/80 text-[11px] font-medium opacity-80">
                                {new Date(currentItem.timestamp instanceof Date
                                    ? currentItem.timestamp
                                    : currentItem.timestamp?.toDate ? currentItem.timestamp.toDate() : Date.now()
                                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Media Content */}
            <div className="flex-1 relative flex items-center justify-center bg-black">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${userIndex}-${itemIndex}`}
                        className="w-full h-full flex items-center justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {currentItem.type === 'image' && (
                            <img src={currentItem.content} className="max-w-full max-h-full object-contain" alt="Status" />
                        )}
                        {currentItem.type === 'video' && (
                            <video src={currentItem.content} autoPlay muted playsInline className="max-w-full max-h-full" />
                        )}
                        {currentItem.type === 'text' && (
                            <div
                                className="w-full h-full flex items-center justify-center p-8 text-center text-white text-2xl md:text-4xl font-medium leading-relaxed"
                                style={{ background: currentItem.background }}
                            >
                                <p>{currentItem.content}</p>
                            </div>
                        )}
                        {currentItem.caption && (
                            <div className="absolute bottom-10 left-0 right-0 p-4 text-center text-white text-lg bg-black/40 backdrop-blur-sm">
                                {currentItem.caption}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Touch Zones for Navigation */}
                <div className="absolute top-0 bottom-0 left-0 w-1/3 z-20" onClick={prevStory} />
                <div className="absolute top-0 bottom-0 right-0 w-1/3 z-20" onClick={nextStory} />
            </div>
        </motion.div>
    );
}
