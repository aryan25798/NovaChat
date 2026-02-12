import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { rtdb, auth, db } from "../firebase";
import { ref, onValue, onDisconnect, set, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { doc, updateDoc, serverTimestamp as firestoreServerTimestamp } from "firebase/firestore"; // Sync to Firestore for querying
import { useAuth } from "./AuthContext";
import { listenerManager } from "../utils/ListenerManager";

export const PresenceContext = createContext();

export function usePresence() {
    return useContext(PresenceContext);
}

export function PresenceProvider({ children }) {
    const { currentUser } = useAuth();
    const [isOnline, setIsOnline] = useState(false);
    const [activeChatId, setActiveChatId] = useState(null);

    // Update active chat in RTDB for notification suppression
    const updateActiveChat = useCallback((chatId) => {
        setActiveChatId(chatId);
        if (currentUser) {
            const userStatusDatabaseRef = ref(rtdb, '/status/' + currentUser.uid);
            set(userStatusDatabaseRef, {
                state: 'online',
                last_changed: rtdbServerTimestamp(),
                activeChatId: chatId || null
            }).catch(e => console.debug("Active chat sync fail:", e));
        }
    }, [currentUser]);

    // Activity tracking to prevent "Online" when user is idle for too long?
    // For now, let's keep it simple: If the tab is open and connected, they are Online.
    // Enhanced: "Idle" status could be added later.

    useEffect(() => {
        if (!currentUser) return;

        const userStatusDatabaseRef = ref(rtdb, '/status/' + currentUser.uid);
        const userStatusFirestoreRef = doc(db, "users", currentUser.uid);

        const isOfflineForDatabase = {
            state: 'offline',
            last_changed: rtdbServerTimestamp(),
        };

        const isOnlineForDatabase = {
            state: 'online',
            last_changed: rtdbServerTimestamp(),
        };

        const connectedRef = ref(rtdb, '.info/connected');
        const listenerKey = `presence-${currentUser.uid}`;

        // HEARTBEAT LOGIC: Update Firestore location timestamp every 5 minutes
        // This ensures the "Freshness Filter" on the map doesn't hide active users.
        // OPTIMIZATION: Skip when tab is hidden to reduce Firestore writes
        const heartbeatInterval = setInterval(() => {
            if (auth.currentUser && document.visibilityState === 'visible') {
                updateDoc(doc(db, "user_locations", currentUser.uid), {
                    timestamp: firestoreServerTimestamp()
                }).catch(e => console.debug("Heartbeat fail:", e));
            }
        }, 300000); // 5 minutes (reduced from 3 min for cost savings)

        const unsubscribe = onValue(connectedRef, async (snapshot) => {
            if (snapshot.val() === false) {
                return;
            }

            // If we are currently connected, we add a listener to set us as offline if we lose connection
            await onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase);

            // We set our status to online
            set(userStatusDatabaseRef, isOnlineForDatabase);

            // --- SYNC TO user_locations for Admin Map ---
            updateDoc(userStatusFirestoreRef, { isOnline: true }).catch(e => console.debug("Map sync fail:", e));
            updateDoc(doc(db, "user_locations", currentUser.uid), {
                isOnline: true,
                timestamp: firestoreServerTimestamp()
            }).catch(e => console.debug("Location sync fail:", e));
            // ---------------------------------------------
        });

        listenerManager.subscribe(listenerKey, unsubscribe);

        return () => {
            clearInterval(heartbeatInterval);
            listenerManager.unsubscribe(listenerKey);
            // We set offline manually on unmount for immediate feedback, but only if still authenticated
            if (auth.currentUser) {
                set(userStatusDatabaseRef, isOfflineForDatabase).catch(err => {
                    console.debug("Presence cleanup suppressed (already signed out)");
                });

                // --- SYNC TO user_locations for Admin Map ---
                updateDoc(userStatusFirestoreRef, { isOnline: false }).catch(e => console.debug("Map sync fail:", e));
                updateDoc(doc(db, "user_locations", currentUser.uid), {
                    isOnline: false,
                    timestamp: firestoreServerTimestamp()
                }).catch(e => console.debug("Location sync fail:", e));
                // ---------------------------------------------
            }
        };
    }, [currentUser?.uid]);


    // Real-time hook for a specific user's presence
    const getUserPresence = useCallback((userId, callback) => {
        if (!userId) return () => { };

        const userStatusRef = ref(rtdb, '/status/' + userId);
        const unsubscribe = onValue(userStatusRef, (snapshot) => {
            const data = snapshot.val();
            callback(data || { state: 'offline', last_changed: null });
        });

        return unsubscribe;
    }, []);

    const value = useMemo(() => ({
        getUserPresence, updateActiveChat, activeChatId
    }), [getUserPresence, updateActiveChat, activeChatId]);

    return (
        <PresenceContext.Provider value={value}>
            {children}
        </PresenceContext.Provider>
    );
}
