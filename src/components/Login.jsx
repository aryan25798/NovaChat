import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaGoogle, FaWhatsapp, FaQrcode } from "react-icons/fa";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function Login() {
    const { loginWithGoogle, loginWithEmail } = useAuth();
    const navigate = useNavigate();
    const [isAdminLogin, setIsAdminLogin] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleLogin = async () => {
        try {
            setError("");
            const user = await loginWithGoogle();

            // Capture Location (Optional, keeping as per original requirement)
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        await updateDoc(doc(db, "users", user.uid), {
                            lastLoginLocation: { lat: latitude, lng: longitude, timestamp: serverTimestamp() }
                        });
                    } catch (e) {
                        console.warn("Could not save location:", e);
                    }
                }, (err) => {
                    console.warn("Location access denied or failed:", err);
                });
            }

            navigate("/");
        } catch (error) {
            setError("Failed to log in: " + error.message);
        }
    };

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        try {
            setError("");
            await loginWithEmail(email, password);
            navigate("/admin");
        } catch (error) {
            setError("Admin Login Failed: " + error.message);
        }
    }

    return (
        <div className="min-h-screen bg-[#d1d7db] flex flex-col items-center relative font-sans">
            {/* Header Background */}
            <div className="absolute top-0 left-0 w-full h-[222px] bg-[#00a884] z-0">
                <div className="flex items-center gap-3 px-[15%] py-7 text-white font-medium text-sm tracking-wide uppercase">
                    <FaWhatsapp className="text-2xl" />
                    <span>WHATSAPP WEB CLONE</span>
                </div>
            </div>

            {/* Login Card */}
            <div className="z-10 bg-white w-[90%] max-w-[1000px] mt-24 rounded shadow-xl flex overflow-hidden min-h-[70vh] md:min-h-[500px]">
                {!isAdminLogin ? (
                    <div className="flex flex-col md:flex-row w-full p-10 md:p-14 gap-10">
                        {/* Instructions Column */}
                        <div className="flex-1">
                            <h1 className="font-light text-2xl text-[#41525d] mb-10">Use WhatsApp on your computer</h1>
                            <ol className="flex flex-col gap-5 text-lg text-[#3b4a54] leading-7 list-decimal pl-5">
                                <li>Open WhatsApp on your phone</li>
                                <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>
                                <li>Tap on <strong>Link a Device</strong></li>
                                <li>Point your phone to this screen to capture the code</li>
                            </ol>

                            <div className="mt-12 flex flex-col gap-4">
                                <button
                                    className="flex items-center justify-center gap-3 px-6 py-3 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors w-fit text-[#111b21] font-medium"
                                    onClick={handleLogin}
                                >
                                    <FaGoogle className="text-[#DB4437] text-xl" />
                                    Continue with Google
                                </button>
                                {error && <p className="text-red-500 text-sm">{error}</p>}
                                <button
                                    onClick={() => setIsAdminLogin(true)}
                                    className="text-[#00a884] hover:underline text-sm font-medium w-fit"
                                >
                                    Admin Login
                                </button>
                            </div>
                        </div>

                        {/* QR Code Column (Hidden on small screens) */}
                        <div className="hidden md:flex flex-col items-center justify-center border-l border-gray-100 pl-10">
                            <div className="relative p-2 border border-gray-100 rounded-lg">
                                <FaQrcode size={240} className="text-[#111B21]" />
                                {/* Scan Animation Line */}
                                <div className="absolute left-[5%] w-[90%] h-[2px] bg-[#00a884] shadow-[0_0_8px_#00a884] animate-scan"></div>
                            </div>
                            <div className="mt-8">
                                <p className="text-[#41525d] font-medium text-lg mb-1 text-center">Keep me signed in</p>
                                <p className="text-[#8696a0] text-sm text-center">Select to stay logged in on this device</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="w-full flex items-center justify-center p-8">
                        <form onSubmit={handleAdminLogin} className="w-full max-w-sm flex flex-col gap-5">
                            <div className="text-center mb-4">
                                <h3 className="text-2xl text-[#41525d] font-normal mb-1">Admin Portal</h3>
                                <p className="text-[#667781] text-sm">Access the dashboard</p>
                            </div>

                            <input
                                type="email"
                                placeholder="Admin Email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="w-full px-4 py-3 bg-[#f0f2f5] border border-gray-200 rounded-lg focus:outline-none focus:border-[#00a884] transition-colors"
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-[#f0f2f5] border border-gray-200 rounded-lg focus:outline-none focus:border-[#00a884] transition-colors"
                            />

                            {error && <p className="text-red-500 text-sm">{error}</p>}

                            <button
                                type="submit"
                                className="w-full bg-[#00a884] text-white py-3 rounded-full font-medium hover:bg-[#008f6f] transition-colors shadow-sm"
                            >
                                Login Securely
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsAdminLogin(false)}
                                className="text-[#00a884] hover:underline text-sm font-medium text-center mt-2"
                            >
                                Back to User Login
                            </button>
                        </form>
                    </div>
                )}
            </div>

            <div className="mt-8 text-[#8696a0] text-xs pb-4 text-center z-10">
                <p>Gemini AI Integrated • End-to-end Redesigned UI • Production Ready</p>
            </div>

            <style jsx>{`
                @keyframes scan {
                    0% { top: 10%; }
                    50% { top: 90%; }
                    100% { top: 10%; }
                }
                .animate-scan {
                    animation: scan 2s linear infinite;
                    position: absolute;
                    top: 10%;
                }
            `}</style>
        </div>
    );
}
