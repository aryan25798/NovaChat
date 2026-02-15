import React from "react";
import { useAuth } from "../contexts/AuthContext";

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-surface text-center p-8 border-b-[6px] border-whatsapp-green/40 relative overflow-hidden">
            {/* WhatsApp Web Style Intro */}
            <div className="mb-8 opacity-90 transition-all duration-500 hover:scale-105">
                <img
                    src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/512px-WhatsApp.svg.png"
                    alt="WhatsApp"
                    className="w-[120px] md:w-[150px] drop-shadow-2xl"
                />
            </div>

            <h1 className="text-3xl md:text-4xl font-light text-text-1 mb-6 tracking-tight">
                Nova Web
            </h1>

            <p className="text-text-2 mb-10 max-w-lg text-sm md:text-base leading-relaxed">
                Send and receive messages without keeping your phone online.
                <br />
                Use Nova on multiple devices with AI-powered features.
            </p>

            <div className="absolute bottom-10 flex items-center gap-2 text-xs text-text-2/80 font-medium">
                <span className="text-lg">🔒</span> End-to-end encrypted
            </div>
        </div>
    );
}
