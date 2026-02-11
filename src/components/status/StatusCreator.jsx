import React, { useState, useRef } from 'react';
import { FaTimes, FaPalette, FaSmile, FaPaperPlane, FaImage } from 'react-icons/fa';
import { IoArrowBack, IoText, IoColorPalette } from 'react-icons/io5';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { postStatus } from '../../services/statusService';

const BACKGROUND_COLORS = [
    '#e11d48', // Red
    '#d97706', // Amber
    '#16a34a', // Green
    '#0891b2', // Cyan
    '#2563eb', // Blue
    '#7c3aed', // Violet
    '#c026d3', // Fuchsia
    '#111827', // Gray (Default)
];

const FONTS = [
    'font-sans',
    'font-serif',
    'font-mono',
    'font-[cursive]', // Fallback
];

const StatusCreator = ({ onClose, onSuccess }) => {
    const { currentUser } = useAuth();
    const [mode, setMode] = useState('text'); // 'text' or 'media'
    const [text, setText] = useState('');
    const [bgColor, setBgColor] = useState(BACKGROUND_COLORS[7]);
    const [fontIndex, setFontIndex] = useState(0);
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaPreview, setMediaPreview] = useState(null);
    const [caption, setCaption] = useState('');
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    const handleTextChange = (e) => {
        setText(e.target.value);
    };

    const toggleColor = () => {
        const currentIndex = BACKGROUND_COLORS.indexOf(bgColor);
        const nextIndex = (currentIndex + 1) % BACKGROUND_COLORS.length;
        setBgColor(BACKGROUND_COLORS[nextIndex]);
    };

    const toggleFont = () => {
        setFontIndex((prev) => (prev + 1) % FONTS.length);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setMediaFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setMediaPreview(reader.result);
                setMode('media');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        if (mode === 'text' && !text.trim()) return;
        if (mode === 'media' && !mediaFile) return;

        setLoading(true);
        try {
            if (mode === 'text') {
                await postStatus(currentUser, 'text', text, null, bgColor);
            } else {
                await postStatus(currentUser, mediaFile.type.startsWith('video') ? 'video' : 'image', mediaFile, caption);
            }
            // Auto-dismissal and success feedback
            setTimeout(() => {
                onSuccess();
                onClose();
            }, 500);
        } catch (error) {
            console.error("Failed to post status:", error);
            alert("Failed to post status. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center">
            {/* Header / Controls */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
                <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/10 rounded-full">
                    <FaTimes className="w-6 h-6" />
                </Button>

                {mode === 'text' && (
                    <div className="flex gap-4">
                        <Button variant="ghost" size="icon" onClick={toggleFont} className="text-white hover:bg-white/10 rounded-full" title="Change Font">
                            <IoText className="w-6 h-6" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={toggleColor} className="text-white hover:bg-white/10 rounded-full" title="Change Background">
                            <IoColorPalette className="w-6 h-6" />
                        </Button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 w-full relative flex items-center justify-center" style={{ backgroundColor: mode === 'text' ? bgColor : 'black' }}>
                {mode === 'text' ? (
                    <textarea
                        value={text}
                        onChange={handleTextChange}
                        placeholder="Type a status..."
                        className={`w-full max-w-2xl p-8 bg-transparent text-white text-center text-3xl md:text-5xl border-none outline-none resize-none placeholder:text-white/50 ${FONTS[fontIndex]}`}
                        autoFocus
                        maxLength={700}
                    />
                ) : (
                    <div className="relative w-full h-full flex items-center justify-center">
                        {mediaPreview && (
                            mediaFile?.type.startsWith('video') ? (
                                <video src={mediaPreview} className="max-w-full max-h-full object-contain" controls />
                            ) : (
                                <img src={mediaPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                            )
                        )}
                        {!mediaPreview && (
                            <div className="text-white flex flex-col items-center gap-4">
                                <span className="text-lg">Select media to upload</span>
                                <Button onClick={() => fileInputRef.current?.click()}>Choose File</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer / Input */}
            <div className="w-full bg-black/80 backdrop-blur-md p-4 flex items-center gap-4 z-10 pb-safe">
                {mode === 'media' && (
                    <input
                        type="text"
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a caption..."
                        className="flex-1 bg-white/10 text-white rounded-full px-4 py-3 outline-none focus:bg-white/20 transition-colors"
                    />
                )}

                {/* Media Toggle (only visible in text mode or if cancelling media) */}
                {mode === 'text' && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/80 hover:text-white"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <FaImage className="w-6 h-6" />
                    </Button>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                />

                <Button
                    onClick={handleSubmit}
                    className="ml-auto bg-whatsapp-teal hover:bg-whatsapp-dark text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={loading || (mode === 'text' && !text.trim()) || (mode === 'media' && !mediaFile)}
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <FaPaperPlane className="w-5 h-5 translate-x-0.5 translate-y-0.5" />
                    )}
                </Button>
            </div>
        </div>
    );
};

export default StatusCreator;
