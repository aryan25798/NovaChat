import React, { useState, useEffect } from 'react';
import { useAuth } from "../../contexts/AuthContext";
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhoneSlash, FaExpand, FaClock } from 'react-icons/fa';
import { FaCameraRotate } from 'react-icons/fa6';
import { motion, AnimatePresence } from 'framer-motion';

const NetworkSignal = ({ quality }) => {
    const bars = quality === 'good' ? 4 : quality === 'fair' ? 2 : 1;
    const color = quality === 'good' ? '#25d366' : quality === 'fair' ? '#f1c40f' : '#e74c3c';

    return (
        <div className="signal-bars-v9">
            {[1, 2, 3, 4].map(i => (
                <div
                    key={i}
                    className="bar-v9"
                    style={{
                        height: `${i * 3 + 2}px`,
                        backgroundColor: i <= bars ? color : 'rgba(255,255,255,0.2)'
                    }}
                />
            ))}
            <style>{`
                .signal-bars-v9 { display: flex; align-items: flex-end; gap: 2px; margin-left: 8px; margin-bottom: 2px; }
                .bar-v9 { width: 3px; border-radius: 1px; }
            `}</style>
        </div>
    );
};

export default function ActiveCall({
    callState,
    localVideoRef,
    remoteVideoRef,
    onEnd,
    onToggleMute,
    onToggleVideo,
    onSwitchCamera, // NEW PROP
    isMuted,
    isVideoEnabled,
    activeLocalStream, // NEW PROP
    activeRemoteStream, // NEW PROP
    networkQuality // NEW PROP
}) {
    const { currentUser } = useAuth();
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true); // NEW STATE
    const { otherUser, connectionState } = callState;

    // FIX: Force attach remote stream when component mounts or stream changes
    // FIX: Force attach remote stream when component mounts or stream changes
    useEffect(() => {
        if (remoteVideoRef.current && activeRemoteStream) {
            // Guard: Only attach if different to prevent AbortError/Flicker
            if (remoteVideoRef.current.srcObject !== activeRemoteStream) {
                console.log("[ActiveCall] Attaching remote stream from prop");
                remoteVideoRef.current.srcObject = activeRemoteStream;
                remoteVideoRef.current.play().catch(e => {
                    if (e.name !== 'AbortError') console.warn("Remote video play error:", e);
                });
            }
        }
    }, [activeRemoteStream]);

    // FIX: Force attach local stream when component mounts or stream changes
    // FIX: Force attach local stream when component mounts or stream changes
    useEffect(() => {
        if (localVideoRef.current && activeLocalStream) {
            // Guard: Only attach if different
            if (localVideoRef.current.srcObject !== activeLocalStream) {
                console.log("[ActiveCall] Attaching local stream from prop");
                localVideoRef.current.srcObject = activeLocalStream;
                localVideoRef.current.play().catch(e => {
                    if (e.name !== 'AbortError') console.warn("Local video play error:", e);
                });
            }
        }
    }, [activeLocalStream]);

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
            {/* Transparent overlay to catch clicks if video eats them (Z-Index 10) */}
            <div
                className="click-layer-v9"
                onClick={() => setShowControls(p => !p)}
            />

            <div className="remote-video-wrap-v9">
                <video ref={remoteVideoRef} autoPlay playsInline className="remote-video-v9" style={{ pointerEvents: 'none' }} />

                <AnimatePresence>
                    {(connectionState === 'disconnected' || connectionState === 'failed') && (
                        <motion.div
                            className="reconnect-overlay-v9"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="spinner-v9"></div>
                            <p className="reconnect-text-v9">
                                {connectionState === 'failed' ? 'Connection lost, trying again...' : 'Reconnecting...'}
                            </p>
                            <button className="reconnect-end-btn-v9" onClick={onEnd}>
                                End Call
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showControls && (
                        <motion.div
                            className="call-header-v9"
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            onClick={(e) => e.stopPropagation()} // Prevent toggle
                        >
                            <div className="header-info-v9">
                                <span className="secure-tag-v9"><FaClock /> END-TO-END ENCRYPTED</span>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <h2 className="user-name-v9">{otherUser.displayName}</h2>
                                    {networkQuality && <NetworkSignal quality={networkQuality} />}
                                </div>
                                <span className="call-status-label-v9">Connected</span>
                                {networkQuality === 'poor' && (
                                    <span className="poor-connection-v9">Poor Connection</span>
                                )}
                                <span className="duration-v9">{formatTime(duration)}</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {showControls && (
                    <motion.div
                        className="local-video-pip-v9"
                        drag
                        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <video ref={localVideoRef} autoPlay playsInline muted className="local-video-v9" />
                        {!isVideoEnabled && (
                            <div className="video-off-ui-v9">
                                <img src={currentUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid}`} alt="Me" />
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showControls && (
                    <motion.div
                        className="call-controls-v9"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()} // Prevent toggle
                    >
                        <div className="controls-bg-v9">
                            <button
                                className={`control-btn-v9 ${isMuted ? 'off-v9' : ''}`}
                                onClick={onToggleMute}
                            >
                                {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                            </button>

                            <button
                                className="control-btn-v9"
                                onClick={onSwitchCamera}
                                title="Switch Camera"
                            >
                                <FaCameraRotate />
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
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .active-call-v9 {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #000; z-index: 99999;
                    display: flex; flex-direction: column;
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                }
                
                .click-layer-v9 {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 10; /* Above video, below controls */
                }

                .remote-video-wrap-v9 { flex: 1; position: relative; overflow: hidden; z-index: 0; }
                .remote-video-v9 { width: 100%; height: 100%; object-fit: cover; }

                .call-header-v9 {
                    position: absolute; top: 0; left: 0; right: 0;
                    padding: 40px 20px;
                    background: linear-gradient(rgba(0,0,0,0.6), transparent);
                    display: flex; justify-content: center; text-align: center;
                    z-index: 20; /* High Z-Index */
                }

                .header-info-v9 { display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; pointer-events: auto; }
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
                    z-index: 25; /* Highest Z-Index */
                    cursor: move;
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
                    z-index: 20; /* High Z-Index */
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
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(8px);
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    color: white; z-index: 100;
                }
                .reconnect-text-v9 {
                    font-size: 16px; font-weight: 500; color: rgba(255,255,255,0.9);
                    margin-top: 10px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    margin-bottom: 20px;
                }
                .reconnect-end-btn-v9 {
                    background: #f15c6d; color: white; border: none;
                    padding: 8px 16px; border-radius: 20px;
                    font-weight: 600; cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    transition: background 0.2s;
                    z-index: 101; /* Ensure clickable */
                }
                .reconnect-end-btn-v9:hover { background: #d94452; }

                .poor-connection-v9 { 
                    font-size: 12px; color: #f1c40f; 
                    background: rgba(0,0,0,0.6); padding: 4px 10px; 
                    border-radius: 12px; margin: 4px 0; 
                    font-weight: 500;
                }
            `}</style>
        </motion.div >
    );
}
