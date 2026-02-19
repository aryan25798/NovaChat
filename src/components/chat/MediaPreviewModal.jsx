import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaPaperPlane, FaFileAlt } from 'react-icons/fa';
import { Button } from '../ui/Button';

export default function MediaPreviewModal({ file, onSend, onClose }) {
    const [caption, setCaption] = useState("");
    const [objectUrl, setObjectUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(true);
    const [dimensions, setDimensions] = useState(null);

    const isImage = file?.type?.startsWith('image/');
    const isVideo = file?.type?.startsWith('video/');

    useEffect(() => {
        if (!file || !(file instanceof Blob || file instanceof File)) {
            console.error("Invalid file passed to MediaPreviewModal:", file);
            return;
        }

        const url = URL.createObjectURL(file);
        setObjectUrl(url);
        setPreviewLoading(true);

        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [file]);

    const handleSend = () => {
        if (!file) return;
        // Attach dimensions to file object (hacky but effective without changing prop signature too much)
        if (dimensions) {
            file.width = dimensions.width;
            file.height = dimensions.height;
        }
        onSend(file, caption);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-[#0b141a] flex flex-col items-center justify-center p-4 md:p-8 backdrop-blur-md"
            >
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent z-10">
                    <button
                        onClick={onClose}
                        className="text-white/80 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    >
                        <FaTimes size={22} />
                    </button>
                    <div className="text-white font-medium text-sm md:text-base opacity-90">
                        {isImage ? 'Preview Photo' : isVideo ? 'Preview Video' : 'Preview File'}
                    </div>
                    <div className="w-10"></div> {/* Spacer */}
                </div>

                {/* Preview Content */}
                <div className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden relative">
                    {previewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    )}

                    {isImage && objectUrl && (
                        <motion.img
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            src={objectUrl}
                            alt="Preview"
                            className={`max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${previewLoading ? "opacity-0" : "opacity-100"}`}
                            onLoad={(e) => {
                                setPreviewLoading(false);
                                setDimensions({ width: e.target.naturalWidth, height: e.target.naturalHeight });
                            }}
                        />
                    )}

                    {isVideo && objectUrl && (
                        <motion.video
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            src={objectUrl}
                            controls
                            autoPlay
                            className={`max-h-full max-w-full rounded-lg shadow-2xl transition-opacity duration-300 ${previewLoading ? "opacity-0" : "opacity-100"}`}
                            onLoadedData={(e) => {
                                setPreviewLoading(false);
                                setDimensions({ width: e.target.videoWidth, height: e.target.videoHeight });
                            }}
                        />
                    )}

                    {!isImage && !isVideo && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="bg-[#202c33] p-10 rounded-2xl flex flex-col items-center gap-6 shadow-2xl border border-white/5 w-full max-w-sm"
                        >
                            <div className="w-20 h-20 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                                <FaFileAlt size={40} />
                            </div>
                            <div className="text-center w-full">
                                <p className="text-[#e9edef] text-lg font-semibold mb-1 truncate px-4">{file.name}</p>
                                <p className="text-[#8696a0] text-sm">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="w-full max-w-2xl flex flex-col gap-4 mt-4 pb-4 md:pb-8">
                    <div className="relative group mx-2">
                        <input
                            type="text"
                            placeholder="Add a caption..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            className="w-full bg-[#2a3942] border-none rounded-xl px-5 py-3.5 text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all text-[15px] shadow-lg"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                    </div>

                    <div className="flex justify-end items-center px-2">
                        <Button
                            onClick={handleSend}
                            className="rounded-full w-14 h-14 p-0 shadow-xl flex items-center justify-center bg-primary hover:bg-[#00a884] active:scale-95 transition-all"
                        >
                            <FaPaperPlane size={20} className="ml-0.5 text-white" />
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
