import React from "react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { BsCheckAll, BsCheck } from "react-icons/bs";
import { FaDownload, FaFileAlt, FaPlay } from "react-icons/fa";
import { VideoPlayer } from "../ui/VideoPlayer";
import { downloadMedia } from "../../utils/downloadHelper";
import { Button } from "../ui/Button";
import FullScreenMedia from "../FullScreenMedia";
import { getSyncCachedMedia, getCachedMedia } from "../../utils/mediaCache";
import { motion } from "framer-motion";

const MessageBubble = ({ message, isOwn, onMediaClick, onCancelUpload }) => {
    const [imgError, setImgError] = React.useState(false);

    // Consolidated URL getter
    const mediaUrl = message.imageUrl || message.fileUrl || message.videoUrl || message.audioUrl || message.url || message.mediaUrl;

    // Resolve cached URL
    // CRITICAL: Use synchronous cache check to prevent the "1-tick flash" during re-renders
    const [resolvedUrl, setResolvedUrl] = React.useState(() => getSyncCachedMedia(mediaUrl) || mediaUrl);
    const lastUrlRef = React.useRef(mediaUrl);

    React.useEffect(() => {
        if (!mediaUrl) return;
        setImgError(false);

        // Update local state immediately if URL changed (synchronous sync)
        if (lastUrlRef.current !== mediaUrl) {
            setResolvedUrl(mediaUrl);
            lastUrlRef.current = mediaUrl;
        }

        let isMounted = true;
        const resolve = async () => {
            try {
                // If we already have a blob URL, don't re-resolve same mediaUrl
                if (resolvedUrl?.startsWith('blob:')) return;

                const cached = await getCachedMedia(mediaUrl);
                if (cached && isMounted) {
                    setResolvedUrl(cached);
                    lastUrlRef.current = cached;
                    return;
                }
            } catch (e) {
                console.warn("Cache check failed", e);
            }
        };

        resolve();
        return () => { isMounted = false; };
    }, [mediaUrl]);

    // 🧠 SMART TYPE DETECTION (Memoized)
    const displayType = React.useMemo(() => {
        if (message.type === 'text') return 'text';
        if (message.imageUrl || message.mediaType === 'image') return 'image';
        if (message.videoUrl || message.mediaType === 'video') return 'video';
        if (message.audioUrl || message.mediaType === 'audio') return 'audio';
        if (message.type === 'image' || message.type === 'video' || message.type === 'audio') return message.type;

        const fileType = message.fileType || '';
        const fileName = (message.fileName || '').toLowerCase();
        if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/.test(fileName)) return 'image';
        if (fileType.startsWith('video/') || /\.(mp4|webm|ogg|mov|avi|mkv)$/.test(fileName)) return 'video';
        if (fileType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac)$/.test(fileName)) return 'audio';
        if (message.type === 'file' || mediaUrl) return 'file';
        return 'text';
    }, [message, mediaUrl]);

    const hasMedia = displayType === 'image' || displayType === 'video';
    const isPending = message.status === 'pending' || message.isOptimistic;
    const progress = message.progress || 0;

    const handleMediaClick = (e) => {
        e.stopPropagation();
        if (isPending) return; // Don't open full screen while uploading
        if (onMediaClick) onMediaClick(message);
    };

    const shouldHideText = (text) => {
        if (!text) return true;
        return /^\s*(📷|🎥|📎|📹|🎵)?\s*(Photo|Video|File|Audio|Document)\s*$/i.test(text);
    };

    const ProgressCircle = ({ value, status, onCancel }) => (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] transition-all duration-300 group/cancel">
            <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90 scale-90">
                    <circle
                        cx="28" cy="28" r="24"
                        fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3"
                    />
                    <motion.circle
                        cx="28" cy="28" r="24"
                        fill="none" stroke="white" strokeWidth="3"
                        strokeDasharray="151"
                        initial={{ strokeDashoffset: 151 }}
                        animate={{ strokeDashoffset: 151 - (151 * (status === 'compressing' ? 5 : value) / 100) }}
                        transition={{ type: "spring", damping: 20, stiffness: 100 }}
                    />
                </svg>

                {/* Cancel Button Overlay */}
                <button
                    onClick={(e) => { e.stopPropagation(); onCancel(); }}
                    className="z-20 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors text-white"
                >
                    <div className="relative w-3 h-3">
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white rotate-45 -translate-y-1/2 rounded-full"></div>
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white -rotate-45 -translate-y-1/2 rounded-full"></div>
                    </div>
                </button>
            </div>
            <div className="mt-3 text-white font-bold text-[11px] tracking-wide uppercase drop-shadow-md flex flex-col items-center gap-1">
                <span>{status === 'compressing' ? 'Compressing...' : `${Math.round(value)}%`}</span>
                {status === 'uploading' && <span className="text-[9px] opacity-70 font-medium">Uploading...</span>}
            </div>
        </div>
    );

    return (
        <div className={cn("relative w-full", hasMedia ? "pb-1" : "")}>
            {/* IMAGE */}
            {displayType === 'image' && (
                <div
                    className="relative rounded-lg overflow-hidden mb-1 bg-black/5 dark:bg-black/20 cursor-pointer group"
                    style={{
                        aspectRatio: (message.width && message.height) ? `${message.width} / ${message.height}` : 'auto',
                        minHeight: (message.width && message.height) ? 'auto' : '150px',
                        maxHeight: '350px',
                        width: (message.width && message.height) && (message.width < message.height) ? 'fit-content' : '100%'
                    }}
                    onClick={handleMediaClick}
                >
                    {/* Shimmer / Skeleton Background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer"
                        style={{ backgroundSize: '200% 100%' }} />

                    {isPending && (
                        <ProgressCircle
                            value={progress}
                            status={message.uploadStatus}
                            onCancel={() => onCancelUpload?.(message.id)}
                        />
                    )}

                    {!imgError && resolvedUrl ? (
                        <img
                            src={resolvedUrl}
                            alt="Shared"
                            className={cn(
                                "w-full h-full object-cover rounded-lg transition-all duration-300",
                                isPending ? "blur-[2px] opacity-70" : "hover:opacity-95",
                                // Only show after it actually loads to prevent partial render flash
                                !resolvedUrl ? "opacity-0" : "opacity-100"
                            )}
                            onError={() => setImgError(true)}
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="w-full h-full min-h-[150px] flex flex-col items-center justify-center text-gray-500 gap-2">
                            <FaFileAlt size={40} className="opacity-50" />
                            <span className="text-xs">Image not available</span>
                        </div>
                    )}
                </div>
            )}

            {/* VIDEO */}
            {displayType === 'video' && resolvedUrl && (
                <div
                    className="relative rounded-lg overflow-hidden mb-1 bg-black/5 dark:bg-black/20 cursor-pointer group"
                    style={{
                        aspectRatio: (message.width && message.height) ? `${message.width} / ${message.height}` : 'auto',
                        minWidth: '200px',
                        maxHeight: '350px'
                    }}
                    onClick={handleMediaClick}
                >
                    {isPending && (
                        <ProgressCircle
                            value={progress}
                            status={message.uploadStatus}
                            onCancel={() => onCancelUpload?.(message.id)}
                        />
                    )}

                    <VideoPlayer
                        src={resolvedUrl}
                        className={cn(
                            "w-full h-full transition-all",
                            isPending ? "blur-[2px] opacity-70 pointer-events-none" : ""
                        )}
                        fileName={message.fileName}
                    />
                    {/* Play Overlay */}
                    {!isPending && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                            <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm border border-white/30 group-hover:scale-110 transition-transform">
                                <FaPlay className="ml-1" />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* AUDIO */}
            {displayType === 'audio' && (mediaUrl || resolvedUrl) && (
                <div className="flex items-center gap-2 min-w-[200px] p-2 bg-black/5 dark:bg-black/10 rounded-lg my-1">
                    <audio controls src={resolvedUrl || mediaUrl} className="w-full h-8" />
                </div>
            )}

            {/* GENERIC FILE */}
            {displayType === 'file' && (
                <div className="flex items-center gap-3 p-2.5 min-w-[220px] max-w-[300px] bg-black/5 dark:bg-black/20 rounded-lg border border-black/5 mx-0.5 my-1 cursor-pointer hover:bg-black/10 transition-colors"
                    onClick={() => downloadMedia(mediaUrl, message.fileName || "File")}>
                    <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
                        <FaFileAlt size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-gray-800 dark:text-gray-100">
                            {message.fileName || "Document"}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                            {message.fileType?.split('/')[1] || 'FILE'} • {message.fileSize ? `${(message.fileSize / 1024).toFixed(0)} KB` : ''}
                        </p>
                    </div>
                </div>
            )}

            {/* TEXT CAPTION / CONTENT */}
            {message.text && !shouldHideText(message.text) && (
                <p className={cn(
                    "text-gray-900 dark:text-[#e9edef] leading-[19px] break-words whitespace-pre-wrap px-1 pt-0.5",
                    hasMedia ? "mt-1" : ""
                )}>
                    {message.text}
                </p>
            )}
        </div>
    );
};

export default React.memo(MessageBubble);
