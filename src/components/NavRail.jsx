import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BsChatText, BsTelephone, BsCircle, BsPerson, BsGear } from "react-icons/bs";
import { cn } from "../lib/utils";
import { Avatar } from "./ui/Avatar";
import { useAuth } from "../contexts/AuthContext";

import { useNotification } from "../contexts/NotificationContext";

const NavRail = () => {
    const location = useLocation();
    const { currentUser } = useAuth();
    const { unreadCount } = useNotification();

    const navItems = [
        { icon: BsChatText, label: "Chats", path: "/" },
        { icon: BsCircle, label: "Status", path: "/status" },
        { icon: BsTelephone, label: "Calls", path: "/calls" },
    ];

    return (
        <div className="hidden md:flex flex-col items-center w-[76px] h-full bg-surface-elevated/95 backdrop-blur-2xl border-r border-border/50 pt-8 pb-4 z-40 shrink-0 shadow-[2px_0_10px_-2px_rgba(0,0,0,0.05)]">
            <Link to="/profile" className="mb-8 relative group">
                <div className="absolute -inset-1 bg-gradient-to-br from-primary to-secondary rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                <Avatar
                    src={currentUser?.photoURL}
                    alt="Profile"
                    size="md"
                    className="border-2 border-surface shadow-sm transition-transform group-hover:scale-105"
                />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-surface">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Link>

            <div className="flex-1 flex flex-col gap-3 w-full px-3">
                {navItems.map((item) => {
                    const isActive = (item.path === "/" && location.pathname === "/") || (item.path !== "/" && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.label}
                            to={item.path}
                            title={item.label}
                            className={cn(
                                "relative flex items-center justify-center w-full aspect-square rounded-2xl transition-all duration-300 group",
                                isActive
                                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                                    : "text-text-2 hover:bg-surface hover:text-text-1"
                            )}
                        >
                            <item.icon className={cn("w-5 h-5 transition-transform duration-300", isActive ? "scale-100" : "group-hover:scale-110")} />
                            {isActive && (
                                <span className="absolute -right-1 top-2 w-1.5 h-1.5 bg-white rounded-full shadow-sm animate-pulse" />
                            )}
                        </Link>
                    );
                })}
            </div>

            <div className="mt-auto px-3 w-full">
                <Link
                    to="/settings"
                    className={cn(
                        "flex items-center justify-center w-full aspect-square rounded-2xl text-text-2 hover:bg-surface hover:text-text-1 transition-all duration-300 hover:rotate-90"
                    )}
                    title="Settings"
                >
                    <BsGear className="w-6 h-6" />
                </Link>
            </div>
        </div>
    );
};

export default NavRail;
