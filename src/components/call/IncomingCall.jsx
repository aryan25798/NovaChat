import React from 'react';
import { FaPhone, FaPhoneSlash, FaCommentAlt, FaClock } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

export default function IncomingCall({ callState, onAnswer, onReject }) {
    const { otherUser } = callState;

    React.useEffect(() => {
        // Vibrate for incoming calls on supported devices
        if (navigator.vibrate) {
            navigator.vibrate([1000, 500, 1000, 500, 1000]);
            const interval = setInterval(() => {
                navigator.vibrate([1000, 500, 1000, 500, 1000]);
            }, 6000);
            return () => {
                clearInterval(interval);
                navigator.vibrate(0);
            };
        }
    }, []);

    return (
        <motion.div
            className="incoming-call-v7"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="call-info-v7">
                <span className="secure-badge-v7">
                    <FaClock style={{ fontSize: '10px' }} /> END-TO-END ENCRYPTED
                </span>

                <div className="avatar-container-v7">
                    <img
                        src={otherUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.uid}`}
                        alt={otherUser.displayName}
                        className="w-24 h-24 rounded-full object-cover border-4 border-white/20"
                    />
                </div>

                <h2 className="caller-name-v7">{otherUser.displayName}</h2>
                <p className="call-status-v7">
                    {callState.status === 'ringing' ? 'WhatsApp video call' : 'Connecting...'}
                </p>
            </div>

            <div className="actions-footer-v7">
                <div className="secondary-actions-v7">
                    <div className="action-item-v7">
                        <button className="small-btn-v7"><FaCommentAlt /></button>
                        <span>Message</span>
                    </div>
                </div>

                <div className="main-actions-v7">
                    <div className="action-pair-v7">
                        <button className="big-btn-v7 decline-v7" onClick={onReject}>
                            <FaPhoneSlash />
                        </button>
                        <span>Decline</span>
                    </div>

                    <div className="action-pair-v7">
                        <motion.button
                            className="big-btn-v7 accept-v7"
                            onClick={onAnswer}
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                            <FaPhone />
                        </motion.button>
                        <span>Accept</span>
                    </div>
                </div>
            </div>

            <style>{`
                .incoming-call-v7 {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #111b21;
                    display: flex; flex-direction: column; justify-content: space-between;
                    padding: 60px 20px 40px;
                    color: white; z-index: 99999;
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                }

                .call-info-v7 {
                    display: flex; flex-direction: column; align-items: center; gap: 20px;
                }

                .secure-badge-v7 {
                    font-size: 11px; color: #8696a0;
                    display: flex; align-items: center; gap: 6px;
                    letter-spacing: 0.5px;
                }

                .avatar-container-v7 {
                    position: relative; width: 140px; height: 140px;
                    margin: 20px 0;
                }

                .avatar-v7 {
                    width: 100%; height: 100%; border-radius: 50%;
                    object-fit: cover; border: 1px solid rgba(255,255,255,0.1);
                }

                .pulse-v7 {
                    box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.4);
                    animation: pulse-ring-v7 2s infinite;
                }

                @keyframes pulse-ring-v7 {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.4); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 30px rgba(37, 211, 102, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
                }

                .caller-name-v7 { font-size: 32px; font-weight: 300; margin: 0; }
                .call-status-v7 { font-size: 16px; color: #8696a0; margin: 0; }

                .actions-footer-v7 { width: 100%; display: flex; flex-direction: column; gap: 40px; }

                .secondary-actions-v7 { display: flex; justify-content: center; }
                .action-item-v7 { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #8696a0; font-size: 12px; }
                .small-btn-v7 {
                    background: none; border: none; color: white;
                    font-size: 16px; cursor: pointer;
                }

                .main-actions-v7 { display: flex; justify-content: space-around; width: 100%; }
                .action-pair-v7 { display: flex; flex-direction: column; align-items: center; gap: 12px; font-size: 13px; color: #8696a0; }

                .big-btn-v7 {
                    width: 68px; height: 68px; border-radius: 50%; border: none;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px; color: white; cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                }

                .decline-v7 { background: #f15c6d; }
                .accept-v7 { background: #1fa855; }
            `}</style>
        </motion.div>
    );
}
