import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getMessagingInstance, db } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { subscribeToNotifications, markNotificationAsRead } from '../services/notificationService';
import { toast } from 'react-hot-toast';

const NotificationContext = createContext();

export function useNotification() {
    return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
    const { currentUser } = useAuth();
    const [token, setToken] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const permissionRequested = useRef(false); // Prevent StrictMode double-invoke

    // 1. Permission & Token Logic
    const requestPermission = async () => {
        // Guard against React StrictMode double-invocation
        if (permissionRequested.current) return;
        permissionRequested.current = true;

        try {
            const rawPermission = await Notification.requestPermission();

            if (rawPermission === 'granted') {
                let registration = await navigator.serviceWorker.getRegistration();
                if (!registration) {
                    registration = await navigator.serviceWorker.ready;
                }

                if (!registration) {
                    console.warn("No Service Worker registration found — push notifications disabled.");
                    return;
                }

                const msg = getMessagingInstance();
                if (!msg) {
                    console.debug('Firebase Messaging not available — push notifications disabled.');
                    return;
                }

                const currentToken = await getToken(msg, {
                    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                    serviceWorkerRegistration: registration
                });

                if (currentToken) {
                    setToken(currentToken);
                    const existingTokens = currentUser?.fcmTokens || [];
                    if (!existingTokens.includes(currentToken)) {
                        await updateDoc(doc(db, "users", currentUser.uid), {
                            fcmTokens: arrayUnion(currentToken)
                        });
                    }
                }
            }
        } catch (error) {
            // Push service errors are expected in localhost dev — silently ignore
            if (error.name === 'AbortError' || error.message?.includes('push service')) {
                // Silent in dev: FCM push can't register on localhost
                if (import.meta.env.PROD) console.warn("Push service unavailable:", error.message);
            } else {
                console.error("Notification permission error:", error);
            }
        }
    };

    useEffect(() => {
        // Wait for the FULL user profile to be loaded from Firestore (not just auth uid).
        // AuthContext sets currentUser with Firestore fields (like createdAt) AFTER
        // the user doc is created/synced. This prevents the race condition where
        // we try to updateDoc before the user doc exists.
        if (currentUser?.uid && currentUser?.createdAt) {
            permissionRequested.current = false; // Reset on user change
            requestPermission();
        }
    }, [currentUser?.uid, currentUser?.createdAt]);

    // 2. Foreground FCM Messages (Existing)
    useEffect(() => {
        const msg = getMessagingInstance();
        if (!msg) return; // Messaging not available yet

        const unsubscribe = onMessage(msg, async (payload) => {
            console.log('Foreground Message:', payload);

            const chatId = payload.data?.chatId;
            if (chatId && currentUser) {
                const chatRef = doc(db, "chats", chatId);
                const chatSnap = await getDoc(chatRef);
                if (chatSnap.exists()) {
                    const isMuted = chatSnap.data().mutedBy?.[currentUser.uid];
                    if (isMuted) {
                        console.log("Suppressed notification for muted chat:", chatId);
                        return; // Don't show toast or notify
                    }
                }
            }

            // Show toast or UI alert
            toast(payload.notification.body, {
                icon: '🔔',
                duration: 4000
            });

            new Notification(payload.notification.title, {
                body: payload.notification.body,
                icon: '/whatsapp-icon.png'
            });
        });
        return unsubscribe;
    }, []);

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
        requestPermission
    }), [token, notifications, unreadCount, markAsRead, requestPermission]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}
