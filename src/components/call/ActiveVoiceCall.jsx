import React, { useState, useEffect } from 'react';
import { useAuth } from "../../contexts/AuthContext";
import { FaMicrophone, FaMicrophoneSlash, FaPhoneSlash, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

export default function ActiveVoiceCall({
    callState,
    onEnd,
    onToggleMute,
    onToggleSpeaker,
    isMuted,
    isSpeakerOn,
    activeRemoteStream
}) {
    const { currentUser } = useAuth();
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
            className="active-voice-call-v10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="voice-header-v10">
                <span className="secure-tag-v10">END-TO-END ENCRYPTED</span>
                <h2 className="user-name-v10">{otherUser.displayName}</h2>
                <span className="duration-v10">{formatTime(duration)}</span>
            </div>

            <div className="voice-avatar-v10">
                <div className="avatar-ripple-v10">
                    <img
                        src={otherUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.uid}`}
                        alt={otherUser.displayName}
                    />
                </div>
            </div>

            <div className="voice-footer-v10">
                <div className="connection-status-v10">
                    {connectionState === 'reconnecting' ? 'Reconnecting...' : 'Voice Call'}
                </div>

                <div className="voice-controls-v10">
                    <button
                        className={`voice-btn-v10 ${isSpeakerOn ? 'active-v10' : ''}`}
                        onClick={onToggleSpeaker}
                    >
                        {isSpeakerOn ? <FaVolumeUp /> : <FaVolumeMute />}
                    </button>

                    <button
                        className={`voice-btn-v10 ${isMuted ? 'active-v10' : ''}`}
                        onClick={onToggleMute}
                    >
                        {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                    </button>

                    <button className="voice-btn-v10 end-v10" onClick={onEnd}>
                        <FaPhoneSlash />
                    </button>
                </div>
            </div>

            {/* Hidden audio element for remote stream */}
            {activeRemoteStream && (
                <audio
                    autoPlay
                    ref={el => { if (el) el.srcObject = activeRemoteStream }}
                    className="remote-audio-v9 hidden"
                />
            )}

            <style>{`
                .active-voice-call-v10 {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #111b21; z-index: 99999;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: space-between;
                    padding: 60px 20px; color: white;
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                }

                .voice-header-v10 { text-align: center; }
                .secure-tag-v10 { font-size: 10px; color: #8696a0; letter-spacing: 1px; }
                .user-name-v10 { font-size: 32px; font-weight: 300; margin: 10px 0 5px; }
                .duration-v10 { font-size: 16px; color: #8696a0; }

                .voice-avatar-v10 { 
                    flex: 1; display: flex; align-items: center; justify-content: center;
                }
                .avatar-ripple-v10 {
                    width: 180px; height: 180px; border-radius: 50%;
                    overflow: hidden; border: 4px solid rgba(255,255,255,0.05);
                    box-shadow: 0 0 0 20px rgba(255,255,255,0.02);
                }
                .avatar-ripple-v10 img { width: 100%; height: 100%; object-fit: cover; }

                .voice-footer-v10 { width: 100%; text-align: center; }
                .connection-status-v10 { font-size: 14px; color: #8696a0; margin-bottom: 40px; }

                .voice-controls-v10 {
                    display: flex; gap: 40px; justify-content: center; align-items: center;
                    background: rgba(30, 36, 40, 0.9);
                    padding: 20px 40px; border-radius: 50px;
                    backdrop-filter: blur(10px);
                }
                .voice-btn-v10 {
                    width: 50px; height: 50px; border-radius: 50%; border: none;
                    background: none; color: white; font-size: 20px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .voice-btn-v10.active-v10 { background: white; color: black; }
                .voice-btn-v10.end-v10 { background: #f15c6d; width: 60px; height: 60px; font-size: 24px; }
                .voice-btn-v10.end-v10:hover { background: #d94452; }
                
                .hidden { display: none; }
            `}</style>
        </motion.div>
    );
}
