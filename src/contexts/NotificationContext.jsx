import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getMessagingInstance, db, auth, installations, getId } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { PresenceContext } from './PresenceContext';
import { subscribeToNotifications, markNotificationAsRead } from '../services/notificationService';
import { toast } from 'react-hot-toast';

const NotificationContext = createContext();

export function useNotification() {
    return useContext(NotificationContext);
}

// Global circuit breaker (persists across component remounts in SPA navigation)
let globalFcmErrorBackoff = false;

// Session-level backoff to survive refreshes if the error is persistent
const SESSION_BACKOFF_KEY = 'nova_fcm_backoff_active';

export function NotificationProvider({ children }) {
    const { currentUser } = useAuth();
    const [token, setToken] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const permissionRequested = useRef(false);
    const tokenAcquisitionActive = useRef(false);

    // 1. Permission & Token Logic
    const requestPermission = useCallback(async (options = {}) => {
        const { force = false } = options;
        const now = Date.now();
        const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
        const LAST_ATTEMPT_KEY = 'nova_fcm_last_attempt';

        console.log(`[FCM-Flow] Initiating registration check (Force: ${force})`);

        // Check Notification Permission early
        if (typeof window !== 'undefined' && 'Notification' in window) {
            console.log(`[FCM-Flow] Current Permission State: ${Notification.permission}`);
        }

        // Guard: Check global and session backoff (DISABLED PER USER REQUEST TO FIND ROOT CAUSE)
        /*
        const isSessionBlocked = sessionStorage.getItem(SESSION_BACKOFF_KEY) === 'true';
        if (globalFcmErrorBackoff || isSessionBlocked) {
            console.warn("FCM setup suppressed by Circuit Breaker (Internal Server Error detected earlier).");
            return;
        }
        */

        // Guard: Throttle repeated attempts across refreshes (Bypassed if force=true)
        if (!force) {
            const lastAttempt = parseInt(localStorage.getItem(LAST_ATTEMPT_KEY) || "0");
            if (now - lastAttempt < THROTTLE_MS) {
                console.log("[FCM-Flow] Throttled. Use 'Force' to override.");
                return;
            }
        }

        // Guard: Check VAPID key
        const SCREENSHOT_VAPID_KEY = "BDozLQFlNkKcjwrBmRNpnyP-7NfxaGFzMzc5wF7Y_D5ManDv2ltkDscYseE24fjSPJ24adNDPI1664v7tSiKFmY";
        let rawVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        let isFallback = false;

        if (!rawVapidKey || rawVapidKey === 'REPLACE_ME' || rawVapidKey.length < 20) {
            console.warn("[FCM-Flow] VAPID key missing from env. Using screenshot fallback.");
            rawVapidKey = SCREENSHOT_VAPID_KEY;
            isFallback = true;
        }

        console.log(`[FCM-Flow] VAPID Key status: ${isFallback ? 'Fallback' : 'Injected'} (Len: ${rawVapidKey?.length})`);
        console.log(`[FCM-Flow] Project ID: ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`);

        // Helper to convert Base64 VAPID to Uint8Array
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }

        // Guard: Prevent parallel/repeated calls in same component lifecycle (Bypassed if force=true)
        if (!force && (permissionRequested.current || tokenAcquisitionActive.current)) return;
        permissionRequested.current = true;
        tokenAcquisitionActive.current = true;

        if (force) {
            console.log("[FCM-Flow] FORCE mode active. Performing state cleanup...");
            permissionRequested.current = false;
            tokenAcquisitionActive.current = false;

            // Clear FCM/Installation specific IndexedDB
            try {
                const dbs = await window.indexedDB.databases();
                for (const d of dbs) {
                    if (d.name.includes('firebase-messaging') || d.name.includes('firebase-installations')) {
                        console.log(`[FCM-Flow] Deleting DB: ${d.name}`);
                        window.indexedDB.deleteDatabase(d.name);
                    }
                }
            } catch (e) {
                console.warn("[FCM-Flow] DB Nuke failed:", e.message);
            }
        }

        console.log(`[FCM-Flow] Project ID: ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`);
        try {
            const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || "MISSING";
            console.log(`[FCM-Flow] API Identity: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);
        } catch (e) { }

        // Mark attempt time
        localStorage.setItem(LAST_ATTEMPT_KEY, now.toString());

        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                console.warn("[FCM-Flow] Push Notifications not supported in this browser.");
                tokenAcquisitionActive.current = false;
                return;
            }

            const rawPermission = await Notification.requestPermission();
            console.log(`[FCM-Flow] Permission result: ${rawPermission}`);

            if (rawPermission === 'granted') {
                const msg = await getMessagingInstance();
                if (!msg) {
                    console.error("[FCM-Flow] Failed to initialize Firebase Messaging instance.");
                    tokenAcquisitionActive.current = false;
                    return;
                }

                // Standardized SW Path
                const swPath = '/firebase-messaging-sw.js';
                console.log(`[FCM-Flow] Registering SW: ${swPath}`);
                const swRegistration = await navigator.serviceWorker.register(swPath, { scope: '/' });

                // Wait for SW to be fully active
                if (!swRegistration.active) {
                    console.log("[FCM-Flow] Waiting for SW activation...");
                    await new Promise((resolve) => {
                        const check = () => {
                            if (swRegistration.active) resolve();
                            else {
                                const t = swRegistration.installing || swRegistration.waiting;
                                if (t) t.addEventListener('statechange', (e) => { if (e.target.state === 'activated') resolve(); });
                                setTimeout(check, 200);
                            }
                        };
                        check();
                    });
                }

                if (swRegistration.active) {
                    swRegistration.active.onerror = (e) => console.error("[FCM-Flow] SW Active Error:", e);
                }

                // DIAGNOSTIC: Get FID
                try {
                    const fid = await getId(installations);
                    console.log(`[FCM-Flow] Installation ID (FID): ${fid}`);
                } catch (fidErr) {
                    console.error("[FCM-Flow] FID Retrieval Failed:", fidErr);
                }

                console.log("[FCM-Flow] SW Active. Requesting Token...");

                // ATTEMPT TOKEN ACQUISITION
                let currentToken = null;
                let retries = 3;

                while (retries > 0) {
                    try {
                        console.log(`[FCM-Flow] getToken Attempt ${4 - retries}...`);

                        // DIAGNOSTIC: Verify internal SDK state
                        try {
                            const config = msg.app.options;
                            console.log(`[FCM-Flow] SDK Runtime Config:`, {
                                projId: config.projectId,
                                senderId: config.messagingSenderId,
                                appId: config.appId?.substring(0, 15) + "..."
                            });
                        } catch (e) { }

                        // Use string key with trimming and explicit SW registration
                        currentToken = await getToken(msg, {
                            vapidKey: rawVapidKey.trim(),
                            serviceWorkerRegistration: swRegistration
                        });

                        if (currentToken) {
                            console.log("[FCM-Flow] TOKEN ACQUIRED SUCCESSFULLY!");
                            console.groupCollapsed("FCM Token Payload");
                            console.log(currentToken);
                            console.groupEnd();
                            break;
                        }
                    } catch (e) {
                        retries--;
                        console.error("[FCM-Flow] getToken Failure:", e.message || e);
                        if (retries === 0) throw e;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                if (currentToken && currentUser?.uid) {
                    setToken(currentToken);
                    if (auth.currentUser?.uid === currentUser.uid) {
                        const userRef = doc(db, "users", currentUser.uid);
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists()) {
                            const currentTokens = userSnap.data().fcmTokens || [];

                            // SCALABILITY HARDENING: Prune tokens to prevent document bloat
                            // We keep the 5 most recent tokens.
                            let updatedTokens = [...new Set([currentToken, ...currentTokens])];
                            if (updatedTokens.length > 5) {
                                updatedTokens = updatedTokens.slice(0, 5);
                            }

                            console.log("[FCM-Flow] Syncing pruned tokens to Firestore");
                            await updateDoc(userRef, {
                                fcmTokens: updatedTokens
                            });
                        }
                    }
                }
            } else {
                console.warn("[FCM-Flow] Permission NOT granted.");
            }
        } catch (error) {
            const errStr = error.toString();
            console.warn("[FCM-Flow] Setup Error:", error);

            // Catch 500, 429, or persistent errors to trip circuit breaker
            if (errStr.includes('500') || errStr.includes('429') || errStr.includes('Quota exceeded')) {
                console.group("FCM CRITICAL ERROR");
                console.error("FCM Error (Circuit Breaker Activated):", errStr);
                console.groupEnd();

                globalFcmErrorBackoff = true; // Trip global breaker
                sessionStorage.setItem(SESSION_BACKOFF_KEY, 'true'); // Trip session breaker
            }
        } finally {
            tokenAcquisitionActive.current = false;
        }
    }, [currentUser?.uid]); // Only recreate if user changes

    const resetCircuitBreaker = useCallback(() => {
        globalFcmErrorBackoff = false;
        sessionStorage.removeItem(SESSION_BACKOFF_KEY);
        permissionRequested.current = false;
        tokenAcquisitionActive.current = false;
        requestPermission();
    }, [requestPermission]);

    useEffect(() => {
        // Reset guard if user identity fundamentally changes
        if (currentUser?.uid) {
            requestPermission();
        }
    }, [currentUser?.uid]);

    // 2. Foreground FCM Messages (Optimized)
    const { activeChatId } = React.useContext(PresenceContext) || {};
    const activeChatIdRef = useRef(activeChatId);

    // Keep ref in sync
    useEffect(() => {
        activeChatIdRef.current = activeChatId;
    }, [activeChatId]);

    useEffect(() => {
        const initMessagingListener = async () => {
            const msg = await getMessagingInstance();
            if (!msg) return;

            // Notice we omit activeChatId from dependencies to avoid re-running this effect.
            // We use activeChatIdRef inside the callback.
            const unsubscribe = onMessage(msg, async (payload) => {
                console.log('Foreground Message:', payload);

                const incomingChatId = payload.data?.chatId;

                // Use the REF to check if suppressed
                if (incomingChatId && activeChatIdRef.current === incomingChatId) {
                    console.log("Suppressed foreground notification (Active Chat):", incomingChatId);
                    return;
                }

                if (incomingChatId && currentUser) {
                    const chatRef = doc(db, "chats", incomingChatId);
                    const chatSnap = await getDoc(chatRef);
                    if (chatSnap.exists()) {
                        const isMuted = chatSnap.data().mutedBy?.[currentUser.uid];
                        if (isMuted) return;
                    }
                }

                toast(payload.notification.body, {
                    icon: '🔔',
                    duration: 4000,
                    position: 'top-center',
                    style: { background: '#333', color: '#fff' }
                });
            });
            return unsubscribe;
        };

        const cleanupPromise = initMessagingListener();
        return () => {
            cleanupPromise.then(unsubscribe => {
                if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
            });
        };
    }, [currentUser?.uid]); // Only depend on User UID, not activeChatId

    // 3. Firestore Notifications (New)
    useEffect(() => {
        if (!currentUser) return;

        const unsubscribe = subscribeToNotifications(currentUser.uid, (data) => {
            setNotifications(data);
            const unread = data.filter(n => !n.isRead).length;
            setUnreadCount(unread);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const markAsRead = useCallback(async (id) => {
        await markNotificationAsRead(id);
    }, []);

    const value = useMemo(() => ({
        token,
        notifications,
        unreadCount,
        markAsRead,
        requestPermission,
        resetCircuitBreaker
    }), [token, notifications, unreadCount, markAsRead, requestPermission, resetCircuitBreaker]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
