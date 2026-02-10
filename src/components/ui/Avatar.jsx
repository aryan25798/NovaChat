import React from "react";
import { cn } from "../../lib/utils";

const Avatar = React.forwardRef(({ className, src, alt, fallback, size = "md", ...props }, ref) => {
    const sizes = {
        xs: "h-6 w-6 text-[10px]",
        sm: "h-8 w-8 text-[11px]",
        md: "h-11 w-11 text-[13px]",
        lg: "h-14 w-14 text-[15px]",
        xl: "h-20 w-20 text-[18px]",
    };

    return (
        <div
            ref={ref}
            className={cn(
                "relative flex shrink-0 overflow-hidden rounded-full bg-surface-elevated border border-border/50 shadow-sm",
                sizes[size],
                className
            )}
            {...props}
        >
            {src ? (
                <img
                    src={src}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-surface-elevated text-text-2 font-semibold uppercase">
                    {fallback || alt?.slice(0, 1) || "?"}
                </div>
            )}
        </div>
    );
});
Avatar.displayName = "Avatar";

export { Avatar };
