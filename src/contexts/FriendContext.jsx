import React, { createContext, useContext, useState, useEffect } from "react";
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
    const [friends, setFriends] = useState([]); // List of friend UIDs
    const [incomingRequests, setIncomingRequests] = useState([]);
    const [outgoingRequests, setOutgoingRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setFriends([]);
            setIncomingRequests([]);
            setOutgoingRequests([]);
            setLoading(false);
            return;
        }

        const unsubFriends = subscribeToFriends(currentUser.uid, setFriends);
        const unsubIncoming = subscribeToIncomingRequests(currentUser.uid, setIncomingRequests);
        const unsubOutgoing = subscribeToOutgoingRequests(currentUser.uid, setOutgoingRequests);

        setLoading(false);

        return () => {
            unsubFriends();
            unsubIncoming();
            unsubOutgoing();
        };
    }, [currentUser]);

    // Send Friend Request
    const sendRequest = async (toUserId) => {
        if (friends.includes(toUserId)) return;
        await sendFriendRequest(currentUser.uid, currentUser, toUserId);
    };

    // Accept Request
    const acceptRequest = async (request) => {
        await acceptFriendRequest(request.id, request.from, currentUser.uid);
    };

    // Helper to check status
    const getFriendStatus = (targetUserId) => {
        if (friends.includes(targetUserId)) return "friend";
        if (outgoingRequests.some(r => r.to === targetUserId)) return "sent";
        if (incomingRequests.some(r => r.from === targetUserId)) return "received";
        return "none";
    };

    const value = {
        friends,
        incomingRequests,
        outgoingRequests,
        sendRequest,
        cancelRequest: cancelFriendRequest, // Directly map to service
        acceptRequest,
        rejectRequest: rejectFriendRequest, // Directly map to service
        unfriend: (friendId) => removeFriend(currentUser.uid, friendId),
        getFriendStatus,
        loading
    };

    return (
        <FriendContext.Provider value={value}>
            {children}
        </FriendContext.Provider>
    );
}
