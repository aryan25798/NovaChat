import { clearIndexedDbPersistence } from "firebase/firestore";

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
            // Force cleanup even on timeout
            clearAllStorage();
        }
        throw error;
    }
}

/**
 * Clears all client-side caches and storage
 * @param {Object} db - Firestore database instance
 * @returns {Promise<void>}
 */
export async function clearAllCaches(db) {
    try {
        await clearIndexedDbPersistence(db);
        console.debug('Firestore cache cleared successfully');
    } catch (err) {
        // Expected errors:
        // - failed-precondition: Already cleared or network active
        // - invalid-argument: DB instance issue
        console.debug('Cache clear error (may already be cleared):', err.code);
    }

    clearAllStorage();
}

/**
 * Clears localStorage and sessionStorage
 */
export function clearAllStorage() {
    try {
        localStorage.clear();
        sessionStorage.clear();
        console.debug('Browser storage cleared successfully');
    } catch (err) {
        console.debug('Storage clear error:', err);
    }
}
