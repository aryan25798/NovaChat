import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getMessagingInstance, db, auth } from '../firebase';
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
    const requestPermission = useCallback(async () => {
        const now = Date.now();
        const THROTTLE_MS = 5 * 60 * 1000; // 5 minutes
        const LAST_ATTEMPT_KEY = 'nova_fcm_last_attempt';

        // Guard: Check global and session backoff (DISABLED PER USER REQUEST TO FIND ROOT CAUSE)
        /*
        const isSessionBlocked = sessionStorage.getItem(SESSION_BACKOFF_KEY) === 'true';
        if (globalFcmErrorBackoff || isSessionBlocked) {
            console.warn("FCM setup suppressed by Circuit Breaker (Internal Server Error detected earlier).");
            return;
        }
        */

        // Guard: Throttle repeated attempts across refreshes (Relaxed for debugging)
        const lastAttempt = parseInt(localStorage.getItem(LAST_ATTEMPT_KEY) || "0");
        if (now - lastAttempt < 5000) { // 5 seconds instead of 5 minutes
            return;
        }

        // Guard: Check VAPID key
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey || vapidKey === 'REPLACE_ME') {
            console.warn("FCM setup skipped: Missing or invalid VAPID key.");
            return;
        }

        // Guard: Prevent parallel/repeated calls in same component lifecycle
        if (permissionRequested.current || tokenAcquisitionActive.current) return;
        permissionRequested.current = true;
        tokenAcquisitionActive.current = true;

        // Mark attempt time
        localStorage.setItem(LAST_ATTEMPT_KEY, now.toString());

        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                tokenAcquisitionActive.current = false;
                return;
            }

            const rawPermission = await Notification.requestPermission();

            if (rawPermission === 'granted') {
                const sw = await navigator.serviceWorker.ready;
                // EXTRA ROBUST: Wait for the SW to be 'activated' if it's currently installing or waiting
                // This prevents "Registration failed - storage error"
                const registration = sw.active ? sw : await new Promise((resolve) => {
                    const checkState = () => {
                        if (sw.active) resolve(sw);
                        else setTimeout(checkState, 100);
                    };
                    checkState();
                });

                if (!registration) {
                    tokenAcquisitionActive.current = false;
                    return;
                }

                const msg = await getMessagingInstance();
                if (!msg) {
                    tokenAcquisitionActive.current = false;
                    return;
                }

                // ATTEMPT TOKEN ACQUISITION (With Explicit SW Registration)
                let currentToken = null;
                let retries = 3;

                // Ensure sw.js is the one used for FCM
                const swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                await navigator.serviceWorker.ready;

                while (retries > 0) {
                    try {
                        console.log(`[FCM] getToken Attempt ${4 - retries}...`);

                        // Ensure auth token is fresh/available using the raw SDK user
                        if (auth.currentUser) {
                            await auth.currentUser.getIdToken(true);
                        }

                        currentToken = await getToken(msg, {
                            vapidKey: vapidKey,
                            serviceWorkerRegistration: swRegistration
                        });
                        if (currentToken) {
                            console.log("[FCM] Token acquired successfully!");
                            break;
                        }
                    } catch (e) {
                        retries--;
                        console.error("[FCM] getToken Failure Details:", {
                            message: e.message,
                            code: e.code,
                            stack: e.stack,
                            full: e
                        });
                        if (retries === 0) throw e;
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                if (currentToken) {
                    setToken(currentToken);
                    if (currentUser?.uid && (!currentUser.fcmTokens || !currentUser.fcmTokens.includes(currentToken))) {
                        await updateDoc(doc(db, "users", currentUser.uid), {
                            fcmTokens: arrayUnion(currentToken)
                        });
                    }
                }
            }
        } catch (error) {
            const errStr = error.toString();
            const isCredentialError = errStr.includes('401') || errStr.includes('credential') || errStr.includes('authentication') || errStr.includes('missing-project-id');

            if (isCredentialError) {
                console.group("FCM CREDENTIAL ERROR DETECTED");
                console.warn("[FCM] 401/Auth error encountered. Nuking stale registrations...");

                try {
                    // NUKE: Unregister ALL service workers to clear stale FCM subscriptions
                    if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (let reg of registrations) {
                            console.log("[FCM] Unregistering:", reg.scope);
                            await reg.unregister();
                        }
                    }

                    // Clear FCM IndexedDB purely
                    try {
                        const dbs = ['fcm_token_details_db', 'firebase-messaging-store'];
                        for (const dbName of dbs) {
                            console.log(`[FCM] Deleting IndexedDB: ${dbName}`);
                            window.indexedDB.deleteDatabase(dbName);
                        }
                    } catch (e) { console.warn("[FCM] DB clear failed:", e); }
                    // Clear storage markers
                    localStorage.removeItem('nova_fcm_last_attempt');
                    sessionStorage.removeItem(SESSION_BACKOFF_KEY);
                    globalFcmErrorBackoff = false;

                    console.log("[FCM] Nuke complete. A page refresh is REQUIRED to recover.");
                    toast.error("Notification sync issue. Please refresh the page to fix.", { duration: 6000 });
                } catch (nukeErr) {
                    console.error("[FCM] Nuke failed:", nukeErr);
                }
                console.groupEnd();
            }
            // Catch 500, 429, or persistent errors to trip circuit breaker
            else if (errStr.includes('500') || errStr.includes('429') || errStr.includes('Quota exceeded')) {
                console.group("FCM CRITICAL ERROR");
                console.error("FCM Error (Circuit Breaker Activated):", errStr);
                console.groupEnd();

                globalFcmErrorBackoff = true; // Trip global breaker
                sessionStorage.setItem(SESSION_BACKOFF_KEY, 'true'); // Trip session breaker
            } else if (error.name === 'AbortError' || errStr.includes('push service')) {
                // Ignore harmless aborts
            } else {
                console.warn("FCM Setup Error:", error);
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
