import { rtdb, db } from "../firebase";
import { ref, set, onValue, off, serverTimestamp, push, onChildAdded, remove } from "firebase/database";

/**
 * LightningSyncService
 * Provides sub-100ms signaling for typing, delivery status, and instant delivery.
 */
class LightningSyncService {
    constructor() {
        this.listeners = new Map();
    }

    // --- TYPING INDICATORS (RTDB is 10x faster than Firestore for this) ---
    setTyping(chatId, userId, isTyping) {
        if (!chatId || !userId || chatId.startsWith('gemini_')) return;
        try {
            const typingRef = ref(rtdb, `chats/${chatId}/typing/${userId}`);
            set(typingRef, isTyping ? serverTimestamp() : null).catch(e => {
                // Ignore 403s on typing as they aren't critical
                if (e.code !== 'PERMISSION_DENIED') console.warn("[RTDB Typing] Error:", e);
            });
        } catch (e) {
            console.warn("[RTDB Typing] Catch:", e);
        }
    }

    subscribeToTyping(chatId, callback) {
        if (!chatId) return () => { };
        const typingRef = ref(rtdb, `chats/${chatId}/typing`);
        const listener = onValue(typingRef, (snapshot) => {
            const data = snapshot.val() || {};
            const activeTypers = Object.entries(data)
                .filter(([_, ts]) => ts && (Date.now() - ts < 10000))
                .map(([uid]) => uid);
            callback(activeTypers);
        }, (error) => {
            console.warn("[RTDB Typing Sub] Error:", error);
        });
        return () => off(typingRef, "value", listener);
    }

    // --- INSTANT DELIVERY SIGNALING ---
    sendInstantSignal(chatId, senderId, messageId, text) {
        if (!chatId || !senderId || !messageId || chatId.startsWith('gemini_')) return;
        try {
            const signalRef = ref(rtdb, `chats/${chatId}/signals/${messageId}`);
            set(signalRef, {
                senderId,
                text: text?.substring(0, 50) || "",
                timestamp: serverTimestamp()
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
        const listener = onChildAdded(signalsRef, (snapshot) => {
            callback(snapshot.val());
        }, (error) => {
            console.warn("[RTDB Signals Sub] Error:", error);
        });
        return () => off(signalsRef, "child_added", listener);
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
        const listener = onValue(statusRef, (snapshot) => {
            callback(snapshot.val() || {});
        }, (error) => {
            console.warn("[RTDB Status Sub] Error:", error);
        });
        return () => off(statusRef, "value", listener);
    }

    cleanup(chatId) {
        const typing = this.listeners.get(`typing-${chatId}`);
        if (typing) off(typing.ref, "value", typing.listener);
    }
}

export const lightningSync = new LightningSyncService();
