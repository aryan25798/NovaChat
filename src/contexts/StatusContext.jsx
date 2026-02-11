import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useFriend } from "./FriendContext";
import { subscribeToMyStatus, subscribeToRecentUpdates, postStatus } from "../services/statusService";

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

    // 2. Subscribe to Friends' Statuses
    useEffect(() => {
        if (!currentUser || !friends) return;

        // friends is an array of UIDs from FriendContext
        const unsubscribe = subscribeToRecentUpdates(currentUser.uid, friends, (data) => {
            // data matches { recent: [...], viewed: [...] }
            // For now, StatusPage combines them or handles them separately. 
            // The original logic expected a single list for 'Recent updates'.
            setStatuses([...data.recent, ...data.viewed]);
        });

        return unsubscribe;
    }, [currentUser, friends]);

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
