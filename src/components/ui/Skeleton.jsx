import React from "react";
import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }) {
    return (
        <div
            className={cn("animate-pulse rounded-md bg-black/5 dark:bg-white/10", className)}
            {...props}
        />
    );
}

export function ChatListSkeleton() {
    return (
        <div className="flex flex-col">
            {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-3 px-4 border-b border-border/30">
                    <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2.5">
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-4 w-1/3 rounded-full" />
                            <Skeleton className="h-3 w-10 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-3/4 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ChatHeaderSkeleton() {
    return (
        <div className="h-[68px] px-4 flex items-center justify-between bg-surface-elevated border-b border-border/50">
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded-full" />
                    <Skeleton className="h-2 w-20 rounded-full" />
                </div>
            </div>
            <div className="flex gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
        </div>
    );
}

export function MessageSkeleton() {
    return (
        <div className="flex flex-col gap-4 p-4 w-full">
            {[...Array(6)].map((_, i) => (
                <div key={i} className={cn("flex w-full", i % 2 === 0 ? "justify-start" : "justify-end")}>
                    <Skeleton
                        className={cn(
                            "h-12 rounded-2xl",
                            i % 2 === 0 ? "w-2/3 rounded-tl-none" : "w-1/2 rounded-tr-none bg-primary/20"
                        )}
                    />
                </div>
            ))}
        </div>
    );
}
