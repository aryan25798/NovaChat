import React, { useState, useRef } from 'react';
import { FaPlay, FaPause, FaExpand, FaDownload } from 'react-icons/fa';
import { cn } from '../../lib/utils';
import { downloadMedia } from '../../utils/downloadHelper';

export const VideoPlayer = ({ src, className, fileName = "video.mp4" }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const videoRef = useRef(null);

    const togglePlay = (e) => {
        e.stopPropagation();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleEnded = () => {
        setIsPlaying(false);
    };

    return (
        <div
            className={cn("relative group/vplayer overflow-hidden rounded-xl", className)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            <video
                ref={videoRef}
                src={src}
                className="w-full h-auto block"
                onClick={togglePlay}
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={handleEnded}
            />

            {/* Play Overlay (Big) */}
            {!isPlaying && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-black/5 cursor-pointer"
                    onClick={togglePlay}
                >
                    <div className="w-14 h-14 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20 transition-transform group-hover/vplayer:scale-110">
                        <FaPlay className="ml-1 text-xl" />
                    </div>
                </div>
            )}

            {/* Controls Bar (WhatsApp style) */}
            <div className={cn(
                "absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex items-center gap-4 transition-opacity duration-300",
                isPlaying && !hover ? "opacity-0" : "opacity-100"
            )}>
                <button
                    onClick={togglePlay}
                    className="text-white hover:scale-110 transition-transform"
                >
                    {isPlaying ? <FaPause /> : <FaPlay />}
                </button>

                <div className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-0" /> {/* Progress bar logic could be added but metadata is enough for now */}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => downloadMedia(src, fileName)}
                        className="text-white/80 hover:text-white transition-colors"
                        title="Download"
                    >
                        <FaDownload size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
