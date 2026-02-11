/**
 * Centralized Firestore Listener Manager
 * 
 * Provides:
 * - Automatic error handling for all listeners
 * - Bulk cleanup on logout
 * - Memory leak prevention
 * - Consistent permission error handling
 */

class ListenerManager {
    constructor() {
        this.listeners = new Map();
        this.isShuttingDown = false;
    }

    /**
     * Register a listener with the manager
     * @param {string} key - Unique identifier for this listener
     * @param {Function} unsubscribe - The unsubscribe function from onSnapshot
     */
    subscribe(key, unsubscribe) {
        // Unsubscribe existing listener with same key if it exists
        if (this.listeners.has(key)) {
            const existing = this.listeners.get(key);
            existing();
        }
        this.listeners.set(key, unsubscribe);
    }

    /**
     * Unsubscribe a specific listener
     * @param {string} key - The listener key to unsubscribe
     */
    unsubscribe(key) {
        const unsub = this.listeners.get(key);
        if (unsub) {
            try {
                unsub();
            } catch (error) {
                console.debug('Error unsubscribing listener:', key, error);
            }
            this.listeners.delete(key);
        }
    }

    /**
     * Unsubscribe all listeners (called during logout)
     */
    unsubscribeAll() {
        this.isShuttingDown = true;
        console.debug(`Cleaning up ${this.listeners.size} active listeners`);

        this.listeners.forEach((unsub, key) => {
            try {
                unsub();
            } catch (error) {
                console.debug('Error during bulk cleanup:', key, error);
            }
        });

        this.listeners.clear();
        this.isShuttingDown = false;
    }

    /**
     * Get count of active listeners (for debugging)
     */
    getActiveCount() {
        return this.listeners.size;
    }

    /**
     * Standard error handler for Firestore listeners
     * @param {Error} error - The error from Firestore
     * @param {string} context - Context for debugging
     */
    handleListenerError(error, context = 'Unknown') {
        if (this.isShuttingDown) {
            // Ignore all errors during shutdown
            return;
        }

        if (error.code === 'permission-denied') {
            // Expected during logout - log to debug only
            console.debug(`[${context}] Permission denied (expected during logout)`);
        } else if (error.code === 'unavailable') {
            // Network issue - log to debug
            console.debug(`[${context}] Service unavailable (network issue)`);
        } else {
            // Unexpected error - log to console
            console.error(`[${context}] Listener error:`, error);
        }
    }
}

// Export singleton instance
export const listenerManager = new ListenerManager();

// For debugging in console
if (typeof window !== 'undefined') {
    window.__listenerManager = listenerManager;
}
