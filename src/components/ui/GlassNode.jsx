import React from "react";
import { cn } from "../../lib/utils";

const GlassNode = React.forwardRef(({ className, children, intensity = "md", ...props }, ref) => {
    const intensities = {
        sm: "backdrop-blur-[4px] bg-surface/40",
        md: "backdrop-blur-[12px] bg-surface/70",
        lg: "backdrop-blur-[24px] bg-surface/85",
    };

    return (
        <div
            ref={ref}
            className={cn(
                "border border-border/50 shadow-premium",
                intensities[intensity],
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
});

GlassNode.displayName = "GlassNode";

export { GlassNode };
