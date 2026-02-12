import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { getMessagingInstance, db } from '../firebase';
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

export function NotificationProvider({ children }) {
    const { currentUser } = useAuth();
    const [token, setToken] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const permissionRequested = useRef(false); // Prevent StrictMode double-invoke

    // 1. Permission & Token Logic
    const requestPermission = async () => {
        // Guard against any parallel or repeated calls in the same lifecycle
        if (permissionRequested.current) return;
        permissionRequested.current = true;

        try {
            // Check if browser even supports Notifications
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                return;
            }

            const rawPermission = await Notification.requestPermission();

            if (rawPermission === 'granted') {
                const registration = await navigator.serviceWorker.ready;
                if (!registration) {
                    console.warn("No Service Worker registration found.");
                    return;
                }

                const msg = await getMessagingInstance();
                if (!msg) return;

                const currentToken = await getToken(msg, {
                    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                    serviceWorkerRegistration: registration
                });

                if (currentToken) {
                    setToken(currentToken);
                    // Single update if token belongs to user
                    if (currentUser?.uid && (!currentUser.fcmTokens || !currentUser.fcmTokens.includes(currentToken))) {
                        await updateDoc(doc(db, "users", currentUser.uid), {
                            fcmTokens: arrayUnion(currentToken)
                        });
                    }
                }
            }
        } catch (error) {
            // Push service errors are common in non-standard environments
            if (error.message?.includes('push service') || error.name === 'AbortError') {
                console.debug("Push registration skipped:", error.message);
            } else {
                console.warn("Notification error:", error);
            }
        }
    };

    useEffect(() => {
        // Reset guard if user identity fundamentally changes
        if (currentUser?.uid) {
            requestPermission();
        }
    }, [currentUser?.uid]);

    // 2. Foreground FCM Messages (Existing)
    const { activeChatId } = React.useContext(PresenceContext) || {};

    useEffect(() => {
        const initMessagingListener = async () => {
            const msg = await getMessagingInstance();
            if (!msg) return; // Messaging not available yet

            const unsubscribe = onMessage(msg, async (payload) => {
                console.log('Foreground Message:', payload);

                const chatId = payload.data?.chatId;

                // WHATSAPP LOGIC: Suppress if user is looking at this chat
                if (chatId && activeChatId === chatId) {
                    console.log("Suppressed foreground notification (Active Chat):", chatId);
                    return;
                }

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

                // Show toast ONLY (No system notification in foreground)
                toast(payload.notification.body, {
                    icon: '🔔',
                    duration: 4000,
                    position: 'top-center',
                    style: {
                        background: '#333',
                        color: '#fff',
                    }
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
    }, [activeChatId, currentUser]);

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
