import React from "react";
import ActiveVoiceCall from "./call/ActiveVoiceCall";
import IncomingCall from "./call/IncomingCall";
import OutgoingCall from "./call/OutgoingCall";

const VoiceCallOverlay = ({
    callState,
    onEnd,
    onAnswer,
    onToggleMute,
    onToggleSpeaker,
    isMuted,
    isSpeakerOn,
    activeRemoteStream
}) => {
    if (!callState) return null;

    const { status, isIncoming } = callState;

    if (status === "ringing" || status === "dialing") {
        if (isIncoming) {
            return <IncomingCall callState={callState} onAnswer={onAnswer} onReject={onEnd} />;
        } else {
            return <OutgoingCall callState={callState} onEnd={onEnd} />;
        }
    }

    if (status === "connected") {
        return (
            <ActiveVoiceCall
                callState={callState}
                onEnd={onEnd}
                onToggleMute={onToggleMute}
                onToggleSpeaker={onToggleSpeaker}
                isMuted={isMuted}
                isSpeakerOn={isSpeakerOn}
                activeRemoteStream={activeRemoteStream}
            />
        );
    }

    return null;
};

export default VoiceCallOverlay;
