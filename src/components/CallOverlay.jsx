import React from "react";
import ActiveCall from "./call/ActiveCall";
import IncomingCall from "./call/IncomingCall";
import OutgoingCall from "./call/OutgoingCall";

const CallOverlay = ({
    callState,
    localVideoRef,
    remoteVideoRef,
    onEnd,
    onAnswer,
    onToggleMute,
    onToggleVideo,
    isMuted,
    isVideoEnabled,
}) => {
    if (!callState) return null;

    const { status, isIncoming, otherUser } = callState;

    if (status === "ringing" || status === "dialing") {
        if (isIncoming) {
            return <IncomingCall callState={callState} onAnswer={onAnswer} onReject={onEnd} />;
        } else {
            return <OutgoingCall callState={callState} onEnd={onEnd} />;
        }
    }

    if (status === "connected") {
        return (
            <ActiveCall
                callState={callState}
                localVideoRef={localVideoRef}
                remoteVideoRef={remoteVideoRef}
                onEnd={onEnd}
                onToggleMute={onToggleMute}
                onToggleVideo={onToggleVideo}
                isMuted={isMuted}
                isVideoEnabled={isVideoEnabled}
            />
        );
    }

    // Fallback loading screen if somehow caught in between
    return (
        <div className="fixed inset-0 bg-[#111b21] z-[99999] flex flex-col items-center justify-center text-white">
            <div className="w-16 h-16 border-4 border-whatsapp-teal border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-whatsapp-teal font-medium">Connecting...</p>
        </div>
    );
};

export default CallOverlay;
