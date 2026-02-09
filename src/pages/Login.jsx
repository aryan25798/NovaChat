import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaGoogle, FaRocket, FaQrcode } from "react-icons/fa"; // Changed Icon
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { cn } from "../lib/utils";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function Login() {
    const { loginWithGoogle, loginWithEmail } = useAuth();
    const navigate = useNavigate();
    const [isAdminLogin, setIsAdminLogin] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ error: "" });

    const handleLogin = async () => {
        setLoading(true);
        try {
            const user = await loginWithGoogle();

            // Capture Location
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        await updateDoc(doc(db, "users", user.uid), {
                            lastLoginLocation: { lat: latitude, lng: longitude, timestamp: serverTimestamp() }
                        });
                    } catch (e) { console.warn("Could not save location:", e); }
                }, (err) => {
                    console.warn("Location access denied or failed:", err);
                });
            }

            navigate("/");
        } catch (error) {
            setStatus({ error: "Failed to log in: " + error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await loginWithEmail(email, password);
            navigate("/admin");
        } catch (error) {
            setStatus({ error: "Admin Login Failed: " + error.message });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col relative overflow-hidden font-sans">
            {/* Header Background */}
            <div className="absolute top-0 w-full h-56 bg-primary z-0" />

            {/* Logo Header */}
            <div className="relative z-10 container mx-auto px-4 py-8 flex items-center gap-3 text-white">
                <FaRocket className="w-8 h-8" />
                <span className="uppercase tracking-widest font-semibold text-sm">Nova Web</span>
            </div>

            {/* Main Card */}
            <div className="relative z-10 w-full max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden flex flex-col md:flex-row mt-4">
                {!isAdminLogin ? (
                    <>
                        <div className="p-10 md:w-3/5 flex flex-col justify-between">
                            <div>
                                <h1 className="text-3xl font-light text-gray-700 dark:text-gray-200 mb-8">
                                    Use Nova on your computer
                                </h1>
                                <ol className="list-decimal list-inside space-y-4 text-lg text-gray-600 dark:text-gray-300">
                                    <li>Open Nova on your phone</li>
                                    <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>
                                    <li>Tap on <strong>Link a Device</strong></li>
                                    <li>Point your phone to this screen to capture the code</li>
                                </ol>
                            </div>

                            <div className="mt-12 space-y-4">
                                <Button
                                    onClick={handleLogin}
                                    className="w-full md:w-auto bg-white text-gray-800 border-gray-200 hover:bg-gray-50 flex items-center gap-3 shadow-sm rounded-full py-6 px-8 text-base"
                                    variant="outline"
                                    disabled={loading}
                                >
                                    <FaGoogle className="text-red-500 w-5 h-5" />
                                    {loading ? "Connecting..." : "Continue with Google"}
                                </Button>
                                <div className="text-sm text-primary cursor-pointer hover:underline" onClick={() => setIsAdminLogin(true)}>
                                    Admin Login
                                </div>
                                {status.error && !isAdminLogin && (
                                    <div className="text-red-500 text-sm text-center mt-2 bg-red-50 p-2 rounded">
                                        {status.error}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="hidden md:flex md:w-2/5 p-10 border-l border-gray-100 dark:border-gray-700 flex-col items-center justify-center text-center">
                            <div className="relative group p-2 border border-gray-200 rounded-sm">
                                <FaQrcode className="w-64 h-64 text-gray-800 dark:text-white" />
                                <div className="absolute top-0 left-0 w-full h-full bg-primary/10 animate-pulse pointer-events-none" />
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)] animate-[scan_2s_linear_infinite]" />
                            </div>
                            <style>{`
                                @keyframes scan {
                                    0% { top: 0%; opacity: 0; }
                                    10% { opacity: 1; }
                                    90% { opacity: 1; }
                                    100% { top: 100%; opacity: 0; }
                                }
                            `}</style>
                            <div className="mt-6">
                                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-200">Keep me signed in</h3>
                                <p className="text-sm text-gray-500 mt-1">Select "Keep me signed in" on the popup screen</p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="p-10 w-full max-w-md mx-auto flex flex-col justify-center min-h-[500px]">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">Admin Portal</h2>
                            <p className="text-gray-500 mt-2">Enter credentials to access dashboard</p>
                        </div>
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            <Input
                                type="email"
                                placeholder="Admin Email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="h-12"
                            />
                            <Input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="h-12"
                            />
                            <Button type="submit" className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-white font-bold" disabled={loading}>
                                {loading ? "Verifying..." : "Login Securely"}
                            </Button>
                            {status.error && (
                                <div className="text-red-500 text-sm text-center mt-2 bg-red-50 p-2 rounded">
                                    {status.error}
                                </div>
                            )}
                        </form>
                        <div className="mt-6 text-center">
                            <span className="text-primary cursor-pointer hover:underline" onClick={() => setIsAdminLogin(false)}>
                                Back to User Login
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-auto py-6 text-center text-gray-500 text-sm relative z-10">
                <p>Gemini AI Integrated • End-to-end Encrypted</p>
            </div>
        </div>
    );
}
