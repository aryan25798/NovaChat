import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPause, FaPlay, FaTimes, FaCheck, FaCloudUploadAlt, FaExclamationTriangle } from 'react-icons/fa';
import { Button } from '../ui/Button';
import { useFileUpload } from '../../contexts/FileUploadContext';

const UploadProgress = () => {
    const { uploads, pauseUpload, resumeUpload, cancelUpload, clearCompleted } = useFileUpload();
    const activeUploads = Object.values(uploads);
    const [minimized, setMinimized] = useState(false);

    // Auto-clear logic for WhatsApp-like behavior
    useEffect(() => {
        const hasActive = activeUploads.some(u => u.status === 'uploading' || u.status === 'compressing' || u.status === 'paused');
        const hasCompleted = activeUploads.some(u => u.status === 'completed');

        if (hasCompleted && !hasActive) {
            const timer = setTimeout(() => {
                clearCompleted();
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [uploads, clearCompleted]);

    if (activeUploads.length === 0) return null;

    const totalProgress = activeUploads.reduce((acc, curr) => acc + curr.progress, 0) / activeUploads.length;
    const uploadingCount = activeUploads.filter(u => u.status === 'uploading').length;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.9 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 w-[90%] md:w-80 bg-surface-elevated border border-border/50 shadow-2xl rounded-2xl overflow-hidden z-[100]"
            >
                {/* Header */}
                <div
                    className="bg-primary/10 px-4 py-3 flex items-center justify-between cursor-pointer"
                    onClick={() => setMinimized(!minimized)}
                >
                    <div className="flex items-center gap-2">
                        <FaCloudUploadAlt className="text-primary" />
                        <span className="text-sm font-bold text-text-1">
                            {uploadingCount} Upload{uploadingCount !== 1 ? 's' : ''} in progress
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-primary">{Math.round(totalProgress)}%</span>
                        <div className={`transition-transform duration-200 ${minimized ? 'rotate-180' : ''}`}>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-2" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Progress Bar (Global) */}
                <div className="h-1 bg-surface w-full">
                    <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${totalProgress}%` }}
                        transition={{ duration: 0.2 }}
                    />
                </div>

                {/* List */}
                <AnimatePresence>
                    {!minimized && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="max-h-60 overflow-y-auto custom-scrollbar"
                        >
                            {activeUploads.map(upload => (
                                <div key={upload.id} className="p-3 border-b border-border/30 last:border-0 hover:bg-surface/50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[13px] font-medium text-text-1 truncate" title={upload.fileName}>
                                                {upload.fileName}
                                            </p>
                                            <p className="text-[11px] text-text-2">
                                                {(upload.fileSize / (1024 * 1024)).toFixed(2)} MB • {upload.status}
                                            </p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            {upload.status === 'uploading' && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={() => pauseUpload(upload.id)}>
                                                    <FaPause className="text-[10px]" />
                                                </Button>
                                            )}
                                            {upload.status === 'paused' && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={() => resumeUpload(upload.id)}>
                                                    <FaPlay className="text-[10px]" />
                                                </Button>
                                            )}
                                            {upload.status === 'error' && (
                                                <FaExclamationTriangle className="text-red-500 text-sm mt-1" title={upload.error} />
                                            )}
                                            {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'error') && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full hover:bg-red-50 hover:text-red-500" onClick={() => cancelUpload(upload.id)}>
                                                    <FaTimes className="text-[10px]" />
                                                </Button>
                                            )}
                                            {upload.status === 'completed' && (
                                                <FaCheck className="text-green-500 text-sm mt-1" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="h-1 bg-surface w-full rounded-full overflow-hidden">
                                        <motion.div
                                            className={`h-full ${upload.status === 'error' ? 'bg-red-500' : upload.status === 'completed' ? 'bg-green-500' : 'bg-primary'}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${upload.progress}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="p-2 flex justify-end">
                                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearCompleted}>
                                    Clear Completed
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
};

export default UploadProgress;
