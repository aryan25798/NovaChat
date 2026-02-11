/**
 * Wraps logout with timeout protection
 * @param {Function} logoutFn - The logout function to execute
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<void>}
 */
export async function logoutWithTimeout(logoutFn, timeoutMs = 10000) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Logout timeout')), timeoutMs)
    );

    try {
        await Promise.race([logoutFn(), timeoutPromise]);
    } catch (error) {
        if (error.message === 'Logout timeout') {
            console.error('Logout timed out - forcing cleanup');
            clearAllStorage();
        }
        throw error;
    }
}

/**
 * Clears all client-side caches and storage.
 * NOTE: clearIndexedDbPersistence is intentionally NOT used here.
 * It requires a fully terminated Firestore instance (terminate(db) first),
 * and calling it on a running instance corrupts the client state, causing
 * "Missing or insufficient permissions" on subsequent reads/writes.
 * disableNetwork + selective storage clearing is the production-grade pattern.
 * @param {Object} db - Firestore database instance (unused, kept for API compat)
 * @returns {Promise<void>}
 */
export async function clearAllCaches(db) {
    clearAllStorage();
}

/**
 * Clears app-specific storage while preserving Firebase Auth persistence.
 * SECURITY FIX: localStorage.clear() was destroying Firebase Auth tokens,
 * making re-login impossible. Now selectively clears non-Firebase keys.
 */
export function clearAllStorage() {
    try {
        // Selectively clear localStorage — preserve Firebase auth keys
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            // Firebase Auth persistence uses keys starting with 'firebase:'
            if (key && !key.startsWith('firebase:')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));

        // sessionStorage is safe to clear entirely
        sessionStorage.clear();
        console.debug(`Browser storage cleared (${keysToRemove.length} app keys removed, Firebase auth preserved)`);
    } catch (err) {
        console.debug('Storage clear error:', err);
    }
}
