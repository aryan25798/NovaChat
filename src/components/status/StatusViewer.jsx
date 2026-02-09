import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IoClose, IoChevronBack, IoChevronForward } from "react-icons/io5";
import { Avatar } from "../ui/Avatar";
import { formatDistanceToNow } from "date-fns";

const StatusViewer = ({ statusGroup, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    const currentStatus = statusGroup.statuses[currentIndex];

    useEffect(() => {
        // Reset progress on index change
        setProgress(0);
        const duration = 5000; // 5 seconds per status
        const interval = 50; // Update every 50ms

        const timer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    handleNext();
                    return 0;
                }
                return prev + (100 / (duration / interval));
            });
        }, interval);

        return () => clearInterval(timer);
    }, [currentIndex]);

    const handleNext = () => {
        if (currentIndex < statusGroup.statuses.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            onClose(); // Close if last status
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center"
            >
                {/* Progress Bar */}
                <div className="absolute top-4 left-0 w-full px-2 flex gap-1 z-50">
                    {statusGroup.statuses.map((_, idx) => (
                        <div key={idx} className="h-1 flex-1 bg-gray-600 rounded-full overflow-hidden">
                            <div
                                className={`h-full bg-white transition-all duration-75 ease-linear ${idx < currentIndex ? 'w-full' : idx === currentIndex ? '' : 'w-0'}`}
                                style={{ width: idx === currentIndex ? `${progress}%` : undefined }}
                            />
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="absolute top-8 left-0 w-full p-4 flex items-center justify-between z-50 text-white">
                    <div className="flex items-center gap-3">
                        <IoChevronBack className="w-6 h-6 cursor-pointer" onClick={onClose} />
                        <Avatar src={statusGroup.user.photoURL} className="w-10 h-10 border border-white/20" />
                        <div className="flex flex-col">
                            <span className="font-semibold">{statusGroup.user.displayName}</span>
                            <span className="text-xs text-gray-300">
                                {currentStatus.timestamp ? formatDistanceToNow(currentStatus.timestamp.toDate()) : 'Just now'}
                            </span>
                        </div>
                    </div>
                    <IoClose className="w-8 h-8 cursor-pointer hover:bg-white/10 rounded-full p-1" onClick={onClose} />
                </div>

                {/* Content */}
                <div className="w-full h-full flex items-center justify-center relative">
                    {/* Navigation Click Areas */}
                    <div className="absolute left-0 top-0 w-1/3 h-full z-40 cursor-pointer" onClick={handlePrev} />
                    <div className="absolute right-0 top-0 w-1/3 h-full z-40 cursor-pointer" onClick={handleNext} />

                    {currentStatus.type === 'text' ? (
                        <div
                            className="w-full h-full flex items-center justify-center text-center p-8 text-white font-bold text-2xl md:text-4xl"
                            style={{ backgroundColor: currentStatus.background || '#000000' }}
                        >
                            {currentStatus.content}
                        </div>
                    ) : (
                        <img
                            src={currentStatus.content}
                            className="max-h-full max-w-full object-contain"
                            alt="Status"
                        />
                    )}
                </div>

                {/* Caption (if any) */}
                {currentStatus.caption && (
                    <div className="absolute bottom-10 py-2 px-4 bg-black/50 rounded-full text-white text-sm">
                        {currentStatus.caption}
                    </div>
                )}

            </motion.div>
        </AnimatePresence>
    );
};

export default StatusViewer;
