import React, { useState, useEffect } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhoneSlash, FaExpand, FaClock } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

export default function ActiveCall({
    callState,
    localVideoRef,
    remoteVideoRef,
    onEnd,
    onToggleMute,
    onToggleVideo,
    isMuted,
    isVideoEnabled
}) {
    const [duration, setDuration] = useState(0);
    const { otherUser, connectionState } = callState;

    useEffect(() => {
        let interval;
        if (callState.status === 'connected') {
            interval = setInterval(() => setDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [callState.status]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            className="active-call-v9"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="remote-video-wrap-v9">
                <video ref={remoteVideoRef} autoPlay playsInline className="remote-video-v9" />

                {connectionState === 'disconnected' && (
                    <div className="reconnect-overlay-v9">
                        <div className="spinner-v9"></div>
                        <p>Reconnecting...</p>
                    </div>
                )}

                <div className="call-header-v9">
                    <div className="header-info-v9">
                        <span className="secure-tag-v9"><FaClock /> END-TO-END ENCRYPTED</span>
                        <h2 className="user-name-v9">{otherUser.displayName}</h2>
                        <span className="call-status-label-v9">Connected</span>
                        <span className="duration-v9">{formatTime(duration)}</span>
                    </div>
                </div>
            </div>

            <motion.div
                className="local-video-pip-v9"
                drag
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} // Simple floating
            >
                <video ref={localVideoRef} autoPlay playsInline muted className="local-video-v9" />
                {!isVideoEnabled && (
                    <div className="video-off-ui-v9">
                        <img src={callState.myPhoto} alt="Me" />
                    </div>
                )}
            </motion.div>

            <div className="call-controls-v9">
                <div className="controls-bg-v9">
                    <button
                        className={`control-btn-v9 ${isMuted ? 'off-v9' : ''}`}
                        onClick={onToggleMute}
                    >
                        {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                    </button>

                    <button className="control-btn-v9 end-v9" onClick={onEnd}>
                        <FaPhoneSlash />
                    </button>

                    <button
                        className={`control-btn-v9 ${!isVideoEnabled ? 'off-v9' : ''}`}
                        onClick={onToggleVideo}
                    >
                        {isVideoEnabled ? <FaVideo /> : <FaVideoSlash />}
                    </button>
                </div>
            </div>

            <style>{`
                .active-call-v9 {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #000; z-index: 99999;
                    display: flex; flex-direction: column;
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                }

                .remote-video-wrap-v9 { flex: 1; position: relative; overflow: hidden; }
                .remote-video-v9 { width: 100%; height: 100%; object-fit: cover; }

                .call-header-v9 {
                    position: absolute; top: 0; left: 0; right: 0;
                    padding: 40px 20px;
                    background: linear-gradient(rgba(0,0,0,0.6), transparent);
                    display: flex; justify-content: center; text-align: center;
                }

                .header-info-v9 { display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; }
                .secure-tag-v9 { font-size: 10px; color: rgba(255,255,255,0.6); display: flex; align-items: center; gap: 5px; }
                .user-name-v9 { font-size: 24px; font-weight: 400; margin: 8px 0 2px; }
                .call-status-label-v9 { font-size: 13px; color: #25d366; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
                .duration-v9 { font-size: 15px; color: rgba(255,255,255,0.8); }

                .local-video-pip-v9 {
                    position: absolute; top: 120px; right: 20px;
                    width: 100px; height: 140px;
                    background: #1c2327; border-radius: 12px;
                    overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                    z-index: 100000; cursor: move;
                }
                .local-video-v9 { width: 100%; height: 100%; object-fit: cover; }
                .video-off-ui-v9 { 
                    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                    display: flex; align-items: center; justify-content: center;
                    background: #1c2327;
                }
                .video-off-ui-v9 img { width: 40px; height: 40px; border-radius: 50%; }

                .call-controls-v9 {
                    position: absolute; bottom: 40px; left: 0; right: 0;
                    display: flex; justify-content: center;
                    padding: 0 20px;
                }

                .controls-bg-v9 {
                    background: rgba(30, 36, 40, 0.95);
                    backdrop-filter: blur(10px);
                    padding: 15px 30px;
                    border-radius: 40px;
                    display: flex; gap: 30px; align-items: center;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }

                .control-btn-v9 {
                    width: 52px; height: 52px; border-radius: 50%; border: none;
                    background: none; color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 20px; cursor: pointer; transition: all 0.2s;
                }
                .control-btn-v9:hover { background: rgba(255,255,255,0.1); }
                .control-btn-v9.off-v9 { color: #8696a0; }
                .control-btn-v9.end-v9 { background: #f15c6d; font-size: 22px; width: 60px; height: 60px; }
                .control-btn-v9.end-v9:hover { background: #d94452; }

                .spinner-v9 {
                    width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2);
                    border-top: 3px solid white; border-radius: 50%;
                    animation: spin-v9 1s linear infinite; margin-bottom: 15px;
                }
                @keyframes spin-v9 { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .reconnect-overlay-v9 {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    color: white; z-index: 100;
                }
            `}</style>
        </motion.div>
    );
}
