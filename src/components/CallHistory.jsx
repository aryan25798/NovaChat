import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { listenerManager } from "../utils/ListenerManager";
import { BsTelephone, BsCameraVideo, BsArrowDownLeft, BsArrowUpRight } from "react-icons/bs";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { format } from "date-fns";

export default function CallHistory() {
    const [history, setHistory] = useState([]);
    const { currentUser } = useAuth();
    const { startCall } = useCall();

    useEffect(() => {
        if (!currentUser) return;

        // Fetch last 20 calls where user is caller OR receiver
        // Firestore OR queries are cleaner now but let's stick to separate subscriptions and merge client-side for simplicity/speed
        const q1 = query(collection(db, "calls"), where("callerId", "==", currentUser.uid), limit(20));
        const q2 = query(collection(db, "calls"), where("receiverId", "==", currentUser.uid), limit(20));

        const outListenerKey = `call-history-out-${currentUser.uid}`;
        const inListenerKey = `call-history-in-${currentUser.uid}`;

        const unsub1 = onSnapshot(q1, (snap) => {
            const out = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), direction: 'outgoing' }));
            merge(out, 'out');
        }, (error) => {
            listenerManager.handleListenerError(error, 'CallHistoryOutgoing');
        });

        const unsub2 = onSnapshot(q2, (snap) => {
            const inc = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), direction: 'incoming' }));
            merge(inc, 'inc');
        }, (error) => {
            listenerManager.handleListenerError(error, 'CallHistoryIncoming');
        });

        listenerManager.subscribe(outListenerKey, unsub1);
        listenerManager.subscribe(inListenerKey, unsub2);

        let outgoing = [];
        let incoming = [];

        const merge = (data, type) => {
            if (type === 'out') outgoing = data;
            if (type === 'inc') incoming = data;

            const all = [...outgoing, ...incoming].sort((a, b) =>
                (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)
            );
            setHistory(all.slice(0, 30));
        };

        return () => {
            listenerManager.unsubscribe(outListenerKey);
            listenerManager.unsubscribe(inListenerKey);
        };
    }, [currentUser]);

    const formatCallTime = (ts) => {
        if (!ts) return "";
        const date = ts.toDate();
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return format(date, 'HH:mm');
        }
        return format(date, 'MMM d, HH:mm');
    };

    const formatDuration = (seconds) => {
        if (!seconds) return "";
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) return `${mins}m ${secs}s`;
        return `${secs}s`;
    };

    const handleCallAction = (item, type) => {
        const otherUser = item.direction === 'outgoing'
            ? { uid: item.receiverId, displayName: item.receiverName || "User", photoURL: item.receiverPhoto }
            : { uid: item.callerId, displayName: item.callerName, photoURL: item.callerPhoto };

        startCall(otherUser, type);
    };

    if (history.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="bg-muted p-4 rounded-full mb-4">
                    <BsTelephone className="w-8 h-8 opacity-50" />
                </div>
                <p>No recent calls</p>
                <p className="text-xs mt-1">Start a call from your contacts list.</p>
            </div>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            <div className="max-w-3xl mx-auto w-full">
                {history.map(item => {
                    const isMissed = item.status === 'missed' || (item.status === 'ringing' && item.direction === 'incoming');
                    const isOutgoing = item.direction === 'outgoing';
                    const otherName = isOutgoing ? item.receiverName : item.callerName;
                    const otherPhoto = isOutgoing ? item.receiverPhoto : item.callerPhoto;

                    return (
                        <div key={item.id} className="flex items-center gap-4 p-3 hover:bg-surface-elevated transition-all rounded-xl cursor-pointer group mb-1 border border-transparent hover:border-border/30 hover:shadow-sm">
                            <Avatar src={otherPhoto} alt={otherName} size="md" />

                            <div className="flex-1 min-w-0">
                                <h3 className={`font-medium truncate text-[16px] ${isMissed ? 'text-red-500' : 'text-text-1'}`}>
                                    {otherName || "Unknown User"}
                                </h3>
                                <div className="flex items-center gap-1.5 text-[13px] text-text-2 mt-0.5">
                                    {isOutgoing ? (
                                        <BsArrowUpRight className="text-green-500 w-3.5 h-3.5" />
                                    ) : (
                                        <BsArrowDownLeft className={`${isMissed ? 'text-red-500' : 'text-green-500'} w-3.5 h-3.5`} />
                                    )}
                                    <span>{formatCallTime(item.timestamp)}</span>
                                    {item.duration > 0 && <span className="opacity-60">• {formatDuration(item.duration)}</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/10 rounded-full w-10 h-10" onClick={() => handleCallAction(item, 'audio')}>
                                    <BsTelephone className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
