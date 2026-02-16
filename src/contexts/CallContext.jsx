import React, { useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { db, functions } from "../firebase"; // Still needed for log creation potentially, or move to chatService
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore"; // For logs
import { httpsCallable } from "firebase/functions";
import CallOverlay from "../components/CallOverlay";
import { soundService } from "../services/SoundService";
import {
    createCallDoc,
    updateCallStatus,
    addCandidate,
    subscribeToCall,
    subscribeToIncomingCalls,
    subscribeToCandidates,
    setLocalDescription,
    getCallDoc,
    cleanupSignaling
} from "../services/callService";

const CallContext = React.createContext();

export function useCall() {
    return useContext(CallContext);
}

export const getIceServers = async () => {
    try {
        const getCredentials = httpsCallable(functions, 'getTurnCredentials');
        const result = await getCredentials();
        return result.data;
    } catch (error) {
        console.warn("Failed to fetch TURN credentials (using fallback STUN):", error);
        return [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.metered.ca:80" }
        ];
    }
};

export function CallProvider({ children }) {
    const { currentUser } = useAuth();
    const [callState, setCallState] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);

    const localVideoRef = useRef();
    const remoteVideoRef = useRef();
    const pc = useRef(null);
    const stream = useRef(null);
    const listeners = useRef([]);
    const iceBuffer = useRef([]); // Buffer for candidates received before remoteDescription

    // Cleanup helper
    const clearListeners = () => {
        listeners.current.forEach(unsub => unsub());
        listeners.current = [];
    };

    // 1. Listen for Incoming Calls
    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToIncomingCalls(currentUser.uid, (callId, data) => {
            if (!callState) {
                soundService.play('ringtone', true); // Play Ringtone
                setCallState({
                    id: callId,
                    otherUser: {
                        uid: data.callerId,
                        displayName: data.callerName,
                        photoURL: data.callerPhoto
                    },
                    type: data.type,
                    isIncoming: true,
                    status: 'ringing',
                    connectionState: 'new',
                    chatId: data.chatId
                });
            }
        });

        return unsubscribe;
    }, [currentUser, callState]);

    // 1.5 Calling Timeout (Outgoing)
    const timeoutRef = useRef(null);
    useEffect(() => {
        if (callState?.status === 'ringing' && !callState.isIncoming) {
            // Start 45s timeout for outgoing calls
            timeoutRef.current = setTimeout(() => {
                if (callState.status === 'ringing') {
                    console.log("Call timeout reached. Ending as missed.");
                    endCall(true);
                }
            }, 45000);
        } else if (callState?.status === 'connected') {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [callState?.status, callState?.isIncoming]);

    // 1.8 Window Cleanup
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (callState) {
                // Best effort cleanup
                endCall(true);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [callState]);

    // 2. PeerConnection & Media Setup
    const initPeerConnection = async (callId, isCaller) => {
        // Cleanup existing stream
        if (stream.current) {
            stream.current.getTracks().forEach(t => t.stop());
            stream.current = null;
        }

        // Get media
        let localStream;
        try {
            const constraints = {
                video: {
                    facingMode: 'user', // Preference for front camera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.error("Media permission error:", err);
            let errorMsg = "Could not access camera/microphone. Please check permissions.";
            if (err.name === 'NotAllowedError') errorMsg = "Camera/microphone permission was denied.";
            else if (err.name === 'NotFoundError') errorMsg = "No camera/microphone found on this device.";

            // We use standard alert as fallback, or toast if context is right
            alert(errorMsg);
            endCall(true);
            throw err;
        }

        stream.current = localStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

        const iceServers = await getIceServers();
        const peer = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10
        });
        pc.current = peer;

        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

        peer.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        // Network robustness
        peer.oniceconnectionstatechange = () => {
            const state = peer.iceConnectionState;
            setCallState(prev => prev ? { ...prev, connectionState: state } : null);

            if (state === 'failed' || state === 'disconnected') {
                if (state === 'failed') endCall(true);
            }
        };

        // ICE Candidates
        peer.onicecandidate = (e) => {
            if (e.candidate) {
                addCandidate(callId, isCaller ? 'caller' : 'callee', e.candidate);
            }
        };

        return peer;
    };

    const processIceBuffer = (peer) => {
        if (!peer || !peer.remoteDescription) return;
        console.log(`[CallContext] Processing ${iceBuffer.current.length} buffered ICE candidates`);
        iceBuffer.current.forEach(candidate => {
            peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(e =>
                console.warn("[CallContext] Buffered ICE error:", e)
            );
        });
        iceBuffer.current = [];
    };

    // 3. Caller Side
    const startCall = async (otherUser, type = 'video', chatId = null) => {
        if (callState) {
            console.warn("[CallContext] Attempted to start call while already in a call state");
            return;
        }
        console.log("[CallContext] startCall called for:", otherUser?.uid, "Type:", type);
        try {
            soundService.play('dialing', true); // Play Dialing Sound
            console.log("[CallContext] Dialing sound started");

            const callId = await createCallDoc(currentUser, otherUser, type, chatId);
            console.log("[CallContext] Call doc created:", callId);

            // Set initial state so UI shows outgoing call screen
            setCallState({
                id: callId,
                otherUser,
                type,
                status: 'dialing', // Start with dialing
                isIncoming: false,
                connectionState: 'new',
                startTime: Date.now(),
                chatId: chatId
            });

            const peer = await initPeerConnection(callId, true);

            // Create Offer
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            // Send Offer
            await setLocalDescription(callId, offer, 'offer');

            // Listen for Answer and Remote Candidates
            const unsubCall = subscribeToCall(callId, async (data) => {
                if (data?.status === 'ringing' && callState?.status !== 'ringing') {
                    setCallState(prev => prev ? { ...prev, status: 'ringing' } : null);
                }

                if (data?.answer && !peer.currentRemoteDescription) {
                    soundService.stop(); // Stop dialing
                    const rtcDesc = new RTCSessionDescription(data.answer);
                    await peer.setRemoteDescription(rtcDesc);
                    setCallState(prev => prev ? { ...prev, status: 'connected', startTime: Date.now() } : null);
                    processIceBuffer(peer);
                }

                if (data?.status === 'ended' || data?.status === 'rejected') {
                    endCall(false); // Remote ended
                }
            });

            const unsubCandidates = subscribeToCandidates(callId, 'caller', (candidateData) => {
                if (peer.remoteDescription) {
                    peer.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => console.warn("ICE Error:", e));
                } else {
                    iceBuffer.current.push(candidateData);
                }
            });

            listeners.current = [unsubCall, unsubCandidates];

        } catch (err) {
            console.error("Error starting call:", err);
            endCall(false);
        }
    };

    // 4. Callee Side
    const answerCall = async () => {
        try {
            if (!callState || callState.status === 'connected') return;
            soundService.stop(); // Stop Ringtone

            const callId = callState.id;
            const peer = await initPeerConnection(callId, false);

            const callData = await getCallDoc(callId);
            if (!callData) return;

            // Set Remote Description (Offer)
            await peer.setRemoteDescription(new RTCSessionDescription(callData.offer));
            processIceBuffer(peer);

            // Create Answer
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            // Send Answer
            await setLocalDescription(callId, answer, 'answer');
            await updateCallStatus(callId, 'connected');

            setCallState(prev => prev ? { ...prev, status: 'connected', startTime: Date.now(), chatId: callData.chatId } : null);

            // Listen for Candidates and End
            const unsubCandidates = subscribeToCandidates(callId, 'callee', (candidateData) => {
                if (peer.remoteDescription) {
                    peer.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => console.warn("ICE Error:", e));
                } else {
                    iceBuffer.current.push(candidateData);
                }
            });

            const unsubCall = subscribeToCall(callId, (data) => {
                if (data?.status === 'ended') endCall(false);
            });

            listeners.current = [unsubCandidates, unsubCall];

        } catch (err) {
            console.error("Error answering call:", err);
            endCall(false);
        }
    };

    const endCall = async (notifyRemote = true) => {
        iceBuffer.current = []; // Clear buffer
        const currentCallId = callState?.id;
        const currentChatId = callState?.chatId;
        const callStatus = callState?.status;
        const startTime = callState?.startTime;
        const callType = callState?.type;

        soundService.stop();
        if (callState) soundService.play('end');

        // Cleanup Media
        if (stream.current) {
            stream.current.getTracks().forEach(t => t.stop());
            stream.current = null;
        }
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }

        clearListeners();

        // Optimistic UI Update - Clear immediately
        setCallState(null);
        setIsMuted(false);
        setIsVideoEnabled(true);

        // Notify Remote (Background) & Add Log
        if (currentCallId) {
            try {
                let duration = 0;
                if (callStatus === 'connected' && startTime) {
                    duration = Math.round((Date.now() - startTime) / 1000);
                }

                if (notifyRemote) {
                    await updateCallStatus(currentCallId, 'ended', {
                        duration,
                        finalStatus: callStatus === 'connected' ? 'completed' : 'missed'
                    });
                    // Cleanup RTDB Signaling after status update
                    cleanupSignaling(currentCallId).catch(console.warn);
                }

                // Add Call Log to Chat (Keeping this direct for now as it crosses domains)
                if (notifyRemote && currentChatId) {
                    let logText = "Call ended";
                    let duration = 0;

                    if (callStatus === 'connected' && startTime) {
                        duration = Math.round((Date.now() - startTime) / 1000);
                        const mins = Math.floor(duration / 60);
                        const secs = duration % 60;
                        logText = `Call ended • ${mins}m ${secs}s`;
                    } else {
                        logText = callStatus === 'ringing' ? "Missed call" : "Call ended";
                    }

                    // Direct Firestore ops to keep this file self-contained for logic
                    // Consider moving to chatService if reused
                    await addDoc(collection(db, "chats", currentChatId, "messages"), {
                        text: logText,
                        type: 'call_log',
                        callType: callType || 'video',
                        duration: duration,
                        status: callStatus === 'connected' ? 'ended' : 'missed',
                        senderId: currentUser.uid,
                        timestamp: serverTimestamp()
                    });

                    await updateDoc(doc(db, "chats", currentChatId), {
                        lastMessage: { text: logText },
                        lastMessageTimestamp: serverTimestamp()
                    });
                }

            } catch (e) {
                console.warn("Failed to update call status or add log:", e);
            }
        }
    };

    const toggleMute = () => {
        if (stream.current) {
            stream.current.getAudioTracks().forEach(t => t.enabled = !t.enabled);
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (stream.current) {
            stream.current.getVideoTracks().forEach(t => t.enabled = !t.enabled);
            setIsVideoEnabled(!isVideoEnabled);
        }
    };

    const value = React.useMemo(() => ({
        callState, startCall, answerCall, endCall,
        localVideoRef, remoteVideoRef
    }), [callState, startCall, answerCall, endCall, localVideoRef, remoteVideoRef]);

    return (
        <CallContext.Provider value={value}>
            {children}
            {callState && (
                <CallOverlay
                    callState={callState}
                    localVideoRef={localVideoRef}
                    remoteVideoRef={remoteVideoRef}
                    onEnd={() => endCall(true)}
                    onAnswer={answerCall}
                    onToggleMute={toggleMute}
                    onToggleVideo={toggleVideo}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                />
            )}
        </CallContext.Provider>
    );
}

