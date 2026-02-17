import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FaGoogle, FaLock, FaEnvelope, FaShieldAlt } from "react-icons/fa";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export default function Login() {
    const { currentUser, loginWithGoogle, loginWithEmail, signupWithEmail } = useAuth();
    const navigate = useNavigate();
    const [isAdminLogin, setIsAdminLogin] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [redirecting, setRedirecting] = useState(false);
    const [status, setStatus] = useState({ error: "" });

    React.useEffect(() => {
        if (currentUser && currentUser.claimsSettled) {
            // "Industry Shell" handles all role-based routing from "/"
            navigate("/", { replace: true });
        }
    }, [currentUser, navigate]);

    const handleLogin = async () => {
        setLoading(true);
        setStatus({ error: "" });
        try {
            const result = await loginWithGoogle();
            if (result === 'redirect') {
                // User is being redirected to Google — show visual feedback
                setRedirecting(true);
                return; // Don't setLoading(false), page will navigate away
            }
            // If result is null, login was silently cancelled (e.g. duplicate popup)
            if (!result) {
                setLoading(false);
            }
        } catch (error) {
            setStatus({ error: error.message || "Failed to log in. Please try again." });
            setLoading(false);
        }
    };

    const handleAdminLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ error: "" });
        try {
            await loginWithEmail(email, password);
            // navigate("/admin"); // Let the useEffect above handle the redirect based on auth state
        } catch (error) {
            setStatus({ error: "Invalid admin credentials." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen w-full flex bg-background text-foreground font-sans selection:bg-primary/20">
            {/* Left Side - Hero / Branding (Hidden on mobile, block on lg) */}
            <div className="hidden lg:flex w-1/2 bg-surface-elevated relative overflow-hidden items-center justify-center p-12">
                <div className="absolute inset-0 bg-primary/5 pattern-grid-lg opacity-20" />

                {/* Abstract decorative shapes */}
                <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-float-slow" />
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-float-delayed" />

                <div className="relative z-10 max-w-lg space-y-8 animate-fade-in">
                    <div className="w-20 h-20 bg-gradient-to-tr from-primary to-blue-600 rounded-2xl shadow-2xl flex items-center justify-center mb-8 rotate-3 transition-transform hover:rotate-6 duration-500">
                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                    </div>
                    <h1 className="text-5xl font-bold tracking-tight text-foreground">
                        Connect with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">your world.</span>
                    </h1>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Experience the next generation of messaging. Secure, fast, and designed for you.
                    </p>

                    {/* Simulated Chat Bubble Feature */}
                    <div className="mt-12 bg-surface/80 border border-border/50 rounded-2xl p-6 shadow-xl max-w-sm backdrop-blur-md animate-float">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600" />
                            <div className="space-y-2 flex-1">
                                <div className="h-2 w-1/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                <div className="h-2 w-3/4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                            </div>
                        </div>
                        <div className="h-2 w-full bg-gray-50 dark:bg-gray-900 rounded animate-pulse mb-2" />
                        <div className="h-2 w-5/6 bg-gray-50 dark:bg-gray-900 rounded animate-pulse" />
                    </div>
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
                {/* Mobile Background Decoration */}
                <div className="lg:hidden absolute inset-0 -z-10 bg-surface-elevated overflow-hidden">
                    <div className="absolute inset-0 bg-primary/5 pattern-grid-lg opacity-20" />
                    <div className="absolute top-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 animate-float-slow" />
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 animate-float-delayed" />
                </div>

                <div className="w-full max-w-md space-y-8 animate-slide-up">
                    <div className="text-center lg:text-left space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            {isAdminLogin ? "Admin Access" : "Welcome back"}
                        </h2>
                        <p className="text-muted-foreground">
                            {isAdminLogin
                                ? "Enter your credentials to access the dashboard."
                                : "Sign in to your account to continue."}
                        </p>
                    </div>

                    {status.error && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {status.error}
                        </div>
                    )}

                    {!isAdminLogin ? (
                        <div className="space-y-6">
                            <button
                                onClick={handleLogin}
                                disabled={loading}
                                className="w-full group relative flex items-center justify-center gap-3 px-8 py-4 bg-surface border border-border hover:bg-surface-elevated hover:border-primary/30 text-foreground font-medium rounded-xl transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                <FaGoogle className="text-xl text-foreground/80 group-hover:text-primary transition-colors duration-300" />
                                <span>{redirecting ? "Redirecting to Google..." : loading ? "Connecting..." : "Continue with Google"}</span>
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-border" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">
                                        or
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsAdminLogin(true)}
                                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
                            >
                                Are you an administrator?
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleAdminLogin} className="space-y-5">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Email Address</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                                            <FaEnvelope />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 outline-none placeholder:text-muted-foreground/50"
                                            placeholder="admin@example.com"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Password</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
                                            <FaLock />
                                        </div>
                                        <input
                                            type="password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="block w-full pl-10 pr-3 py-3 border border-border rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 outline-none placeholder:text-muted-foreground/50"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 px-8 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    {loading ? (
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <FaShieldAlt />
                                            <span>Access Dashboard</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsAdminLogin(false)}
                                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Back to User Login
                            </button>
                        </form>
                    )}

                    {/* Dev Login/Signup Backdoor */}
                    <div className="pt-4 border-t border-border">
                        <details className="text-xs text-muted-foreground cursor-pointer">
                            <summary>Dev Tools</summary>
                            <div className="mt-2 space-y-2">
                                <input id="dev-email" placeholder="Email" className="w-full p-2 border rounded" />
                                <input id="dev-pass" placeholder="Password" type="password" className="w-full p-2 border rounded" />
                                <div className="flex gap-2">
                                    <button onClick={() => {
                                        const e = document.getElementById('dev-email').value;
                                        const p = document.getElementById('dev-pass').value;
                                        loginWithEmail(e, p).catch(err => alert(err.message));
                                    }} className="bg-blue-500 text-white px-3 py-1 rounded">Login</button>
                                    <button onClick={() => {
                                        const e = document.getElementById('dev-email').value;
                                        const p = document.getElementById('dev-pass').value;
                                        signupWithEmail(e, p).catch(err => alert(err.message));
                                    }} className="bg-green-500 text-white px-3 py-1 rounded" id="dev-signup-btn">Signup</button>
                                </div>
                            </div>
                        </details>
                    </div>

                    <div className="pt-8 text-center text-xs text-muted-foreground">
                        <p>© 2024 NovaChat. Secure & Encrypted.</p>
                    </div>
                </div>
            </div>

            <style>{`
                .pattern-grid-lg {
                    background-image: linear-gradient(currentColor 1px, transparent 1px), linear-gradient(to right, currentColor 1px, transparent 1px);
                    background-size: 40px 40px;
                }
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes float-slow {
                    0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
                    50% { transform: translate(-50%, -50%) translateY(-20px); }
                }
                @keyframes float-delayed {
                    0%, 100% { transform: translate(33%, 33%) translateY(0px); }
                    50% { transform: translate(33%, 33%) translateY(-20px); }
                }
                .animate-fade-in {
                    animation: fade-in 0.8s ease-out forwards;
                }
                .animate-slide-up {
                    animation: fade-in 0.6s ease-out 0.2s both;
                }
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                .animate-float-slow {
                    animation: float-slow 10s ease-in-out infinite;
                }
                .animate-float-delayed {
                    animation: float-delayed 12s ease-in-out infinite reverse;
                }
                .animate-in {
                    animation-duration: 0.3s;
                    animation-fill-mode: both;
                    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
                }
                .fade-in {
                    animation-name: fade-in;
                }
                .slide-in-from-top-2 {
                    --tw-enter-translate-y: -0.5rem;
                }
            `}</style>
        </div>
    );
}
