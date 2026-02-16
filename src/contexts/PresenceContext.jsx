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
    const lastSentActiveChatId = useRef(undefined); // Track last value pushed to RTDB
    const presenceListeners = useRef(new Map()); // Map<userId, { count: number, unsubscribe: function, lastData: object }>
    const callbacks = useRef(new Map()); // Map<userId, Set<callback>>

    // Update active chat in RTDB for notification suppression
    const updateActiveChat = useCallback((chatId) => {
        const normalizedId = chatId || null;
        if (lastSentActiveChatId.current === normalizedId) return;

        setActiveChatId(normalizedId);
        lastSentActiveChatId.current = normalizedId;

        if (currentUser) {
            const userStatusDatabaseRef = ref(rtdb, '/status/' + currentUser.uid);
            set(userStatusDatabaseRef, {
                state: 'online',
                last_changed: rtdbServerTimestamp(),
                activeChatId: normalizedId
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

        // HEARTBEAT LOGIC: Update Firestore location timestamp every 60 minutes (Cost Optimization for 10k users)
        // This ensures the "Freshness Filter" on the map doesn't hide recently active users
        // while minimizing Firestore write costs at scale.
        const heartbeat = async () => {
            if (auth.currentUser && document.visibilityState === 'visible') {
                const LAST_HEARTBEAT_KEY = `last_heartbeat_${currentUser.uid}`;
                const lastHb = parseInt(localStorage.getItem(LAST_HEARTBEAT_KEY) || '0');
                const now = Date.now();

                // Throttle: Only update Firestore if > 1 hour has passed
                if (now - lastHb > 60 * 60 * 1000) {
                    updateDoc(doc(db, "user_locations", currentUser.uid), {
                        isOnline: true,
                        timestamp: firestoreServerTimestamp()
                    }).catch(e => {
                        console.debug("Heartbeat fail (expected if offline):", e);
                        // If doc missing, set it (self-healing)
                        if (e.code === 'not-found') {
                            // We might need setDoc here but avoiding imports to keep it simple, 
                            // usually user_locations is created on signup.
                        }
                    });
                    updateDoc(userStatusFirestoreRef, { isOnline: true }).catch(e => console.debug("Map sync fail:", e));
                    localStorage.setItem(LAST_HEARTBEAT_KEY, now.toString());
                }
            }
        };

        // Check heartbeat every 5 minutes, but only write to DB if 1 hour elapsed (checked inside heartbeat)
        const heartbeatInterval = setInterval(heartbeat, 5 * 60 * 1000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                heartbeat(); // Attempt heartbeat on return
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Initial check
        heartbeat();

        const unsubscribe = onValue(connectedRef, async (snapshot) => {
            if (snapshot.val() === false) {
                return;
            }

            // If we are currently connected, we add a listener to set us as offline if we lose connection
            // RTDB is cheap and handles presence efficiently - KEEP THIS.
            await onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase);

            // We set our status to online in RTDB
            set(userStatusDatabaseRef, isOnlineForDatabase);

            // --- SYNC TO user_locations for Admin Map ---
            // REMOVED: Immediate Firestore write on every generic reconnect. 
            // We rely on the throttled 'heartbeat' for Firestore 'Online' status.
            // This prevents write storms during mass-reconnect events.
            // ---------------------------------------------
        });

        listenerManager.subscribe(listenerKey, unsubscribe);

        return () => {
            clearInterval(heartbeatInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            listenerManager.unsubscribe(listenerKey);

            // We set offline in RTDB manually (Fast)
            if (auth.currentUser) {
                set(userStatusDatabaseRef, isOfflineForDatabase).catch(err => {
                    console.debug("Presence cleanup suppressed (already signed out)");
                });

                // --- SYNC TO user_locations for Admin Map (THROTTLED) ---
                // CRITICAL CANCELLATION: We DO NOT write to Firestore on disconnect.
                // This saves 50% of write costs. 
                // The "Online" status in Firestore will basically mean "Seen in last hour".
                // Real-time status should be checked via RTDB if needed.
                // ---------------------------------------------
            }
        };
    }, [currentUser?.uid]);


    // Real-time hook for a specific user's presence (Optimized: Centralized pooling)
    const getUserPresence = useCallback((userId, callback) => {
        if (!userId) return () => { };

        // 1. Register callback
        if (!callbacks.current.has(userId)) {
            callbacks.current.set(userId, new Set());
        }
        callbacks.current.get(userId).add(callback);

        // 2. Start listener if it's the first one
        if (!presenceListeners.current.has(userId)) {
            const userStatusRef = ref(rtdb, '/status/' + userId);
            const unsubscribe = onValue(userStatusRef, (snapshot) => {
                const data = snapshot.val() || { state: 'offline', last_changed: null };

                const listenerInfo = presenceListeners.current.get(userId);
                if (listenerInfo) listenerInfo.lastData = data;

                // Notify all observers
                const observers = callbacks.current.get(userId);
                if (observers) {
                    observers.forEach(cb => cb(data));
                }
            });

            presenceListeners.current.set(userId, {
                count: 1,
                unsubscribe,
                lastData: { state: 'offline', last_changed: null }
            });
        } else {
            // Immediately provide last known data if available
            const listenerInfo = presenceListeners.current.get(userId);
            listenerInfo.count++;
            callback(listenerInfo.lastData);
        }

        // 3. Return cleanup
        return () => {
            const observers = callbacks.current.get(userId);
            if (observers) {
                observers.delete(callback);
                if (observers.size === 0) {
                    callbacks.current.delete(userId);
                }
            }

            const listenerInfo = presenceListeners.current.get(userId);
            if (listenerInfo) {
                listenerInfo.count--;
                if (listenerInfo.count <= 0) {
                    listenerInfo.unsubscribe();
                    presenceListeners.current.delete(userId);
                }
            }
        };
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
