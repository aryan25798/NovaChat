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
if (import.meta.env.PROD) {
    const missingKeys = Object.entries(firebaseConfig)
        .filter(([_, value]) => !value)
        .map(([key]) => key);

    if (missingKeys.length > 0) {
        console.error("CRITICAL: Firebase Configuration is incomplete!", {
            missing: missingKeys,
            envSource: "import.meta.env"
        });
    } else {
        console.log("Firebase config verified (PROD)");
    }
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore with persistence settings
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, clearIndexedDbPersistence } from "firebase/firestore";

export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

/**
 * Emergency Repair: Clears local Firestore cache
 * Use when experiencing "BloomFilterError" or stale data.
 */
export const clearCache = async () => {
    try {
        await clearIndexedDbPersistence(db);
        console.log("Firestore cache cleared successfully.");
        return true;
    } catch (err) {
        console.error("Failed to clear Firestore cache:", err);
        return false;
    }
};

import { getDatabase } from "firebase/database";
import { getFunctions } from "firebase/functions";

export const rtdb = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);


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
