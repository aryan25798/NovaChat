import React from "react";
import { cn } from "../../lib/utils";
import { format } from "date-fns";
import { BsCheckAll, BsCheck } from "react-icons/bs";
import { FaDownload, FaFileAlt, FaPlay } from "react-icons/fa";
import { VideoPlayer } from "../ui/VideoPlayer";
import { downloadMedia } from "../../utils/downloadHelper";
import { Button } from "../ui/Button";
import FullScreenMedia from "../FullScreenMedia";
import { getCachedMedia, cacheMedia } from "../../utils/mediaCache";

const MessageBubble = ({ message, isOwn, onMediaClick }) => {
    const [imgError, setImgError] = React.useState(false);
    const [resolvedUrl, setResolvedUrl] = React.useState(null);

    // Consolidated URL getter
    const mediaUrl = message.imageUrl || message.fileUrl || message.videoUrl || message.audioUrl || message.url || message.mediaUrl;

    // Resolve cached URL
    React.useEffect(() => {
        if (!mediaUrl) return;

        let isMounted = true;
        const resolve = async () => {
            // 1. Check if already cached in IndexedDB
            const cached = await getCachedMedia(mediaUrl);
            if (cached && isMounted) {
                setResolvedUrl(cached);
                return;
            }

            // 2. If not, use the remote URL for now, but trigger a background cache
            if (isMounted) setResolvedUrl(mediaUrl);

            // Background caching (optional, the browser also caches)
            // cacheMedia(mediaUrl); 
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

    const handleMediaClick = (e) => {
        e.stopPropagation();
        if (onMediaClick) onMediaClick(message);
    };

    const shouldHideText = (text) => {
        if (!text) return true;
        return /^\s*(📷|🎥|📎|📹|🎵)?\s*(Photo|Video|File|Audio|Document)\s*$/i.test(text);
    };

    return (
        <div className={cn("relative w-full", hasMedia ? "pb-1" : "")}>
            {/* IMAGE */}
            {displayType === 'image' && (
                <div className="relative rounded-lg overflow-hidden mb-1 min-h-[150px] bg-black/5 dark:bg-black/20 cursor-pointer"
                    onClick={handleMediaClick}>
                    {!imgError && resolvedUrl ? (
                        <img
                            src={resolvedUrl}
                            alt="Shared"
                            className="w-full max-h-[350px] object-cover rounded-lg transition-opacity hover:opacity-95"
                            onError={() => setImgError(true)}
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <div className="w-full h-[150px] flex flex-col items-center justify-center text-gray-500 gap-2">
                            <FaFileAlt size={40} className="opacity-50" />
                            <span className="text-xs">Image not available</span>
                        </div>
                    )}
                </div>
            )}

            {/* VIDEO */}
            {displayType === 'video' && resolvedUrl && (
                <div className="relative rounded-lg overflow-hidden mb-1 min-w-[200px] bg-black/5 dark:bg-black/20 cursor-pointer"
                    onClick={handleMediaClick}>
                    <VideoPlayer
                        src={resolvedUrl}
                        className="max-h-[350px] pointer-events-none" // Overlay handles the click
                        fileName={message.fileName}
                    />
                    {/* Play Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                        <div className="w-12 h-12 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm border border-white/30">
                            <FaPlay className="ml-1" />
                        </div>
                    </div>
                </div>
            )}

            {/* AUDIO */}
            {displayType === 'audio' && mediaUrl && (
                <div className="flex items-center gap-2 min-w-[200px] p-2 bg-black/5 dark:bg-black/10 rounded-lg my-1">
                    <audio controls src={mediaUrl} className="w-full h-8" />
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
