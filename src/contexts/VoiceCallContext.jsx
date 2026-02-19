import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { soundService } from '../services/SoundService';
import {
    createCallDoc,
    updateCallStatus,
    addCandidate,
    subscribeToCall,
    subscribeToIncomingCalls,
    subscribeToCandidates,
    setLocalDescription,
    cleanupSignaling,
    waitForOffer
} from '../services/callService';
import { getIceServers } from './CallContext';
import VoiceCallOverlay from '../components/VoiceCallOverlay';

const VoiceCallContext = createContext();

export const useVoiceCall = () => useContext(VoiceCallContext);

export const VoiceCallProvider = ({ children }) => {
    const { currentUser } = useAuth();
    const [callState, setCallState] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [networkQuality, setNetworkQuality] = useState('good');

    const pc = useRef(null);
    const stream = useRef(null);
    const activeRemoteStreamRef = useRef(null);
    const [activeRemoteStream, setActiveRemoteStream] = useState(null);

    const listeners = useRef([]);
    const iceBuffer = useRef([]);
    const isRestarting = useRef(false);
    const processingAnswer = useRef(false);
    const statsInterval = useRef(null);
    const timeoutRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);

    // Audio Routing Handle (Speaker vs Earpiece)
    // Note: setSinkId is not supported on all browsers (mostly Chrome/Edge)
    useEffect(() => {
        const audioElements = document.querySelectorAll('audio.remote-audio-v9');
        audioElements.forEach(el => {
            if (el.setSinkId) {
                // This is a placeholder since we don't have device IDs here, 
                // but in a production mobile-wrapped app, we'd use native bridges.
                // For web, we can't easily force "earpiece" vs "speaker" without user selecting output device.
                // However, we can simulate the UI/State logic.
            }
        });
    }, [isSpeakerOn]);

    // 1. Listen for Incoming Voice Calls
    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToIncomingCalls(currentUser.uid, (callId, data) => {
            if (data.type === 'voice' && !callState) {
                soundService.play('ringtone', true);
                setCallState({
                    id: callId,
                    otherUser: {
                        uid: data.callerId,
                        displayName: data.callerName,
                        photoURL: data.callerPhoto
                    },
                    type: 'voice',
                    isIncoming: true,
                    status: 'ringing',
                    connectionState: 'new',
                    chatId: data.chatId
                });

                // SYNC FIX: Start a status listener immediately for incoming ringing
                const unsubStatus = subscribeToCall(callId, (update) => {
                    if (update?.status === 'ended' || update?.status === 'rejected') {
                        console.log("[VoiceCall] Incoming call canceled by caller.");
                        endCall(false);
                    }
                });
                listeners.current.push(unsubStatus);
            }
        });

        return unsubscribe;
    }, [currentUser, callState]);

    // 1.5 Session Pickup & Cleanup
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (callState) endCall(true);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [callState]);

    const initPeerConnection = async (callId, isCaller) => {
        // Cleanup
        if (stream.current) {
            stream.current.getTracks().forEach(t => t.stop());
        }

        try {
            // WHATSAPP OPTIMIZED AUDIO CONSTRAINTS
            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1, // Voice doesn't need stereo, saves bandwidth
                    sampleRate: 48000
                },
                video: false
            });
            stream.current = localStream;
        } catch (err) {
            console.error("Voice access failed:", err);
            alert("Microphone permission is required for voice calls.");
            return null;
        }

        const iceServers = await getIceServers();
        const peer = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10,
        });

        pc.current = peer;

        stream.current.getTracks().forEach(track => {
            peer.addTrack(track, stream.current);
        });

        peer.ontrack = (event) => {
            console.log("[VoiceCall] Remote track received");

            // ULTRA LOW LATENCY: Request immediate playout (no buffering)
            if (event.receiver && event.receiver.playoutDelayHint !== undefined) {
                event.receiver.playoutDelayHint = 0;
            }

            setActiveRemoteStream(event.streams[0]);
            activeRemoteStreamRef.current = event.streams[0];
        };

        peer.onicecandidate = (e) => {
            if (e.candidate) {
                addCandidate(callId, isCaller ? 'caller' : 'callee', e.candidate);
            }
        };

        peer.oniceconnectionstatechange = () => {
            const state = peer.iceConnectionState;
            setCallState(prev => prev ? { ...prev, connectionState: state } : null);

            if (state === 'failed' || state === 'disconnected') {
                if (isCaller && !isRestarting.current) {
                    triggerIceRestart();
                }

                if (!reconnectTimeoutRef.current) {
                    reconnectTimeoutRef.current = setTimeout(() => {
                        if (pc.current && (pc.current.iceConnectionState === 'failed' || pc.current.iceConnectionState === 'disconnected')) {
                            console.log("[VoiceCall] Reconnection failed after 30s.");
                            endCall(true);
                        }
                    }, 30000);
                }
            } else if (state === 'connected') {
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
            }
        };

        return peer;
    };

    const triggerIceRestart = async () => {
        if (!pc.current || isRestarting.current) return;
        isRestarting.current = true;
        try {
            const offer = await pc.current.createOffer({ iceRestart: true });
            await pc.current.setLocalDescription(offer);
            await setLocalDescription(callState.id, offer, 'offer');
        } catch (e) {
            console.error("Voice ICE Restart failed:", e);
        } finally {
            isRestarting.current = false;
        }
    };

    const startCall = async (otherUser, chatId = null) => {
        if (callState) return;

        try {
            await soundService.ensureAudioContext();
            soundService.play('dialing', true);

            const callId = await createCallDoc(currentUser, otherUser, 'voice', chatId);
            setCallState({
                id: callId,
                otherUser,
                type: 'voice',
                status: 'dialing',
                isIncoming: false,
                connectionState: 'new',
                startTime: Date.now(),
                chatId
            });

            const peer = await initPeerConnection(callId, true);
            if (!peer) {
                endCall(false);
                return;
            }

            // Start Timeout (45s)
            timeoutRef.current = setTimeout(() => {
                if (callState?.status === 'dialing' || callState?.status === 'ringing') {
                    console.log("[VoiceCall] Call timeout reached.");
                    endCall(true);
                }
            }, 45000);

            const offer = await peer.createOffer({ offerToReceiveAudio: true });

            // ULTRA LOW LATENCY & HD VOICE: Opus Optimization
            // usedtx=1: Discontinuous transmission (saves battery/data)
            // minptime=10: Reduces packetization delay
            // useinbandfec=1: Forward Error Correction for robustness
            offer.sdp = offer.sdp.replace('useinbandfec=1', 'useinbandfec=1;usedtx=1;minptime=10;maxaveragebitrate=64000');

            await peer.setLocalDescription(offer);
            await setLocalDescription(callId, offer, 'offer');

            const unsubCall = subscribeToCall(callId, async (data) => {
                if (data?.status === 'ringing' && callState?.status !== 'ringing') {
                    setCallState(prev => prev ? { ...prev, status: 'ringing' } : null);
                }
                if (data?.answer) {
                    // RACE CONDITION FIX: Strict Lock & State Check
                    if (peer.signalingState === 'stable' || processingAnswer.current) {
                        return;
                    }

                    processingAnswer.current = true; // LOCK
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);

                    try {
                        if (peer.signalingState === 'have-local-offer') {
                            soundService.stop();
                            console.log("[VoiceCall] Answer received, setting remote description");
                            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
                            setCallState(prev => prev ? { ...prev, status: 'connected', startTime: Date.now() } : null);
                            // Process iceBuffer
                            iceBuffer.current.forEach(c => peer.addIceCandidate(new RTCIceCandidate(c)));
                            iceBuffer.current = [];
                        }
                    } catch (err) {
                        console.error("[VoiceCall] Error setting remote description:", err);
                    } finally {
                        processingAnswer.current = false; // UNLOCK
                    }
                }
                if (data?.status === 'ended' || data?.status === 'rejected') endCall(false);
            });

            const unsubCandidates = subscribeToCandidates(callId, 'caller', (candidate) => {
                if (peer.remoteDescription) peer.addIceCandidate(new RTCIceCandidate(candidate));
                else iceBuffer.current.push(candidate);
            });

            listeners.current.push(unsubCall, unsubCandidates);
        } catch (e) {
            console.error("Start voice call failed:", e);
            endCall(false);
        }
    };

    const answerCall = async () => {
        if (!callState) return;
        try {
            await soundService.ensureAudioContext();
            soundService.stop();

            const peer = await initPeerConnection(callState.id, false);
            const offer = await waitForOffer(callState.id);

            await peer.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await setLocalDescription(callState.id, answer, 'answer');
            await updateCallStatus(callState.id, 'connected');

            setCallState(prev => ({ ...prev, status: 'connected', startTime: Date.now() }));

            const unsubCall = subscribeToCall(callState.id, (data) => {
                if (data?.status === 'ended' || data?.status === 'rejected') endCall(false);
            });

            const unsubCandidates = subscribeToCandidates(callState.id, 'callee', (candidate) => {
                if (peer.remoteDescription) peer.addIceCandidate(new RTCIceCandidate(candidate));
                else iceBuffer.current.push(candidate);
            });

            listeners.current.push(unsubCall, unsubCandidates);
        } catch (e) {
            console.error("Answer voice call failed:", e);
            endCall(false);
        }
    };

    const endCall = (notifyRemote = true) => {
        soundService.stop();
        if (callState) soundService.play('end');

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

        if (stream.current) {
            stream.current.getTracks().forEach(t => t.stop());
            stream.current = null;
        }

        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }

        listeners.current.forEach(unsub => unsub());
        listeners.current = [];

        if (notifyRemote && callState?.id) {
            updateCallStatus(callState.id, 'ended');
            cleanupSignaling(callState.id);
        }

        setCallState(null);
        setIsMuted(false);
        setIsSpeakerOn(false);
    };

    const toggleMute = () => {
        if (stream.current) {
            const audioTrack = stream.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = isMuted;
                setIsMuted(!isMuted);
            }
        }
    };

    const toggleSpeaker = () => {
        setIsSpeakerOn(!isSpeakerOn);
        // Logic for speaker switching goes here (device specific)
    };

    const value = {
        callState,
        isMuted,
        isSpeakerOn,
        activeRemoteStream,
        networkQuality,
        startCall,
        answerCall,
        endCall,
        toggleMute,
        toggleSpeaker
    };

    return (
        <VoiceCallContext.Provider value={value}>
            {children}
            {callState && (
                <VoiceCallOverlay
                    callState={callState}
                    onEnd={() => endCall(true)}
                    onAnswer={answerCall}
                    onToggleMute={toggleMute}
                    onToggleSpeaker={toggleSpeaker}
                    isMuted={isMuted}
                    isSpeakerOn={isSpeakerOn}
                    activeRemoteStream={activeRemoteStream}
                />
            )}
        </VoiceCallContext.Provider>
    );
};
