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
    cleanupSignaling,
    waitForOffer
} from "../services/callService";

const CallContext = React.createContext();

export function useCall() {
    return useContext(CallContext);
}

export const getIceServers = async () => {
    // 1. Try Environment Variables (Fastest, Client-side)
    const turnUser = import.meta.env.VITE_TURN_SERVER_USER;
    const turnPwd = import.meta.env.VITE_TURN_SERVER_PWD;
    const turnUrl = import.meta.env.VITE_TURN_SERVER_URL;

    const iceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun.metered.ca:80" },
        { urls: "stun:stun.wirlab.net:3478" },
        { urls: "stun:stun.voipzooom.com:3478" }
    ];

    if (turnUser && turnPwd && turnUrl) {
        console.log("[CallContext] Using Custom TURN credentials");
        iceServers.unshift(
            {
                urls: turnUrl,
                username: turnUser,
                credential: turnPwd
            },
            {
                urls: turnUrl + "?transport=tcp", // Force TCP for firewalls
                username: turnUser,
                credential: turnPwd
            }
        );
        return iceServers;
    }

    // 2. Fallback to Cloud Function (Slower)
    try {
        console.log("[CallContext] Fetching TURN credentials from Cloud Function...");
        const getCredentials = httpsCallable(functions, 'getTurnCredentials');
        const result = await getCredentials();
        return [...result.data, ...iceServers];
    } catch (error) {
        console.warn("Failed to fetch TURN credentials (using fallback STUN list):", error);
        return iceServers;
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
    // const remoteStream = useRef(null); // OLD: Ref based
    const [activeRemoteStream, setActiveRemoteStream] = useState(null); // NEW: State based for immediate UI update
    const listeners = useRef([]);
    const iceBuffer = useRef([]);
    const processingAnswer = useRef(false); // Lock for answer processing
    const lastProcessedOfferSdp = useRef(null); // NEW: Deduplication for renegotiation loops
    const isRestarting = useRef(false); // NEW: Lock for ICE Restart
    const consecutiveGoodStats = useRef(0); // NEW: For smooth bitrate ramping

    const [activeLocalStream, setActiveLocalStream] = useState(null); // Fix for preview
    const [networkQuality, setNetworkQuality] = useState('good'); // 'good', 'fair', 'poor'
    const statsInterval = useRef(null);

    // HELPER: ICE Restart
    const triggerIceRestart = async () => {
        if (!pc.current || !callState || !callState.id) return;

        // RACE FIX: Prevent double restart or restart during busy signaling
        if (isRestarting.current) {
            console.warn("[CallContext] ICE Restart skipped: Already in progress.");
            return;
        }
        if (pc.current.signalingState !== 'stable') {
            console.warn(`[CallContext] ICE Restart skipped: Signaling state is ${pc.current.signalingState}`);
            return;
        }

        isRestarting.current = true; // LOCK
        console.log("[CallContext] Triggering ICE Restart...");

        try {
            // 1. Create Offer with iceRestart
            const offer = await pc.current.createOffer({ iceRestart: true });

            // SOFT START: Use lower bitrate (1Mbps) for handshake reliability
            if (callState.type === 'video') {
                offer.sdp = setPreferredCodec(offer.sdp, 'video', 'VP9/90000');
                offer.sdp = setMediaBitrate(offer.sdp, 'video', 1000);
                offer.sdp = setMediaBitrate(offer.sdp, 'audio', 128);
            }

            // 2. Set Local
            await pc.current.setLocalDescription(offer);

            // 3. Send to RTDB (Signaling)
            await setLocalDescription(callState.id, offer, 'offer');

            console.log("[CallContext] ICE Restart Offer sent.");
        } catch (e) {
            console.error("ICE Restart failed:", e);
            isRestarting.current = false; // UNLOCK on error
        }
    };

    // Cleanup helper
    const clearListeners = () => {
        listeners.current.forEach(unsub => unsub());
        listeners.current = [];
    };

    // Ensure remote stream is attached when UI becomes ready
    useEffect(() => {
        if (callState?.status === 'connected' && remoteVideoRef.current && activeRemoteStream) {
            console.log("[CallContext] Attaching active remote stream to video element via Effect");
            remoteVideoRef.current.srcObject = activeRemoteStream;
            remoteVideoRef.current.play().catch(e => console.warn("Auto-play blocked:", e));
        }
    }, [callState?.status, activeRemoteStream]);

    // FIX: Ensure local stream is attached when UI becomes ready (ActiveCall mounts)
    useEffect(() => {
        if (callState && localVideoRef.current && stream.current) {
            // Only attach if not already attached to avoid flickering
            if (localVideoRef.current.srcObject !== stream.current) {
                console.log("[CallContext] Re-attaching local stream to video element");
                localVideoRef.current.srcObject = stream.current;
                localVideoRef.current.play().catch(e => console.warn("Local auto-play error:", e));
            }
        }
    }, [callState]); // Re-run when callState changes (e.g. view switching)

    // HELPER: Force High Bitrate in SDP
    const setMediaBitrate = (sdp, mediaType, bitrate) => {
        const lines = sdp.split("\n");
        let line = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].indexOf("m=" + mediaType) === 0) {
                line = i;
                break;
            }
        }
        if (line === -1) return sdp; // Media type not found

        // Skip to end of media section or start of next
        line++;
        while (lines[line] && lines[line].indexOf("m=") === -1 && lines[line].indexOf("c=") === -1) {
            if (lines[line].indexOf("b=AS:") === 0) {
                // Replace existing bandwidth line
                lines[line] = "b=AS:" + bitrate;
                return lines.join("\n");
            }
            line++;
        }

        // Add bandwidth line if not found
        lines.splice(line, 0, "b=AS:" + bitrate);
        return lines.join("\n");
    };

    // HELPER: Prefer H.264 Codec (Hardware Acceleration)
    const setPreferredCodec = (sdp, type, codecFragment) => {
        const sdpLines = sdp.split('\r\n');
        const mLineIndex = sdpLines.findIndex(line => line.startsWith('m=' + type));
        if (mLineIndex === -1) return sdp;

        const mLine = sdpLines[mLineIndex];
        const payloadTypes = mLine.split(' ').slice(3);

        // Find the PT for the preferred codec (simple search)
        // We look for "a=rtpmap:<pt> <codecFragment>"
        let preferredPT = null;
        for (const line of sdpLines) {
            if (line.startsWith('a=rtpmap:') && line.includes(codecFragment)) {
                preferredPT = line.split(':')[1].split(' ')[0];
                break;
            }
        }

        if (preferredPT) {
            const newPayloadTypes = [preferredPT, ...payloadTypes.filter(pt => pt !== preferredPT)];
            const newMLine = mLine.split(' ').slice(0, 3).concat(newPayloadTypes).join(' ');
            sdpLines[mLineIndex] = newMLine;
            return sdpLines.join('\r\n');
        }

        return sdp;
    };

    // 1. Listen for Incoming Calls
    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToIncomingCalls(currentUser.uid, (callId, data) => {
            // ONLY handle video calls in this context
            if (data.type === 'video' && !callState) {
                soundService.play('ringtone', true); // Play Ringtone
                setCallState({
                    id: callId,
                    otherUser: {
                        uid: data.callerId,
                        displayName: data.callerName,
                        photoURL: data.callerPhoto
                    },
                    type: 'video',
                    isIncoming: true,
                    status: 'ringing',
                    connectionState: 'new',
                    chatId: data.chatId
                });

                // SYNC FIX: Start a status listener immediately for incoming ringing
                const unsubStatus = subscribeToCall(callId, (update) => {
                    if (update?.status === 'ended' || update?.status === 'rejected') {
                        console.log("[CallContext] Incoming call canceled by caller.");
                        endCall(false);
                    }
                });
                listeners.current.push(unsubStatus);
            }
        });

        return unsubscribe;
    }, [currentUser, callState]);

    // 1.5 Calling Timeout (Outgoing)
    const timeoutRef = useRef(null);
    const reconnectTimeoutRef = useRef(null); // Monitor for active call disconnection
    const callStateStatusRef = useRef(callState?.status);
    callStateStatusRef.current = callState?.status;

    useEffect(() => {
        if (callState?.status === 'ringing' && !callState.isIncoming) {
            // Start 45s timeout for outgoing calls
            timeoutRef.current = setTimeout(() => {
                if (callStateStatusRef.current === 'ringing') {
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

    // MONITOR NETWORK QUALITY (Bitrate & Connection)
    useEffect(() => {
        if (callState?.status === 'connected' && pc.current) {
            console.log("[CallContext] Starting Network Monitoring...");

            statsInterval.current = setInterval(async () => {
                if (!pc.current || pc.current.signalingState === 'closed') return;

                try {
                    const stats = await pc.current.getStats();
                    let packetLoss = 0;
                    let roundTripTime = 0;

                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            roundTripTime = report.currentRoundTripTime * 1000; // ms
                        }
                        if (report.type === 'inbound-rtp' && report.kind === 'video') {
                            packetLoss = report.packetsLost;
                        }
                    });

                    // Determine Quality
                    let quality = 'good';
                    if (packetLoss > 50 || roundTripTime > 500) quality = 'poor';
                    else if (packetLoss > 10 || roundTripTime > 200) quality = 'fair';

                    setNetworkQuality(quality);

                    // Adaptive Bitrate Control (Simple)
                    const videoSender = pc.current.getSenders().find(s => s.track.kind === 'video');
                    if (videoSender && videoSender.track) {
                        const params = videoSender.getParameters();
                        if (!params.encodings) params.encodings = [{}];

                        let targetBitrate = 4500000; // Default Max (AV1/VP9)

                        // ADAPTIVE & SMOOTH RAMPING
                        if (quality === 'poor') {
                            targetBitrate = 800000; // Drop hard to save connection
                            consecutiveGoodStats.current = 0;
                        } else if (quality === 'fair') {
                            targetBitrate = 1500000;
                            consecutiveGoodStats.current = 0;
                        } else {
                            // Quality is GOOD
                            consecutiveGoodStats.current += 1;

                            // "Soft Start" Recovery - Prevent shocking the network
                            if (consecutiveGoodStats.current < 4) { // Wait ~8 seconds (4 checks)
                                targetBitrate = 2500000; // Intermediate Step
                                console.log(`[CallContext] Soft Ramping... Holding at 2.5Mbps (${consecutiveGoodStats.current}/4)`);
                            } else {
                                targetBitrate = 4500000; // Full 1080p60 Quality
                            }
                        }

                        // Only update if significantly different
                        const currentMax = params.encodings[0].maxBitrate;
                        if (!currentMax || Math.abs(currentMax - targetBitrate) > 200000) {
                            console.log(`[CallContext] Adjusting Bitrate to ${targetBitrate / 1000} kbps (${quality})`);
                            params.encodings[0].maxBitrate = targetBitrate;
                            videoSender.setParameters(params).catch(e => console.warn("Bitrate adj failed", e));
                        }
                    }

                    // MONITOR CODEC (Verification)
                    if (stats) {
                        stats.forEach(report => {
                            if (report.type === 'inbound-rtp' && report.kind === 'video') {
                                const codec = stats.get(report.codecId);
                                if (codec && !window.codecLogged) {
                                    console.log(`[CallContext] 🟢 ACTIVE VIDEO CODEC: ${codec.mimeType} (Payload: ${codec.payloadType})`);
                                    window.codecLogged = true;
                                }
                            }
                            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                                const codec = stats.get(report.codecId);
                                if (codec && !window.audioCodecLogged) {
                                    console.log(`[CallContext] 🔊 ACTIVE AUDIO CODEC: ${codec.mimeType} | Channels: ${codec.channels || 2} | Clock: ${codec.clockRate}`);
                                    window.audioCodecLogged = true;
                                }
                            }
                        });
                    }

                } catch (e) {
                    console.warn("Stats error:", e);
                }
            }, 2000);

        } else {
            if (statsInterval.current) clearInterval(statsInterval.current);
        }

        return () => {
            if (statsInterval.current) clearInterval(statsInterval.current);
        };
    }, [callState?.status]);



    const initPeerConnection = async (callId, isCaller) => {
        // Cleanup existing stream
        if (stream.current) {
            stream.current.getTracks().forEach(t => t.stop());
            stream.current = null;
        }

        // Reset remote stream
        setActiveRemoteStream(null);

        // Get media
        let localStream;
        try {
            const constraints = {
                video: {
                    facingMode: 'user',
                    width: { ideal: 1920, min: 1280 }, // Back to 1080p Preference
                    height: { ideal: 1080, min: 720 },
                    aspectRatio: { ideal: 1.777777778 },
                    frameRate: { ideal: 60, min: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 2, // Stereo
                    sampleRate: 48000, // HD Audio
                    sampleSize: 16
                }
            };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.warn("High-Spec Video failed. Trying standard HD...", err);
            try {
                // Return to Standard HD (No specific frame rate or aspect ratio strictness)
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
            } catch (err2) {
                console.warn("Standard HD failed. Falling back to VGA...", err2);
                try {
                    // Fallback to lower resolution
                    localStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: { ideal: 640 }, height: { ideal: 480 } },
                        audio: true
                    });
                } catch (finalErr) {
                    console.error("Media permission error:", finalErr);
                    let errorMsg = "Could not access camera/microphone. Please check permissions.";
                    if (finalErr.name === 'NotAllowedError') errorMsg = "Camera/microphone permission was denied.";
                    else if (finalErr.name === 'NotFoundError') errorMsg = "No camera/microphone found on this device.";

                    alert(errorMsg);
                    endCall(true);
                    throw finalErr;
                }
            }
        }

        console.log("[CallContext] getUserMedia success");

        stream.current = localStream;
        setActiveLocalStream(localStream); // Update state for UI
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

        const iceServers = await getIceServers();
        console.log("[CallContext] Configured ICE Servers:", iceServers);

        const peer = new RTCPeerConnection({
            iceServers,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: 'all', // Allow RELAY (TURN) and HOST/SRFLX
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        });
        console.log("[CallContext] PeerConnection initialized");
        pc.current = peer;

        localStream.getTracks().forEach(track => {
            if (track.kind === 'video') {
                track.contentHint = 'motion'; // Prioritize fluidity/framerate
            }
            console.log(`[CallContext] Adding local track: ${track.kind}`);
            peer.addTrack(track, localStream);
        });

        peer.ontrack = (event) => {
            console.log("[CallContext] ontrack fired. Tracks:", event.streams[0].getTracks());

            // LOW LATENCY OPTIMIZATION
            if (event.receiver && event.receiver.playoutDelayHint !== undefined) {
                event.receiver.playoutDelayHint = 0; // Request immediate playout (no buffering)
            }

            // Update state for UI to handle
            setActiveRemoteStream(event.streams[0]);
        };

        // Network robustness
        peer.oniceconnectionstatechange = () => {
            const state = peer.iceConnectionState;
            console.log(`[CallContext] ICE Connection State Changed: ${state}`);
            setCallState(prev => prev ? { ...prev, connectionState: state } : null);

            // CONNECTION MONITOR: Auto-end if stuck in disconnected/failed for >15s
            if (state === 'disconnected' || state === 'failed') {
                console.warn(`[CallContext] Connection instability detected: ${state}.`);

                // 1. Trigger ICE Restart (Caller Only) - Aggressive on Failure
                // 1. Trigger ICE Restart (Caller Only) - Aggressive on Failure
                if (isCaller) {
                    const restartDelay = state === 'failed' ? 100 : 2000; // Immediate if failed
                    console.log(`[CallContext] Initiating ICE Restart in ${restartDelay}ms...`);

                    // If FAILED, clear any pending Disconnected timeout to prevent double trigger
                    if (state === 'failed' && reconnectTimeoutRef.current) {
                        clearTimeout(reconnectTimeoutRef.current);
                    }

                    setTimeout(() => {
                        if (pc.current && (pc.current.iceConnectionState === 'disconnected' || pc.current.iceConnectionState === 'failed')) {
                            triggerIceRestart();
                        }
                    }, restartDelay);
                }

                // 2. Timeout for total failure
                if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (pc.current && (pc.current.iceConnectionState === 'disconnected' || pc.current.iceConnectionState === 'failed')) {
                        console.error("[CallContext] Connection timeout (30s). Ending call.");
                        endCall(true); // End and notify
                    }
                }, 30000); // 30s Tolerance for 4G switching

            } else if (state === 'connected' || state === 'completed') {
                // Connection recovered
                if (reconnectTimeoutRef.current) {
                    console.log("[CallContext] Connection recovered. Clearing timeout.");
                    clearTimeout(reconnectTimeoutRef.current);
                    reconnectTimeoutRef.current = null;
                }
            }
        };

        // ICE Candidates
        peer.onicecandidate = (e) => {
            if (e.candidate) {
                // console.log("[CallContext] Generated Local ICE Candidate"); 
                addCandidate(callId, isCaller ? 'caller' : 'callee', e.candidate);
            } else {
                console.log("[CallContext] Local ICE Candidate Gathering Complete");
            }
        };

        peer.onconnectionstatechange = () => {
            console.log(`[CallContext] Peer Connection State: ${peer.connectionState}`);
        };

        return peer;
    };

    const processIceBuffer = (peer) => {
        if (!peer || !peer.remoteDescription) return;
        const candidates = [...iceBuffer.current];
        iceBuffer.current = []; // Clear immediately to avoid doubles

        console.log(`[CallContext] Processing ${candidates.length} buffered ICE candidates`);
        candidates.forEach(candidate => {
            peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(e =>
                console.warn("[CallContext] Buffered ICE error:", e)
            );
        });
    };

    // 3. Caller Side
    const startCall = async (otherUser, type = 'video', chatId = null) => {
        if (callState) {
            console.warn("[CallContext] Attempted to start call while already in a call state");
            return;
        }
        console.log("[CallContext] startCall called for:", otherUser?.uid, "Type:", type);
        try {
            await soundService.ensureAudioContext();
            soundService.play('dialing', true);
            console.log("[CallContext] Dialing sound started");

            const callId = await createCallDoc(currentUser, otherUser, type, chatId);
            console.log("[CallContext] Call doc created:", callId);

            setCallState({
                id: callId,
                otherUser,
                type,
                status: 'dialing',
                isIncoming: false,
                connectionState: 'new',
                startTime: Date.now(),
                chatId: chatId
            });

            const peer = await initPeerConnection(callId, true);

            // Create Offer with Constraints for 2-way Audio/Video
            const offer = await peer.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });

            // FORCE STABLE BITRATE & AV1 > VP9 > H264
            if (type === 'video') {
                offer.sdp = setPreferredCodec(offer.sdp, 'video', 'VP9/90000');
                offer.sdp = setPreferredCodec(offer.sdp, 'video', 'AV1/90000'); // Push AV1 to top
                offer.sdp = setMediaBitrate(offer.sdp, 'video', 4500); // Start High
                offer.sdp = setMediaBitrate(offer.sdp, 'audio', 128); // 128kbps Audio
            }

            await peer.setLocalDescription(offer);

            // Send Offer
            await setLocalDescription(callId, offer, 'offer');

            // Listen for Answer and Remote Candidates
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

                    try {
                        if (peer.signalingState === 'have-local-offer') {
                            soundService.stop(); // Stop dialing
                            console.log("[CallContext] Answer received, setting remote description");
                            const rtcDesc = new RTCSessionDescription(data.answer);
                            await peer.setRemoteDescription(rtcDesc);

                            setCallState(prev => prev ? { ...prev, status: 'connected', startTime: Date.now() } : null);
                            processIceBuffer(peer);
                        }
                    } catch (err) {
                        console.error("[CallContext] Error setting remote description:", err);
                    } finally {
                        processingAnswer.current = false; // UNLOCK
                    }

                    // ICE RESTART SUCCESS: Release lock
                    if (isRestarting.current) {
                        console.log("[CallContext] ICE Restart Successful (Answer received).");
                        isRestarting.current = false;
                    }
                }

                if (data?.status === 'ended' || data?.status === 'rejected') {
                    endCall(false); // Remote ended
                }
            });

            const unsubCandidates = subscribeToCandidates(callId, 'caller', (candidateData) => {
                // console.log("[CallContext] Received Remote Candidate (Callee)");
                if (peer.remoteDescription && peer.signalingState === 'stable') {
                    peer.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => console.warn("ICE Error:", e));
                } else {
                    // console.log("[CallContext] Buffering Remote Candidate");
                    iceBuffer.current.push(candidateData);
                }
            });

            listeners.current.push(unsubCall, unsubCandidates);

        } catch (err) {
            console.error("Error starting call:", err);
            endCall(false);
        }
    };

    // 4. Callee Side
    const answerCall = async () => {
        try {
            if (!callState || callState.status === 'connected') return;

            // STEP 1: Fast UNLOCK of audio
            soundService.ensureAudioContext().catch(e => console.debug("Sync Audio Unlock ignored", e));
            soundService.stop();

            const callId = callState.id;

            // STEP 2: Parallelize Media & Signaling
            console.log("[CallContext] Answering: Triggering media and signaling in parallel...");
            const [peer, offer] = await Promise.all([
                initPeerConnection(callId, false),
                waitForOffer(callId)
            ]);

            if (!peer || !offer || !offer.type || !offer.sdp) {
                console.error("[CallContext] No valid offer or peer received. Cannot answer.");
                endCall(true);
                return;
            }

            console.log("[CallContext] Offer received, setting remote description...");

            // Set Remote Description (Offer)
            if (peer.signalingState === 'stable') {
                await peer.setRemoteDescription(new RTCSessionDescription(offer));
                processIceBuffer(peer);
            }

            // Create Answer with constraints
            const answer = await peer.createAnswer();

            // FORCE STABLE BITRATE & AV1 > VP9 > H264
            if (callState.type === 'video') {
                answer.sdp = setPreferredCodec(answer.sdp, 'video', 'VP9/90000');
                answer.sdp = setPreferredCodec(answer.sdp, 'video', 'AV1/90000'); // Push AV1 to top
                answer.sdp = setMediaBitrate(answer.sdp, 'video', 4500); // Start High
                answer.sdp = setMediaBitrate(answer.sdp, 'audio', 128); // 128 kbps Opus
            }

            await peer.setLocalDescription(answer);

            // Send Answer
            await setLocalDescription(callId, answer, 'answer');
            await updateCallStatus(callId, 'connected');

            // Fetch full call data for chatId
            const callData = await getCallDoc(callId);

            // Mark initial offer as processed to avoid immediate re-trigger
            if (offer && offer.sdp) {
                lastProcessedOfferSdp.current = offer.sdp;
            }

            setCallState(prev => prev ? { ...prev, status: 'connected', startTime: Date.now(), chatId: callData?.chatId } : null);

            // Listen for Candidates and End
            const unsubCandidates = subscribeToCandidates(callId, 'callee', (candidateData) => {
                // console.log("[CallContext] Received Remote Candidate (Caller)");
                if (peer.remoteDescription && peer.signalingState === 'stable') {
                    peer.addIceCandidate(new RTCIceCandidate(candidateData)).catch(e => console.warn("ICE Error:", e));
                } else {
                    // console.log("[CallContext] Buffering Remote Candidate");
                    iceBuffer.current.push(candidateData);
                }
            });

            const unsubCall = subscribeToCall(callId, async (data) => {
                if (data?.status === 'ended' || data?.status === 'rejected') endCall(false);

                // RE-NEGOTIATION (Callee handling new offer)
                if (data?.offer && pc.current && pc.current.signalingState === 'stable') {
                    const remoteSdp = data.offer.sdp;

                    // FIXED: Deduplication to prevent infinite loops
                    if (remoteSdp !== lastProcessedOfferSdp.current) {
                        console.log("[CallContext] Received ICE Restart Offer. Re-answering...");
                        lastProcessedOfferSdp.current = remoteSdp; // UPDATE REF

                        try {
                            await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
                            const answer = await pc.current.createAnswer();
                            if (callState.type === 'video') {
                                answer.sdp = setPreferredCodec(answer.sdp, 'video', 'VP9/90000');
                                answer.sdp = setPreferredCodec(answer.sdp, 'video', 'AV1/90000');
                                answer.sdp = setMediaBitrate(answer.sdp, 'video', 4500);
                                answer.sdp = setMediaBitrate(answer.sdp, 'audio', 128);
                            }
                            await pc.current.setLocalDescription(answer);
                            await setLocalDescription(callId, answer, 'answer');
                        } catch (e) {
                            console.error("Renegotiation failed:", e);
                        }
                    }
                }
            });

            listeners.current.push(unsubCandidates, unsubCall);

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
        // Cleanup Media (Aggressive)
        const stopTracks = (mediaStream) => {
            if (mediaStream) {
                mediaStream.getTracks().forEach(t => {
                    t.stop();
                    console.log(`[CallContext] Stopped track: ${t.kind} (${t.label})`);
                });
            }
        };

        stopTracks(stream.current);
        stream.current = null;

        stopTracks(activeLocalStream); // ALSO stop the state version just in case
        setActiveLocalStream(null);

        // Force clear video elements to release hardware lock
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
            localVideoRef.current.load(); // Tip: Forces browser to release device
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
            remoteVideoRef.current.load();
        }

        setActiveLocalStream(null); // Clear state
        setActiveRemoteStream(null); // Clear remote state

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

    const switchCamera = async () => {
        try {
            if (!stream.current) return;
            const currentVideoTrack = stream.current.getVideoTracks()[0];
            if (!currentVideoTrack) return;

            // PRESERVE AUDIO: Keep the existing audio track
            const currentAudioTrack = stream.current.getAudioTracks()[0];

            const currentFacingMode = currentVideoTrack.getSettings().facingMode;
            // On some mobile browsers, facingMode might be undefined or empty in settings
            // We'll toggle based on a local ref or just try the other one
            const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

            console.log(`[CallContext] Switching camera from ${currentFacingMode} to: ${newFacingMode}`);

            const newConstraints = {
                video: {
                    facingMode: newFacingMode, // Try without 'exact' first for better compatibility
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            let newStream;
            try {
                newStream = await navigator.mediaDevices.getUserMedia(newConstraints);
            } catch (err) {
                console.warn("[CallContext] Standard switch failed, trying with exact facingMode...");
                try {
                    newStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { exact: newFacingMode } }
                    });
                } catch (err2) {
                    console.error("[CallContext] All camera switch attempts failed:", err2);
                    throw new Error("Could not access " + newFacingMode + " camera.");
                }
            }

            const newVideoTrack = newStream.getVideoTracks()[0];

            // 1. Replace track in PeerConnection (smooth switch for remote)
            if (pc.current) {
                const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    await sender.replaceTrack(newVideoTrack);
                    console.log("[CallContext] Remote track replaced successfully");
                }
            }

            // 2. Stop OLD video track ONLY
            currentVideoTrack.stop();

            // 3. Construct NEW stream preserving the original audio track
            const combinedStream = new MediaStream([newVideoTrack]);
            if (currentAudioTrack) {
                combinedStream.addTrack(currentAudioTrack);
            }

            // 4. Update Internal State
            stream.current = combinedStream;
            setActiveLocalStream(combinedStream);

            // 5. Update UI Ref
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = combinedStream;
            }

            console.log("[CallContext] Switch camera complete. Audio preserved:", !!currentAudioTrack);

        } catch (err) {
            console.error("Error switching camera:", err);
            alert("Could not switch camera: " + err.message);
        }
    };

    const value = React.useMemo(() => ({
        callState: { ...callState, activeLocalStream, activeRemoteStream, networkQuality },
        startCall, answerCall, endCall, switchCamera,
        localVideoRef, remoteVideoRef, activeLocalStream, activeRemoteStream, networkQuality
    }), [callState, startCall, answerCall, endCall, switchCamera, localVideoRef, remoteVideoRef, activeLocalStream, activeRemoteStream, networkQuality]);

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
                    onSwitchCamera={switchCamera}
                    isMuted={isMuted}
                    isVideoEnabled={isVideoEnabled}
                    activeLocalStream={activeLocalStream}
                    activeRemoteStream={activeRemoteStream}
                />
            )}
        </CallContext.Provider>
    );

}
