import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from "react";
import { rtdb, auth, db } from "../firebase";
import { ref, onValue, onDisconnect, set, update, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
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

    // State for visibility to trigger re-renders/effects
    const [isVisible, setIsVisible] = useState(document.visibilityState === 'visible');

    // Update active chat state (called by ChatWindow)
    const updateActiveChat = useCallback((chatId) => {
        setActiveChatId(chatId || null);
    }, []);

    // Sync Active Chat to RTDB (Visibility Aware)
    useEffect(() => {
        if (!currentUser) return;

        const effectiveChatId = isVisible ? activeChatId : null;

        // Dedup: Don't write if same value
        if (lastSentActiveChatId.current === effectiveChatId) return;
        lastSentActiveChatId.current = effectiveChatId;

        const userStatusDatabaseRef = ref(rtdb, '/status/' + currentUser.uid);

        // Firestore Sync (Debounced ideally, but direct for now)
        // We only really care about Firestore for "Online" status usually, 
        // but syncing activeChatId there doesn't hurt if we want to debug.
        if (effectiveChatId) {
            updateDoc(doc(db, "users", currentUser.uid), { activeChatId: effectiveChatId }).catch(() => null);
        }

        const updates = { activeChatId: effectiveChatId };
        if (effectiveChatId) {
            updates.state = 'online';
            updates.last_changed = rtdbServerTimestamp();
        }

        update(userStatusDatabaseRef, updates).catch(e => console.debug("Active chat sync fail:", e));

    }, [currentUser, activeChatId, isVisible]);

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

        const heartbeat = async () => {
            if (auth.currentUser && document.visibilityState === 'visible') {
                const LAST_HEARTBEAT_KEY = `last_heartbeat_${currentUser.uid}`;
                const lastHb = parseInt(localStorage.getItem(LAST_HEARTBEAT_KEY) || '0');
                const now = Date.now();

                const updates = { activeChatId: activeChatId }; // Keep active chat alive
                update(userStatusDatabaseRef, updates).catch(() => { });

                if (now - lastHb > 60 * 60 * 1000) {
                    updateDoc(doc(db, "user_locations", currentUser.uid), {
                        isOnline: true,
                        timestamp: firestoreServerTimestamp()
                    }).catch(() => { });
                    updateDoc(userStatusFirestoreRef, { isOnline: true }).catch(() => { });
                    localStorage.setItem(LAST_HEARTBEAT_KEY, now.toString());
                }
            }
        };

        const heartbeatInterval = setInterval(heartbeat, 5 * 60 * 1000);

        const handleVisibilityChange = () => {
            const visible = document.visibilityState === 'visible';
            setIsVisible(visible); // Triggers the sync effect above which handles activeChatId logic
            if (visible) heartbeat();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        heartbeat();

        const unsubscribe = onValue(connectedRef, async (snapshot) => {
            if (snapshot.val() === false) return;

            // On Disconnect: Set offline (this nukes activeChatId implicitly if we used set, 
            // but we use update now? No, onDisconnect().set() replaces activeChatId with nothing?
            // Yes, isOfflineForDatabase only has state/last_changed. So activeChatId is removed. GOOD.
            await onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase);
            set(userStatusDatabaseRef, isOnlineForDatabase);
        });

        listenerManager.subscribe(listenerKey, unsubscribe);

        return () => {
            clearInterval(heartbeatInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            listenerManager.unsubscribe(listenerKey);

            if (auth.currentUser) {
                set(userStatusDatabaseRef, isOfflineForDatabase).catch(() => { });
            }
        };
    }, [currentUser?.uid]); // Reduced dependencies to avoid re-subscription loop



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
