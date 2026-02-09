import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";
import React from "react";

const Button = React.forwardRef(({ className, variant = "primary", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const variants = {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-premium hover:shadow-premium-hover transition-all active:scale-[0.98]",
        surface: "bg-surface text-text-1 hover:bg-surface-elevated border border-border/50",
        ghost: "hover:bg-surface-elevated text-text-2 hover:text-text-1 transition-colors",
        destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
        outline: "border border-border bg-transparent hover:bg-surface-elevated hover:text-text-1",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "glass hover:bg-surface-elevated/20 transition-all",
    };

    const sizes = {
        default: "h-11 px-5 py-2.5 rounded-xl",
        sm: "h-9 rounded-lg px-4 text-[13px]",
        lg: "h-13 rounded-2xl px-10 text-[16px]",
        icon: "h-10 w-10 rounded-full",
    };

    return (
        <Comp
            className={cn(
                "inline-flex items-center justify-center font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                variants[variant],
                sizes[size],
                className
            )}
            ref={ref}
            {...props}
        />
    );
});

Button.displayName = "Button";

export { Button };
