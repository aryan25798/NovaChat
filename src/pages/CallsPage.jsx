import React from "react";
import { Link } from "react-router-dom";
import { IoArrowBack, IoCall } from "react-icons/io5";
import CallHistory from "../components/CallHistory";

const CallsPage = () => {
    return (
        <div className="flex flex-col h-full bg-background md:max-w-md md:mx-auto md:border-x md:border-border relative">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 bg-muted/30 border-b border-border">
                <Link to="/" className="text-primary hover:bg-muted p-2 rounded-full">
                    <IoArrowBack className="w-6 h-6" />
                </Link>
                <h1 className="text-xl font-semibold">Calls</h1>
            </div>

            {/* Call History List */}
            <CallHistory />

            {/* Floating Action Button for New Call */}
            <div className="absolute bottom-6 right-6">
                <Link to="/contacts">
                    <button className="bg-whatsapp-teal text-white p-4 rounded-full shadow-lg hover:bg-whatsapp-dark transition-colors">
                        <IoCall className="w-6 h-6" />
                    </button>
                </Link>
            </div>
        </div>
    );
};

export default CallsPage;
