import React from 'react';
import { FaPhoneSlash, FaClock } from 'react-icons/fa';
import { motion } from 'framer-motion';

export default function OutgoingCall({ callState, onEnd }) {
    const { otherUser, type } = callState;

    return (
        <motion.div
            className="outgoing-call-v8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <div className="call-info-v8">
                <span className="secure-badge-v8">
                    <FaClock style={{ fontSize: '10px' }} /> END-TO-END ENCRYPTED
                </span>

                <div className="avatar-container-v8">
                    <img
                        src={otherUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.uid}`}
                        alt={otherUser.displayName}
                        className="w-32 h-32 rounded-full object-cover border-4 border-white/20"
                    />
                </div>

                <h2 className="caller-name-v8">{otherUser.displayName}</h2>
                <p className="call-status-v8">{callState.status === 'ringing' ? 'Ringing' : 'Calling'}</p>
            </div>

            <div className="actions-footer-v8">
                <div className="main-actions-v8">
                    <button className="end-btn-v8" onClick={onEnd} aria-label="End Call">
                        <FaPhoneSlash />
                    </button>
                </div>
                <div className="call-type-label-v8">
                    WhatsApp {type === 'video' ? 'video' : 'audio'} call
                </div>
            </div>

            <style>{`
                .outgoing-call-v8 {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #111b21;
                    display: flex; flex-direction: column; justify-content: space-between;
                    padding: 60px 20px 60px;
                    color: white; z-index: 99999;
                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                }

                .call-info-v8 {
                    display: flex; flex-direction: column; align-items: center; gap: 20px;
                }

                .secure-badge-v8 {
                    font-size: 11px; color: #8696a0;
                    display: flex; align-items: center; gap: 6px;
                    letter-spacing: 0.5px;
                }

                .avatar-container-v8 {
                    width: 140px; height: 140px;
                    margin: 20px 0;
                }

                .avatar-v8 {
                    width: 100%; height: 100%; border-radius: 50%;
                    object-fit: cover; border: 1px solid rgba(255,255,255,0.1);
                }

                .caller-name-v8 { font-size: 32px; font-weight: 300; margin: 0; }
                .call-status-v8 { font-size: 16px; color: #8696a0; margin: 0; }

                .actions-footer-v8 { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 30px; }

                .main-actions-v8 { display: flex; justify-content: center; width: 100%; }

                .end-btn-v8 {
                    width: 68px; height: 68px; border-radius: 50%; border: none;
                    background: #f15c6d; color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px; cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                }
                .end-btn-v8:active { transform: scale(0.9); }

                .call-type-label-v8 { font-size: 13px; color: #8696a0; }
            `}</style>
        </motion.div>
    );
}
