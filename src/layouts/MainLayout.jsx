import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import MobileBottomNav from "../components/MobileBottomNav";
import { cn } from "../lib/utils";
import NavRail from "../components/NavRail";
import { motion, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "../hooks/useMediaQuery";

const MainLayout = () => {
    const location = useLocation();
    const isMobile = useMediaQuery("(max-width: 768px)");
    const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
    const isDesktop = useMediaQuery("(min-width: 1025px)");

    const isChatActive = location.pathname.startsWith('/c/');
    const isRoot = location.pathname === "/";

    // Mobile: Show Sidebar on root, Chat on /c/:id.
    // Desktop/Tablet: Always show both (Split view).

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-text-1 font-sans antialiased selection:bg-primary/20">
            {/* Nav Rail - Desktop & Tablet */}
            {!isMobile && <NavRail />}

            {/* Application Shell */}
            <div className={cn(
                "flex-1 flex overflow-hidden relative bg-surface shadow-2xl transition-all duration-500",
                isDesktop ? "lg:max-w-[1800px] lg:mx-auto" : "w-full"
            )}>

                {/* Sidebar Pane (Chat List) */}
                <aside
                    className={cn(
                        "flex-col border-r border-border/50 bg-surface-elevated transition-all duration-300 ease-in-out relative z-30 shrink-0",
                        isMobile
                            ? "w-full absolute inset-0" // Full width on mobile
                            : isTablet
                                ? "w-[320px]" // Compact on tablet
                                : "w-[400px] lg:w-[420px]", // Wide on desktop
                        isMobile && !isRoot ? "-translate-x-full opacity-0 pointer-events-none" : "flex translate-x-0 opacity-100"
                    )}
                >
                    <Sidebar />
                </aside>

                {/* Main Content Area (Active Chat / Profile / Status etc.) */}
                <main
                    className={cn(
                        "flex-1 flex flex-col relative min-w-0 bg-surface overflow-hidden transition-all duration-300 ease-in-out",
                        isMobile
                            ? "absolute inset-0 bg-surface z-40" // Full screen on mobile
                            : "flex",
                        isMobile && isRoot ? "translate-x-full opacity-0 pointer-events-none" : "translate-x-0 opacity-100"
                    )}
                >
                    {/* Global Background Pattern */}
                    <div className="absolute inset-0 opacity-[0.4] dark:opacity-[0.03] pointer-events-none -z-10 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-[length:500px]" />
                    <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/50 to-background/80 pointer-events-none -z-10 backdrop-blur-[1px]" />

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={isMobile ? { opacity: 0, x: 20 } : { opacity: 0, scale: 0.98 }}
                            animate={isMobile ? { opacity: 1, x: 0 } : { opacity: 1, scale: 1 }}
                            exit={isMobile ? { opacity: 0, x: -20 } : { opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="flex-1 flex flex-col overflow-hidden relative"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* Mobile Bottom Navigation - Only show when NOT in a chat */}
            {isMobile && !isChatActive && <MobileBottomNav />}
        </div>
    );
};

export default MainLayout;
