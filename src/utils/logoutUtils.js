import { terminate } from "firebase/firestore";
import { db } from "../firebase";

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
 * @param {Object} dbInstance - Firestore database instance (unused, kept for API compat)
 * @returns {Promise<void>}
 */
export async function clearAllCaches(dbInstance) {
    clearAllStorage();
    await clearServiceWorkerCaches();
    await unregisterServiceWorkers();
}

/**
 * Clears app-specific storage AND Firebase Auth persistence.
 * AGGRESSIVE CLEANUP: Wipes everything to ensure a clean slate.
 */
export function clearAllStorage() {
    try {
        // 1. Clear LocalStorage (Everything, including Firebase tokens)
        localStorage.clear();

        // 2. Clear SessionStorage
        sessionStorage.clear();

        console.debug('Browser storage WIPED completely.');
    } catch (err) {
        console.debug('Storage clear error:', err);
    }
}

/**
 * Clears Service Worker Caches
 */
export async function clearServiceWorkerCaches() {
    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
            console.debug('Service Worker Caches cleared.');
        } catch (e) {
            console.warn('Failed to clear SW caches:', e);
        }
    }
}

/**
 * Unregisters all Service Workers
 */
export async function unregisterServiceWorkers() {
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
            console.debug('Service Workers unregistered.');
        } catch (e) {
            console.warn('Failed to unregister SW:', e);
        }
    }
}

/**
 * PERFORM HARD RESET
 * Wipes everything: Storage, Service Workers, IndexedDB, and reloading.
 */
export async function hardReset() {
    console.log("⚠️ STARTING HARD RESET ⚠️");

    // 0. Terminate Firestore to release DB locks
    try {
        await terminate(db);
        console.log("Firestore terminated.");
    } catch (e) {
        console.warn("Firestore termination warning:", e);
    }

    // 1. Clear SWs
    await unregisterServiceWorkers();
    await clearServiceWorkerCaches();

    // 2. Clear Storage
    clearAllStorage();

    // 3. Clear IndexedDB (Native)
    const dbsToDelete = [
        'firebase-heartbeat-database',
        'firebaseLocalStorageDb',
        'firestore/[DEFAULT]/[DEFAULT]/main',
        'firebase-messaging-database'
    ];

    // Try to find all DBs if possible (Chrome only)
    if (window.indexedDB && window.indexedDB.databases) {
        try {
            const dbs = await window.indexedDB.databases();
            dbs.forEach(idbInfo => {
                if (!dbsToDelete.includes(idbInfo.name)) dbsToDelete.push(idbInfo.name);
            });
        } catch (e) {
            console.warn("Could not list databases:", e);
        }
    }

    const deletePromises = dbsToDelete.map(name => {
        return new Promise((resolve) => {
            if (!name) return resolve();
            const req = window.indexedDB.deleteDatabase(name);
            req.onsuccess = () => {
                console.log(`Deleted DB: ${name}`);
                resolve();
            };
            req.onerror = () => {
                console.warn(`Failed to delete DB: ${name}`);
                resolve();
            };
            req.onblocked = () => {
                console.warn(`DB Delete Blocked: ${name} - Please close other tabs.`);
                resolve();
            };
        });
    });

    await Promise.all(deletePromises);

    console.log("✅ HARD RESET COMPLETE. Reloading...");
    window.location.href = '/login';
}

// Expose to global scope for easy access
if (typeof window !== 'undefined') {
    window.hardReset = hardReset;
}
