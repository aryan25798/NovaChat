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

    // Visibility Logic
    // Mobile: Show Sidebar ONLY on root. Show Content on everything else.
    // Desktop/Tablet: Always show both.
    const showSidebar = !isMobile || isRoot;
    const showContent = !isMobile || !isRoot;

    return (
        <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-text-1 font-sans antialiased selection:bg-primary/20">
            {/* Nav Rail - Desktop & Tablet - Hidden on Mobile */}
            {!isMobile && <NavRail />}

            {/* Application Shell */}
            <div className={cn(
                "flex-1 flex overflow-hidden relative bg-surface shadow-2xl transition-all duration-300",
                isDesktop ? "max-w-[100vw] mx-auto" : "w-full"
            )}>

                {/* Sidebar Pane (Chat List) */}
                {showSidebar && (
                    <aside
                        className={cn(
                            "flex flex-col border-r border-border/50 bg-surface-elevated relative z-30 shrink-0 h-full",
                            isMobile ? "w-full" : (isTablet ? "w-[340px]" : "w-[420px] lg:w-[450px] xl:w-[480px]")
                        )}
                    >
                        <Sidebar />
                    </aside>
                )}

                {/* Main Content Area (Active Chat / Profile / Status etc.) */}
                {showContent && (
                    <main
                        className={cn(
                            "flex-1 flex flex-col relative min-w-0 bg-surface overflow-hidden h-full shadow-[inset_1px_0_0_0_rgba(0,0,0,0.05)]",
                            // On mobile, this takes full width/height
                        )}
                    >
                        {/* Global Background Pattern for Chat Areas */}
                        <div className="absolute inset-0 opacity-[0.4] dark:opacity-[0.03] pointer-events-none -z-10 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-[length:500px]" />

                        <div className="flex-1 flex flex-col overflow-hidden relative w-full h-full">
                            <Outlet />
                        </div>
                    </main>
                )}
            </div>

            {/* Mobile Bottom Navigation - Only show when NOT in a chat */}
            {isMobile && !isChatActive && <MobileBottomNav />}
        </div>
    );
};

export default MainLayout;
