import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useFriend } from "./FriendContext";
import { subscribeToMyStatus, subscribeToStatusFeed, syncStatuses, postStatus } from "../services/statusService";

const StatusContext = createContext();

export function useStatus() {
    return useContext(StatusContext);
}

export function StatusProvider({ children }) {
    const [statuses, setStatuses] = useState([]);
    const [myStatus, setMyStatus] = useState(null);
    const { currentUser } = useAuth();
    const friendContext = useFriend();
    const friends = friendContext ? friendContext.friends : [];

    // 1. Subscribe to My Status
    useEffect(() => {
        if (!currentUser) {
            setMyStatus(null);
            return;
        }

        const unsubscribe = subscribeToMyStatus(currentUser.uid, (data) => {
            if (data) {
                // Formatting for UI consistency
                setMyStatus({
                    user: currentUser,
                    statuses: data.items.map(item => ({
                        ...item,
                        timestamp: { toDate: () => (item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp)) }
                    }))
                });
            } else {
                setMyStatus(null);
            }
        });

        return unsubscribe;
    }, [currentUser]);

    // 2. Subscribe to Friends' Status Feed (Efficient Single Listener)
    const statusesRef = React.useRef(statuses);

    // Keep ref in sync for the callback
    useEffect(() => {
        statusesRef.current = statuses;
    }, [statuses]);

    const lastSyncTimeRef = React.useRef(0);
    const syncTimeoutRef = React.useRef(null);

    useEffect(() => {
        if (!currentUser) return;

        const performSync = async () => {
            // Throttling: Don't sync more than once every 30 seconds (Scale optimized)
            const now = Date.now();
            if (now - lastSyncTimeRef.current < 30000) {
                // If a sync is requested during cooldown, schedule it for later if not already scheduled
                if (!syncTimeoutRef.current) {
                    syncTimeoutRef.current = setTimeout(() => {
                        syncTimeoutRef.current = null;
                        performSync();
                    }, 30000 - (now - lastSyncTimeRef.current));
                }
                return;
            }

            lastSyncTimeRef.current = now;
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
            }

            try {
                const knownState = {};
                statusesRef.current.forEach(s => {
                    const ts = s.lastUpdated?.toMillis ? s.lastUpdated.toMillis() : (new Date(s.lastUpdated || 0).getTime());
                    knownState[s.userId] = ts;
                });

                const syncResult = await syncStatuses(knownState);
                const updates = syncResult?.updates || [];

                if (updates.length > 0) {
                    setStatuses(prev => {
                        const newMap = new Map(prev.map(s => [s.userId, s]));
                        updates.forEach(u => newMap.set(u.userId, u));
                        return Array.from(newMap.values()).sort((a, b) => {
                            const getTs = (s) => s.lastUpdated?.toMillis ? s.lastUpdated.toMillis() : new Date(s.lastUpdated || 0).getTime();
                            return getTs(b) - getTs(a);
                        });
                    });
                }
            } catch (e) {
                console.debug("Sync yielded error (suppressed by UI):", e.message);
            }
        };

        // A. Initial Sync
        performSync();

        // B. Listen to Feed Signals
        const unsubscribe = subscribeToStatusFeed(currentUser.uid, (signalMap) => {
            // Signal received! Trigger throttled sync.
            performSync();
        });

        return () => {
            unsubscribe();
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [currentUser?.uid]);

    const addStatus = useCallback(async (type, content, background = null) => {
        if (!currentUser) return;
        await postStatus(currentUser, type, content, "", background);
    }, [currentUser]);

    const value = useMemo(() => ({
        statuses,
        myStatus,
        addStatus
    }), [statuses, myStatus, addStatus]);

    return (
        <StatusContext.Provider value={value}>
            {children}
        </StatusContext.Provider>
    );
}
