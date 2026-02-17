import { rtdb, db } from "../firebase";
import { ref, set, onValue, off, serverTimestamp, push, onChildAdded, remove, onDisconnect } from "firebase/database";

/**
 * LightningSyncService
 * Provides sub-100ms signaling for typing, delivery status, and instant delivery.
 */
class LightningSyncService {
    constructor() {
        this.listeners = new Map();
        this.lastTypingState = new Map(); // State cache to prevent redundant writes
        this.disconnectRefs = new Set(); // Tracks registered onDisconnect handlers
    }

    // --- TYPING INDICATORS (RTDB is 10x faster than Firestore for this) ---
    setTyping(chatId, userId, isTyping) {
        if (!chatId || !userId || chatId.startsWith('gemini_')) return;

        const cacheKey = `${chatId}-${userId}`;
        if (this.lastTypingState.get(cacheKey) === isTyping) return; // Skip if same as last state

        try {
            const typingRef = ref(rtdb, `chats/${chatId}/typing/${userId}`);
            this.lastTypingState.set(cacheKey, isTyping);

            if (isTyping) {
                set(typingRef, serverTimestamp()).catch(e => {
                    if (e.code !== 'PERMISSION_DENIED' && !e.message?.includes('permission_denied')) {
                        console.warn("[RTDB Typing] Error:", e);
                    }
                });

                // Ensure indicator is cleared if user disconnects (Set only once)
                if (!this.disconnectRefs.has(cacheKey)) {
                    onDisconnect(typingRef).set(null);
                    this.disconnectRefs.add(cacheKey);
                }
            } else {
                set(typingRef, null).catch(e => {
                    if (e.code !== 'PERMISSION_DENIED' && !e.message?.includes('permission_denied')) {
                        console.warn("[RTDB Typing] Error:", e);
                    }
                });
            }
        } catch (e) {
            console.warn("[RTDB Typing] Catch:", e);
        }
    }

    subscribeToTyping(chatId, callback) {
        if (!chatId) return () => { };
        const typingRef = ref(rtdb, `chats/${chatId}/typing`);
        // onValue returns the unsubscribe function directly in Modular SDK
        const unsubscribe = onValue(typingRef, (snapshot) => {
            const data = snapshot.val() || {};
            const activeTypers = Object.entries(data)
                .filter(([_, ts]) => ts && (Date.now() - ts < 10000))
                .map(([uid]) => uid);
            callback(activeTypers);
        }, (error) => {
            console.warn("[RTDB Typing Sub] Error:", error);
        });
        return unsubscribe;
    }

    // --- INSTANT DELIVERY SIGNALING (Optimized v1.5.0) ---
    sendInstantSignal(chatId, senderId, messageId, text) {
        if (!chatId || !senderId || !messageId || chatId.startsWith('gemini_')) return;
        try {
            const signalRef = ref(rtdb, `chats/${chatId}/signals/${messageId}`);
            set(signalRef, {
                s: senderId,   // s = senderId
                t: text?.substring(0, 1000) || "", // t = text
                ts: serverTimestamp() // ts = timestamp
            }).catch(e => console.warn("[RTDB Signal] Failed:", e.message));

            setTimeout(() => {
                try { remove(signalRef); } catch (e) { }
            }, 5000);
        } catch (e) {
            console.warn("[RTDB Signal] Error:", e);
        }
    }

    subscribeToSignals(chatId, callback) {
        if (!chatId) return () => { };
        const signalsRef = ref(rtdb, `chats/${chatId}/signals`);
        // onChildAdded returns the unsubscribe function directly
        const unsubscribe = onChildAdded(signalsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Remap short keys to app-logic keys
                callback({
                    messageId: snapshot.key,
                    senderId: data.s,
                    text: data.t,
                    timestamp: data.ts
                });
            }
        }, (error) => {
            console.warn("[RTDB Signals Sub] Error:", error);
        });

        return () => {
            unsubscribe();
        };
    }

    // --- STATUS UPDATES (Ticks) ---
    updateStatusSignal(chatId, messageId, status) {
        if (!chatId || !messageId) return;
        try {
            const statusRef = ref(rtdb, `chats/${chatId}/status/${messageId}`);
            set(statusRef, status).catch(e => console.warn("[RTDB Status] Failed:", e.message));
            // Ticks are ephemeral signals, cleanup after 30s
            setTimeout(() => {
                try { remove(statusRef); } catch (e) { }
            }, 30000);
        } catch (e) {
            console.warn("[RTDB Status] Error:", e);
        }
    }

    subscribeToStatusSignals(chatId, callback) {
        if (!chatId) return () => { };
        const statusRef = ref(rtdb, `chats/${chatId}/status`);
        // onValue returns the unsubscribe function directly
        const unsubscribe = onValue(statusRef, (snapshot) => {
            callback(snapshot.val() || {});
        }, (error) => {
            console.warn("[RTDB Status Sub] Error:", error);
        });
        return unsubscribe;
    }

    cleanup(chatId) {
        const typing = this.listeners.get(`typing-${chatId}`);
        if (typing) off(typing.ref, "value", typing.listener);
    }
}

export const lightningSync = new LightningSyncService();
