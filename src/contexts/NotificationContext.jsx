import React, { createContext, useContext, useEffect, useState } from 'react';
import { messaging, db } from '../firebase';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { subscribeToNotifications, markNotificationAsRead } from '../services/notificationService';
import { toast } from 'react-hot-toast'; // Assuming react-hot-toast or similar is used, or we can use standard alerts/custom UI

const NotificationContext = createContext();

export function useNotification() {
    return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
    const { currentUser } = useAuth();
    const [token, setToken] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    // 1. Permission & Token Logic (Existing)
    const requestPermission = async () => {
        try {
            console.log("Requesting notification permission...");
            const rawPermission = await Notification.requestPermission();
            console.log("Notification permission:", rawPermission);

            if (rawPermission === 'granted') {
                let registration = await navigator.serviceWorker.getRegistration();
                if (!registration) {
                    console.log("SW not found via getRegistration, waiting for ready...");
                    registration = await navigator.serviceWorker.ready;
                }

                if (!registration) {
                    console.error("No Service Worker registration found!");
                    return;
                }
                console.log("Using SW registration for FCM:", registration.scope);

                const currentToken = await getToken(messaging, {
                    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                    serviceWorkerRegistration: registration
                });

                if (currentToken) {
                    // Check if token already exists to prevent redundant writes/loops
                    const existingTokens = currentUser?.fcmTokens || [];
                    if (!existingTokens.includes(currentToken)) {
                        console.log("Updating token in Firestore for user:", currentUser.uid);
                        try {
                            await updateDoc(doc(db, "users", currentUser.uid), {
                                fcmTokens: arrayUnion(currentToken)
                            });
                            console.log("Token updated successfully.");
                        } catch (e) {
                            console.error("Token update failed:", e);
                        }
                    }
                } else {
                    console.warn("No FCM token returned. Check VAPID key and Firebase config.");
                }
            } else {
                console.warn("Notification permission NOT granted.");
            }
        } catch (error) {
            console.error("Notification permission error:", error);
        }
    };

    useEffect(() => {
        if (currentUser?.uid) {
            requestPermission();
        }
    }, [currentUser?.uid]);

    // 2. Foreground FCM Messages (Existing)
    useEffect(() => {
        const unsubscribe = onMessage(messaging, async (payload) => {
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

    const markAsRead = async (id) => {
        await markNotificationAsRead(id);
    };

    return (
        <NotificationContext.Provider value={{
            token,
            notifications,
            unreadCount,
            markAsRead,
            requestPermission
        }}>
            {children}
        </NotificationContext.Provider>
    );
}
