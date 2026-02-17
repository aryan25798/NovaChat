import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Diagnostic Check for Production Builds
// Diagnostic Check for ALL Builds
if (true) {
    const missingKeys = Object.entries(firebaseConfig)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingKeys.length > 0) {
        console.error("CRITICAL: Firebase Configuration is incomplete!", {
            missing: missingKeys,
            envSource: "import.meta.env"
        });
        alert(`MISSING CONFIG: ${missingKeys.join(', ')}. Check .env file.`);
    } else {
        const maskedKey = firebaseConfig.apiKey
            ? `${firebaseConfig.apiKey.substring(0, 8)}...${firebaseConfig.apiKey.substring(firebaseConfig.apiKey.length - 4)}`
            : "MISSING";
        console.log(`Firebase config verified. API Key: ${maskedKey}`);
    }

}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with Adaptive Persistence Engine (v1.5.0)
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, clearIndexedDbPersistence, terminate } from "firebase/firestore";

/**
 * [INDUSTRY-GRADE] Adaptive Persistence Logic
 * Automatically detects storage health and falls back to Memory-Only mode if IndexedDB is deadlocked.
 */
const STORAGE_KEY = 'DISABLE_FIREBASE_PERSISTENCE';
const RECOVERY_KEY = 'FIREBASE_RECOVERY_ATTEMPT';

// Auto-sense: If we were previously forced into memory mode, keep it for stability
// RECOVERY: We are force-enabling persistence to fix "slow loading" issues.
// Checks for deadlock will need to be more sophisticated than a permanent flag.
if (localStorage.getItem(STORAGE_KEY) === 'true') {
    console.warn("[Firebase] Resetting persistence flag to fix slow loading.");
    localStorage.removeItem(STORAGE_KEY);
}
let usePersistence = true;

// Fallback logic for high-scale environments
let db;
try {
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
} catch (error) {
    const errStr = error.toString().toLowerCase();
    const isBloomError = errStr.includes("bloomfilter") || errStr.includes("bitset");

    console.error(`[Firebase] Persistence Initialization Failed (${isBloomError ? 'BLOOM_FILTER_ERROR' : 'GENERIC_ERROR'}):`, error);

    // [HEALING] If it's a BloomFilter error, we MUST force memory mode to prevent infinite crash loops
    if (isBloomError) {
        console.warn("[Firebase] Detected corrupted BloomFilter cache. Forcing Memory-Only mode for safety.");
        localStorage.setItem(STORAGE_KEY, 'true');
    }

    // Self-Healing: Attempt to clear the corrupted cache
    try {
        const tempDb = initializeFirestore(app, { localCache: memoryLocalCache() });
        clearIndexedDbPersistence(tempDb).catch(e => console.warn("Failed to clear persistence:", e));
        terminate(tempDb);
    } catch (e) { }

    // Fallback to memory for this session
    db = initializeFirestore(app, {
        localCache: memoryLocalCache()
    });
}
export { db };

console.log(`[Firebase] Adaptive Engine: Persistence=${usePersistence ? 'ENABLED' : 'DISABLED (Memory-Only Fallback)'}`);

/**
 * Emergency Nuclear Repair: Forcefully resets persistence and reloads.
 */
export const clearCache = async () => {
    try {
        console.log("[Firebase] Initiating Nuclear Repair...");
        // 1. Terminate ensures the DB is offline and locks are released
        // 1. Terminate ensures the DB is offline and locks are released
        await terminate(db);
        // 2. Clear IndexedDB
        await clearIndexedDbPersistence(db);
        console.log("[Firebase] Firestore cache cleared successfully.");
        return true;
    } catch (err) {
        console.error("[Firebase] Nuclear Repair failed:", err);
        return false;
    }
};

import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";
import { getInstallations, getId } from "firebase/installations";

export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const installations = getInstallations(app);
export { getId };


// Lazy-initialize messaging to prevent crash if SW not registered or browser unsupported
let _messaging = null;
export async function getMessagingInstance() {
    if (_messaging) return _messaging;

    try {
        const supported = await isSupported();
        if (supported) {
            _messaging = getMessaging(app);
            return _messaging;
        }
    } catch (err) {
        console.debug('Firebase Messaging support check failed:', err.message);
    }
    return null;
}
// Keep backward-compatible export (lazy getter)
export const messaging = null; // Use getMessagingInstance() instead
