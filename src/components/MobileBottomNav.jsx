import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BsChatText, BsTelephone, BsCircle, BsPerson } from "react-icons/bs";
import { cn } from "../lib/utils";
import { motion } from "framer-motion";

const MobileBottomNav = () => {
    const location = useLocation();

    const navItems = [
        { icon: BsChatText, label: "Chats", path: "/" },
        { icon: BsCircle, label: "Status", path: "/status" },
        { icon: BsTelephone, label: "Calls", path: "/calls" },
        { icon: BsPerson, label: "Profile", path: "/profile" },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-20 bg-surface-elevated/80 backdrop-blur-xl border-t border-border/30 flex justify-around items-center px-2 pb-safe z-50">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                    <Link
                        key={item.label}
                        to={item.path}
                        className={cn(
                            "relative flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors active:scale-95 group",
                            isActive ? "text-primary" : "text-text-2 hover:text-text-1"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="mobileNavIndicator"
                                className="absolute top-0 w-12 h-1 bg-primary rounded-b-full shadow-[0_4px_12px_rgba(var(--primary-rgb),0.5)]"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}
                        <div className={cn("p-1.5 rounded-xl transition-all duration-300", isActive ? "bg-primary/10" : "bg-transparent")}>
                            <item.icon className={cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-110" : "group-hover:scale-110")} />
                        </div>
                        <span className={cn("text-[10px] font-semibold transition-all duration-300", isActive ? "opacity-100 translate-y-0" : "opacity-70 translate-y-0.5")}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </div>
    );
};

export default MobileBottomNav;
