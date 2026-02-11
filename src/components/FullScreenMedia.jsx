import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaDownload, FaChevronLeft, FaChevronRight, FaSearchPlus, FaSearchMinus } from 'react-icons/fa';
import { downloadMedia } from '../utils/downloadHelper';
import { Button } from './ui/Button';

const FullScreenMedia = ({ src, type, fileName, onClose, onNext, onPrev, hasNext, hasPrev }) => {
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight' && hasNext) onNext();
            if (e.key === 'ArrowLeft' && hasPrev) onPrev();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, hasNext, hasPrev, onNext, onPrev]);

    const handleWheel = (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const newScale = scale - e.deltaY * 0.01;
            setScale(Math.min(Math.max(0.5, newScale), 5));
        }
    };

    if (!src) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex flex-col"
                onClick={onClose}
                onWheel={handleWheel}
            >
                {/* Toolbar */}
                <div className="flex items-center justify-between p-4 bg-black/40 z-50 text-white" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                {type === 'image' ? '📷' : '🎥'}
                            </div>
                            <div className="flex flex-col">
                                <span className="font-medium text-sm">{fileName || 'Media'}</span>
                                <span className="text-xs text-gray-400">
                                    {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {type === 'image' && (
                            <>
                                <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(s + 0.5, 5))}>
                                    <FaSearchPlus />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(s - 0.5, 0.5))}>
                                    <FaSearchMinus />
                                </Button>
                            </>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => downloadMedia(src, fileName)}>
                            <FaDownload />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <FaTimes size={20} />
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                    {/* Navigation Buttons */}
                    {hasPrev && (
                        <button
                            className="absolute left-4 z-50 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                            onClick={(e) => { e.stopPropagation(); onPrev(); }}
                        >
                            <FaChevronLeft size={24} />
                        </button>
                    )}

                    {type === 'image' ? (
                        <motion.img
                            src={src}
                            alt="Full screen"
                            className="max-h-[90vh] max-w-[90vw] object-contain cursor-grab active:cursor-grabbing"
                            style={{ scale }}
                            drag
                            dragConstraints={{ left: -500 * scale, right: 500 * scale, top: -500 * scale, bottom: 500 * scale }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <video
                            src={src}
                            controls
                            autoPlay
                            className="max-h-[90vh] max-w-[90vw]"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}

                    {hasNext && (
                        <button
                            className="absolute right-4 z-50 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                            onClick={(e) => { e.stopPropagation(); onNext(); }}
                        >
                            <FaChevronRight size={24} />
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default FullScreenMedia;
