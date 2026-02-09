import React from "react";
import { BsPhone, BsLaptop, BsStars } from "react-icons/bs";

const EmptyState = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/20">
            <div className="mb-6 opacity-80">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <BsStars className="w-12 h-12 text-primary animate-pulse" />
                </div>
            </div>
            <h1 className="text-3xl font-light text-muted-foreground mb-4">
                Nova Web
            </h1>
            <p className="text-muted-foreground mb-8 max-w-md">
                Send and receive messages with AI-powered assistance.
                <br />
                Use Nova on multiple devices seamlessly.
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto">
                <BsLaptop />
                <span>Built for Windows</span>
            </div>
        </div>
    );
};

export default EmptyState;
