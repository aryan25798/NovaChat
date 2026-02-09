import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { rtdb, auth, db } from "../firebase";
import { ref, onValue, onDisconnect, set, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { doc, updateDoc, serverTimestamp as firestoreServerTimestamp } from "firebase/firestore"; // Sync to Firestore for querying
import { useAuth } from "./AuthContext";

const PresenceContext = createContext();

export function usePresence() {
    return useContext(PresenceContext);
}

export function PresenceProvider({ children }) {
    const { currentUser } = useAuth();
    const [isOnline, setIsOnline] = useState(false);

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

        const unsubscribe = onValue(connectedRef, async (snapshot) => {
            if (snapshot.val() === false) {
                return;
            }

            // If we are currently connected, we add a listener to set us as offline if we lose connection
            await onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase);

            // We set our status to online
            set(userStatusDatabaseRef, isOnlineForDatabase);

            // OPTIONAL: Sync to Firestore for "God Mode" query capabilities (since querying RTDB is harder)
            // We debounce this to avoid writing to Firestore on every disconnect flick
            // THROTTLE: Max 1 write per 10 seconds to save costs/avoid hot spots
            const lastUpdate = Number(sessionStorage.getItem('last_presence_update') || 0);
            const now = Date.now();

            if (now - lastUpdate > 10000) {
                updateDoc(userStatusFirestoreRef, {
                    isOnline: true,
                    lastSeen: firestoreServerTimestamp()
                }).catch(e => console.warn("Firestore online sync failed", e));
                sessionStorage.setItem('last_presence_update', now);
            }
        });

        // Sync offline status to Firestore on window unload (best effort)
        const handleUnload = () => {
            updateDoc(userStatusFirestoreRef, {
                isOnline: false,
                lastSeen: firestoreServerTimestamp()
            });
        };
        window.addEventListener("beforeunload", handleUnload);

        return () => {
            unsubscribe();
            window.removeEventListener("beforeunload", handleUnload);
            // We don't manually set offline here because onDisconnect handles it on the server side
            // and we might just be navigating pages (which shouldn't flicker offline)
        };
    }, [currentUser?.uid]);


    // Real-time hook for a specific user's presence
    const getUserPresence = (userId, callback) => {
        if (!userId) return () => { };

        const userStatusRef = ref(rtdb, '/status/' + userId);
        const unsubscribe = onValue(userStatusRef, (snapshot) => {
            const data = snapshot.val();
            callback(data || { state: 'offline', last_changed: null });
        });

        return unsubscribe;
    };

    return (
        <PresenceContext.Provider value={{ getUserPresence }}>
            {children}
        </PresenceContext.Provider>
    );
}
