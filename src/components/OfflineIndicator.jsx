import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiWifi, FiWifiOff } from "react-icons/fi";

const OfflineIndicator = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    return (
        <AnimatePresence>
            {isOffline && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-yellow-500/90 text-black text-xs font-semibold text-center z-[100] w-full absolute top-0 left-0 backdrop-blur-sm shadow-sm"
                >
                    <div className="py-1 px-2 flex items-center justify-center gap-2">
                        <FiWifiOff className="text-[10px]" />
                        <span>You are currently offline. Messages will be sent when you reconnect.</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default OfflineIndicator;
