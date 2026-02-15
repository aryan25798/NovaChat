import React, { useState, useRef, useEffect } from "react";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { BsCamera, BsCheck } from "react-icons/bs";
import { IoArrowBack } from "react-icons/io5";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { uploadProfilePhoto, updateUserProfile } from "../services/authService";
import { motion } from "framer-motion";
import { clearCache } from "../firebase";
import { getIceServers } from "../contexts/CallContext";
import { toast } from "react-hot-toast";
import { useNotification } from "../contexts/NotificationContext";
import { FaBell } from "react-icons/fa";

const ProfilePage = () => {
    const { currentUser, deactivateAccount } = useAuth();
    const { requestPermission } = useNotification();
    const [name, setName] = useState(currentUser?.displayName || "");
    const [about, setAbout] = useState(currentUser?.about || "Hey there! I am using WhatsApp.");
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleSave = async () => {
        if (!currentUser) return;
        setSaving(true);
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                displayName: name,
                searchableName: name.toLowerCase(),
                about: about
            });
            setTimeout(() => setSaving(false), 500);
        } catch (error) {
            console.error("Error updating profile:", error);
            setSaving(false);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file || !currentUser) return;

        setUploading(true);
        try {
            await uploadProfilePhoto(currentUser.uid, file);
        } catch (err) {
            console.error("Error uploading photo:", err);
            alert("Failed to upload photo. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background md:max-w-md md:mx-auto md:border-x md:border-border">
            {/* Header */}
            <div className="flex items-center gap-2 xs:gap-4 p-4 bg-muted/30 border-b border-border sticky top-0 z-10 backdrop-blur-md">
                <Link to="/" className="text-primary hover:bg-muted p-2 rounded-full transition-colors">
                    <IoArrowBack className="w-5 h-5 xs:w-6 xs:h-6" />
                </Link>
                <h1 className="text-lg xs:text-xl font-semibold">Profile</h1>
            </div>

            {currentUser?.deletionRequested && (
                <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <div>
                        <h4 className="text-xs font-bold text-red-500 uppercase tracking-wide">Deletion Pending</h4>
                        <p className="text-[10px] text-muted-foreground">Your account is scheduled for removal. An admin will process this shortly.</p>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 xs:px-6 py-6 space-y-6 xs:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 no-scrollbar">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                    <div
                        className="relative group cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Avatar
                            src={currentUser?.photoURL}
                            alt="Profile"
                            className="h-32 w-32 xs:h-40 xs:w-40 border-4 border-background shadow-lg transition-transform active:scale-95"
                        />
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <BsCamera className="w-8 h-8 xs:w-10 xs:h-10 text-white mb-1" />
                            <span className="text-[10px] text-white font-bold">{uploading ? "UPLOADING..." : "CHANGE PHOTO"}</span>
                        </div>
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
                                <span className="animate-spin h-8 w-8 border-3 border-white rounded-full border-t-transparent" />
                            </div>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        hidden
                        accept="image/*"
                        onChange={handlePhotoUpload}
                    />
                </div>

                {/* Info Section */}
                <div className="space-y-6">
                    <div className="space-y-1">
                        <label className="text-[10px] xs:text-xs font-bold text-whatsapp-teal uppercase tracking-wider">Your Name</label>
                        <div className="flex items-center gap-2 border-b border-border pb-1 xs:pb-2 focus-within:border-whatsapp-teal transition-colors">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="border-none shadow-none px-0 text-base xs:text-lg focus-visible:ring-0 bg-transparent h-9 xs:h-11"
                                placeholder="Enter your name"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-muted/50 rounded-full transition-colors flex shrink-0">
                                {saving ? (
                                    <span className="animate-spin h-4 w-4 border-2 border-whatsapp-teal rounded-full border-t-transparent" />
                                ) : (
                                    <BsCheck className="text-whatsapp-teal w-5 h-5 xs:w-6 xs:h-6" />
                                )}
                            </div>
                        </div>
                        <p className="text-[10px] xs:text-[11px] text-muted-foreground leading-tight pt-1">
                            This is not your username or pin. This name will be visible to your WhatsApp contacts.
                        </p>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] xs:text-xs font-bold text-whatsapp-teal uppercase tracking-wider">About</label>
                        <div className="flex items-center gap-2 border-b border-border pb-1 xs:pb-2 focus-within:border-whatsapp-teal transition-colors">
                            <Input
                                value={about}
                                onChange={(e) => setAbout(e.target.value)}
                                className="border-none shadow-none px-0 text-[14px] xs:text-base focus-visible:ring-0 bg-transparent h-9 xs:h-11"
                                placeholder="Enter an status"
                            />
                            <div onClick={handleSave} className="cursor-pointer p-2 hover:bg-muted/50 rounded-full transition-colors flex shrink-0">
                                <BsCheck className="text-whatsapp-teal w-5 h-5 xs:w-6 xs:h-6" />
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 pb-10 border-t border-border mt-8 space-y-4">
                        <Button
                            variant="destructive"
                            className="w-full rounded-xl h-12 font-bold shadow-sm active:scale-95 transition-transform"
                            onClick={async () => {
                                if (window.confirm("REQUEST ACCOUNT DELETION? This will flag your account for permanent removal by an administrator and log you out. This action cannot be undone once processed.")) {
                                    try {
                                        setSaving(true);
                                        await deactivateAccount();
                                    } catch (e) {
                                        alert("Request failed: " + e.message);
                                        setSaving(false);
                                    }
                                }
                            }}
                            disabled={saving}
                        >
                            {saving ? "REQUESTING..." : "REQUEST ACCOUNT DELETION"}
                        </Button>

                        <div className="pt-4 border-t border-border space-y-3">
                            <button
                                onClick={() => {
                                    toast.loading("Testing FCM Registration...", { duration: 2000 });
                                    requestPermission({ force: true });
                                }}
                                className="w-full py-2.5 text-xs font-mono font-bold uppercase tracking-widest text-primary hover:text-white hover:bg-primary/80 transition-all rounded border border-dashed border-primary/50 flex items-center justify-center gap-2"
                            >
                                <FaBell className="text-sm" />
                                <span>Test Notifications (FCM)</span>
                            </button>
                            <SystemHealthAudit />
                            <div className="space-y-2 border-t border-border pt-4">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 px-1">Deep Repair Tools</p>
                                <RepairDatabaseButton />
                                <PersistenceBypassToggle />
                            </div>
                            <NetworkTestButton />
                        </div>
                    </div>

                    <p className="text-[10px] text-center text-muted-foreground mt-4 leading-relaxed uppercase tracking-widest font-bold opacity-50">
                        Nova Messaging v1.4.2<br />End-to-End Encrypted
                    </p>
                </div>
            </div>
        </div>
    );
};

const SystemHealthAudit = () => {
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState([]);
    const [showDebug, setShowDebug] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleStatus = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', handleStatus);
        window.addEventListener('offline', handleStatus);
        return () => {
            window.removeEventListener('online', handleStatus);
            window.removeEventListener('offline', handleStatus);
        };
    }, []);

    const runAudit = async () => {
        setIsRunning(true);
        const audit = [];

        // 0. Browser Online Check
        audit.push({ name: 'Browser', status: navigator.onLine ? 'pass' : 'fail', msg: navigator.onLine ? 'Online' : 'Global Offline' });

        // 1. Ad-blocker detection
        try {
            // Attempt to fetch a script that ad-blockers usually kill
            const res = await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', { mode: 'no-cors', cache: 'no-store' });
            audit.push({ name: 'Ad-Blocker', status: 'pass', msg: 'Network unblocked' });
        } catch (e) {
            audit.push({ name: 'Ad-Blocker', status: 'fail', msg: 'Google Ads domains blocked', error: e.message });
        }

        // 2. Firestore & Persistence Audit
        try {
            const { getDoc, doc } = await import('firebase/firestore');
            const { db } = await import('../firebase');

            // Check IndexedDB lock or Bypass
            const isBypassed = localStorage.getItem('DISABLE_FIREBASE_PERSISTENCE') === 'true';
            if (isBypassed) {
                audit.push({ name: 'Persistence', status: 'warn', msg: 'Isolated (Memory)' });
            } else {
                try {
                    const dbTest = await window.indexedDB.open('firebase-heartbeat', 1);
                    audit.push({ name: 'Persistence', status: 'pass', msg: 'Storage Healthy' });
                } catch (e) {
                    audit.push({ name: 'Persistence', status: 'warn', msg: 'DB Locked/Error' });
                }
            }

            await getDoc(doc(db, '_health_', 'ping'));
            audit.push({ name: 'Firestore', status: 'pass', msg: 'Server reachable' });
        } catch (e) {
            if (e.code === 'permission-denied' || e.message?.includes('permission')) {
                audit.push({ name: 'Firestore', status: 'pass', msg: 'Server reachable (Auth OK)' });
            } else {
                audit.push({ name: 'Firestore', status: 'fail', msg: 'Connection timeout', error: `${e.code}: ${e.message}` });
            }
        }

        // 3. Token Service (API Key Check)
        try {
            const { auth } = await import('../firebase');
            if (auth.currentUser) {
                await auth.currentUser.getIdToken(true);
                audit.push({ name: 'Token Service', status: 'pass', msg: 'Session valid' });
            } else {
                audit.push({ name: 'Token Service', status: 'warn', msg: 'Login required for test' });
            }
        } catch (e) {
            let msg = 'API Key restricted (400)';
            if (e.message?.includes('unauthorized') || e.code?.includes('unauthorized')) msg = 'Unauthorized Domain (400)';
            audit.push({ name: 'Token Service', status: 'fail', msg, error: e.message });
        }

        setResults(audit);
        setIsRunning(false);
    };

    return (
        <div className="space-y-2">
            <button
                onClick={runAudit}
                disabled={isRunning}
                className="w-full py-2.5 text-xs font-mono font-bold uppercase tracking-widest text-amber-600 hover:text-white hover:bg-amber-500/80 transition-all rounded border border-dashed border-amber-500/50 flex items-center justify-center gap-2"
            >
                {isRunning ? 'Auditing...' : 'System Health Audit (v1.4.1)'}
            </button>
            {!isOnline && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[9px] font-bold text-red-500 uppercase">Device is Offline</span>
                </div>
            )}
            {localStorage.getItem('DISABLE_FIREBASE_PERSISTENCE') === 'true' && (
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] text-amber-500 font-medium">Memory-Only Mode Active (Bypassing Storage)</span>
                </div>
            )}
            {results.length > 0 && (
                <div className="p-3 bg-muted/20 rounded-lg border border-border/50 space-y-2">
                    {results.map((r, i) => (
                        <div key={i} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-tight">
                                <span className="text-muted-foreground">{r.name}:</span>
                                <span className={r.status === 'pass' ? 'text-green-500' : r.status === 'warn' ? 'text-amber-500' : 'text-red-500'}>
                                    {r.msg}
                                </span>
                            </div>
                            {r.error && showDebug && (
                                <p className="text-[8px] text-red-400 font-mono break-all bg-red-500/5 p-1 rounded italic">{r.error}</p>
                            )}
                        </div>
                    ))}
                    <div className="flex justify-between items-center pt-1 border-t border-border/30">
                        <p className="text-[9px] text-muted-foreground italic">
                            * Red = Network interference or storage lock.
                        </p>
                        <button
                            onClick={() => setShowDebug(!showDebug)}
                            className="text-[8px] font-bold uppercase text-whatsapp-teal hover:underline"
                        >
                            {showDebug ? 'Hide Details' : 'Show Details'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const RepairDatabaseButton = () => {
    const [status, setStatus] = useState('idle');

    const handleRepair = async () => {
        if (!window.confirm("Nuclear Repair: This will terminate all active database connections and clear your local cache. The app will then reload. Continue?")) return;

        setStatus('terminating');
        const success = await clearCache();

        if (success) {
            setStatus('success');
            alert("Database repaired successfully. Reloading...");
            window.location.reload();
        } else {
            setStatus('error');
            alert("Repair failed. Please close all other tabs and try again.");
        }
    };

    return (
        <button
            onClick={handleRepair}
            disabled={status === 'terminating' || status === 'success'}
            className="w-full py-2 text-xs font-mono font-bold uppercase tracking-widest text-red-500/70 hover:text-red-500 hover:bg-red-500/5 transition-colors rounded border border-dashed border-red-500/30"
        >
            {status === 'terminating' ? 'TERMINATING & CLEARING...' :
                status === 'success' ? 'SUCCESS! RELOADING...' :
                    'NUCLEAR REPAIR (FORCE RESET CACHE)'}
        </button>
    );
};

const PersistenceBypassToggle = () => {
    const isBypassed = localStorage.getItem('DISABLE_FIREBASE_PERSISTENCE') === 'true';

    const handleToggle = () => {
        if (isBypassed) {
            localStorage.removeItem('DISABLE_FIREBASE_PERSISTENCE');
        } else {
            localStorage.setItem('DISABLE_FIREBASE_PERSISTENCE', 'true');
        }
        window.location.reload();
    };

    return (
        <button
            onClick={handleToggle}
            className={`w-full py-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors rounded border border-dashed ${isBypassed
                ? 'text-green-500 bg-green-500/5 border-green-500/30'
                : 'text-amber-500/70 hover:text-amber-500 hover:bg-amber-500/5 border-amber-500/30'
                }`}
        >
            {isBypassed ? 'DISABLE MEMORY-ONLY MODE' : 'ISolate storage (ENABLE MEMORY-ONLY)'}
        </button>
    );
};

const NetworkTestButton = () => {
    const [status, setStatus] = useState('idle'); // idle, testing, success, error
    const [log, setLog] = useState('');

    const runTest = async () => {
        setStatus('testing');
        setLog('Initializing...');

        try {
            // 1. Fetch Credentials
            const iceServers = await getIceServers();
            setLog('ICE servers obtained.');

            // 2. Create Peer Connection
            const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 1 });

            // 3. Must create data channel to trigger candidate gathering
            pc.createDataChannel("test");

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            return new Promise((resolve) => {
                let relayFound = false;
                let candidates = [];

                // Timeout after 10s
                const timeout = setTimeout(() => {
                    pc.close();
                    if (relayFound) {
                        setStatus('success');
                        setLog('Success: TURN Relay Candidate found.');
                        resolve();
                    } else {
                        setStatus('error');
                        setLog(`Timeout. Found: ${candidates.join(', ')}. No Relay.`);
                        resolve();
                    }
                }, 10000);

                pc.onicecandidate = (e) => {
                    if (e.candidate) {
                        candidates.push(e.candidate.type);
                        if (e.candidate.type === 'relay') {
                            relayFound = true;
                            clearTimeout(timeout);
                            pc.close();
                            setStatus('success');
                            setLog('Verified: High-Speed TURN Relay Active.');
                            resolve();
                        }
                    }
                };
            });

        } catch (error) {
            console.error(error);
            setStatus('error');
            setLog('Error: ' + error.message);
        }
    };

    return (
        <div className="w-full">
            <button
                onClick={runTest}
                disabled={status === 'testing' || status === 'success'}
                className="w-full py-2 text-xs font-mono font-bold uppercase tracking-widest text-whatsapp-teal/70 hover:text-whatsapp-teal hover:bg-whatsapp-teal/5 transition-colors rounded border border-dashed border-whatsapp-teal/30"
            >
                {status === 'testing' ? 'Testing Uplink...' : status === 'success' ? 'Network Secure' : 'Test Network (TURN)'}
            </button>
            {log && <p className={`text-[9px] mt-2 font-mono text-center ${status === 'success' ? 'text-green-500' : status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>{log}</p>}
        </div>
    );
};
export default ProfilePage;
