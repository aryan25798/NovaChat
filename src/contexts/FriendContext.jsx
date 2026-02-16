import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
    subscribeToFriends,
    subscribeToIncomingRequests,
    subscribeToOutgoingRequests,
    sendFriendRequest,
    cancelFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend
} from "../services/friendService";

const FriendContext = createContext();

export function useFriend() {
    return useContext(FriendContext);
}

export function FriendProvider({ children }) {
    const { currentUser } = useAuth();
    const [friends, setFriends] = useState([]);
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); // Track which action is in progress

    useEffect(() => {
        if (!currentUser?.uid) {
            setFriends([]);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        let friendsLoaded = false;
        let incomingLoaded = false;
        let outgoingLoaded = false;

        const checkAllLoaded = () => {
            if (friendsLoaded && incomingLoaded && outgoingLoaded) {
                setLoading(false);
            }
        };

        const unsubFriends = subscribeToFriends(currentUser.uid, (data) => {
            setFriends(prev => {
                if (prev.length === data.length && prev[0]?.id === data[0]?.id) return prev;
                return data;
            });
            friendsLoaded = true;
            checkAllLoaded();
        });
        const unsubIncoming = subscribeToIncomingRequests(currentUser.uid, (data) => {
            setIncomingRequests(prev => {
                if (prev.length === data.length && prev[0]?.id === data[0]?.id) return prev;
                return data;
            });
            incomingLoaded = true;
            checkAllLoaded();
        });
        const unsubOutgoing = subscribeToOutgoingRequests(currentUser.uid, (data) => {
            setOutgoingRequests(prev => {
                if (prev.length === data.length && prev[0]?.id === data[0]?.id) return prev;
                return data;
            });
            outgoingLoaded = true;
            checkAllLoaded();
        });

        // Safety timeout to clear loading if Firestore is slow/fails
        const timeout = setTimeout(() => {
            if (!friendsLoaded || !incomingLoaded || !outgoingLoaded) {
                console.warn("[FriendContext] Safety timeout reached, clearing loading state.");
                setLoading(false);
            }
        }, 5000);

        return () => {
            unsubFriends();
            unsubIncoming();
            unsubOutgoing();
            clearTimeout(timeout);
        };
    }, [currentUser?.uid]);

    // Send Friend Request
    const sendRequest = useCallback(async (toUserId) => {
        if (!currentUser?.uid) throw new Error("You must be logged in.");
        if (friends.includes(toUserId)) throw new Error("Already friends.");
        if (actionLoading) return; // Prevent double-click

        setActionLoading(`send-${toUserId}`);
        try {
            await sendFriendRequest(currentUser.uid, currentUser, toUserId);
        } finally {
            setActionLoading(null);
        }
    }, [currentUser, friends, actionLoading]);

    // Accept Request
    const acceptRequest = useCallback(async (request) => {
        if (!currentUser?.uid || !request?.id) throw new Error("Invalid request.");
        if (actionLoading) return;

        setActionLoading(`accept-${request.id}`);
        try {
            await acceptFriendRequest(request.id, request.from, currentUser.uid);
        } finally {
            setActionLoading(null);
        }
    }, [currentUser, actionLoading]);

    // Reject Request
    const rejectRequest = useCallback(async (requestId) => {
        if (!requestId) throw new Error("Invalid request ID.");
        if (actionLoading) return;

        setActionLoading(`reject-${requestId}`);
        try {
            await rejectFriendRequest(requestId);
        } finally {
            setActionLoading(null);
        }
    }, [actionLoading]);

    // Cancel Request
    const cancelRequest = useCallback(async (requestId) => {
        if (!requestId) throw new Error("Invalid request ID.");
        if (actionLoading) return;

        setActionLoading(`cancel-${requestId}`);
        try {
            await cancelFriendRequest(requestId);
        } finally {
            setActionLoading(null);
        }
    }, [actionLoading]);

    // Unfriend
    const unfriend = useCallback(async (friendId) => {
        if (!currentUser?.uid || !friendId) throw new Error("Invalid parameters.");
        if (actionLoading) return;

        setActionLoading(`unfriend-${friendId}`);
        try {
            await removeFriend(currentUser.uid, friendId);
        } finally {
            setActionLoading(null);
        }
    }, [currentUser, actionLoading]);

    // Helper to check status
    const getFriendStatus = useCallback((targetUserId) => {
        if (friends.includes(targetUserId)) return "friend";
        if (outgoingRequests.some(r => r.to === targetUserId)) return "sent";
        if (incomingRequests.some(r => r.from === targetUserId)) return "received";
        return "none";
    }, [friends, outgoingRequests, incomingRequests]);

    const value = React.useMemo(() => ({
        friends,
        incomingRequests,
        outgoingRequests,
        sendRequest,
        cancelRequest,
        acceptRequest,
        rejectRequest,
        unfriend,
        getFriendStatus,
        loading,
        actionLoading
    }), [friends, incomingRequests, outgoingRequests, sendRequest, cancelRequest,
        acceptRequest, rejectRequest, unfriend, getFriendStatus, loading, actionLoading]);

    return (
        <FriendContext.Provider value={value}>
            {children}
        </FriendContext.Provider>
    );
}
