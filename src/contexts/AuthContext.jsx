import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import { auth, googleProvider, db, functions } from "../firebase";
import { signInWithPopup, getRedirectResult, signOut, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, onSnapshot } from "firebase/firestore";
import { listenerManager } from "../utils/ListenerManager";
import { logoutWithTimeout, clearAllCaches } from "../utils/logoutUtils";
import Loading from "../components/ui/Loading";

const AuthContext = React.createContext();

export function useAuth() {
    return useContext(AuthContext);
}

// Helper for timed-out getDoc
async function getGetDocWithTimeout(docRef, timeoutMs = 5000) {
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), timeoutMs)
    );
    try {
        return await Promise.race([getDoc(docRef), timeoutPromise]);
    } catch (e) {
        if (e.message === 'FIRESTORE_TIMEOUT') {
            console.warn("Firestore getDoc timed out, using fallback.");
            return { exists: () => false, data: () => ({}) };
        }
        throw e;
    }
}

// Map Firebase error codes to user-friendly messages
function getAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/popup-closed-by-user':
            return 'Sign-in was cancelled. Please try again.';
        case 'auth/popup-blocked':
            return 'Pop-up was blocked by your browser. Please allow pop-ups for this site.';
        case 'auth/cancelled-popup-request':
            return null; // Silent — user clicked again before first popup resolved
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection and try again.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment and try again.';
        case 'auth/user-disabled':
            return 'This account has been disabled. Contact support.';
        case 'auth/account-exists-with-different-credential':
            return 'An account already exists with this email using a different sign-in method.';
        case 'auth/invalid-credential':
            return 'Invalid credentials. Please try again.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        default:
            return 'Something went wrong. Please try again.';
    }
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const userDocUnsubscribeRef = useRef(null);
    const isLoggingOutRef = useRef(false);

    const updateUserLocation = async (uid, userDataOverride = null) => {
        if (!navigator.geolocation) return;

        try {
            const userRef = doc(db, "users", uid);
            const userSnap = userDataOverride ? { exists: () => true, data: () => userDataOverride } : await getDoc(userRef);

            if (!userSnap.exists()) return;
            const data = userSnap.data();

            if (data.locationSharingEnabled === false) {
                console.debug("Location sharing is disabled by user.");
                return;
            }

            // Throttle: Don't update if last update was less than 5 minutes ago
            const lastUpdate = data.lastLocationTimestamp?.toDate?.() || 0;
            if (Date.now() - lastUpdate < 300000) { // 5 minutes
                console.debug("Location update throttled (last update too recent).");
                return;
            }

            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;

                try {
                    const statsRef = doc(db, "user_locations", uid);
                    await setDoc(statsRef, {
                        uid,
                        lat: latitude,
                        lng: longitude,
                        timestamp: serverTimestamp(),
                        displayName: data.displayName || "User",
                        photoURL: data.photoURL || null,
                        email: data.email || null,
                        isAdmin: data.isAdmin || false,
                        superAdmin: data.superAdmin || false,
                        isOnline: true,
                        platform: navigator.platform,
                        userAgent: navigator.userAgent
                    }, { merge: true });

                    // Also write to the user doc so admin MapView can read it
                    const userDocRef = doc(db, "users", uid);
                    await updateDoc(userDocRef, {
                        lastLoginLocation: { lat: latitude, lng: longitude },
                        lastLocationTimestamp: serverTimestamp()
                    });
                } catch (e) {
                    if (e.code !== 'permission-denied') {
                        console.debug("Location update failed:", e.code);
                    }
                }
            }, (err) => {
                console.debug("Location permission denied or error:", err.code);
            });
        } catch (error) {
            console.debug("Location update error:", error.code);
        }
    };

    const toggleLocationSharing = async (enabled) => {
        if (!currentUser) return;
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, { locationSharingEnabled: enabled });
            setCurrentUser(prev => ({ ...prev, locationSharingEnabled: enabled }));
            if (enabled) updateUserLocation(currentUser.uid);
        } catch (error) {
            console.error("Failed to toggle location sharing:", error);
        }
    };

    const loginWithGoogle = useCallback(async function () {
        try {
            // Firestore network is managed automatically by the SDK

            // Use popup — more reliable with modern third-party cookie restrictions
            // COOP header 'same-origin-allow-popups' is configured in vercel.json, firebase.json, and vite.config.js
            googleProvider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, googleProvider);
            // onAuthStateChanged will handle profile setup
            return result;
        } catch (error) {
            console.error("Google Login Error:", error.code, error.message);
            const message = getAuthErrorMessage(error);
            if (message) {
                // Re-throw with user-friendly message
                const friendlyError = new Error(message);
                friendlyError.code = error.code;
                throw friendlyError;
            }
            // If message is null (e.g. cancelled-popup-request), silently ignore
            return null;
        }
    }, []);

    const loginWithEmail = useCallback(async function (email, password) {
        try {


            const result = await signInWithEmailAndPassword(auth, email, password);
            return result;
        } catch (error) {
            console.error("Email Login Error:", error.code);
            const message = getAuthErrorMessage(error);
            const friendlyError = new Error(message);
            friendlyError.code = error.code;
            throw friendlyError;
        }
    }, []);

    async function logout() {
        return logoutWithTimeout(async () => {
            console.debug('Starting secure logout sequence...');

            isLoggingOutRef.current = true;

            // STEP 1: Cleanup ALL Firestore listeners FIRST
            listenerManager.unsubscribeAll();

            // STEP 2: Cleanup auth-specific listener
            if (userDocUnsubscribeRef.current) {
                userDocUnsubscribeRef.current();
                userDocUnsubscribeRef.current = null;
            }

            // STEP 3: Update user status (NON-BLOCKING)
            if (currentUser) {
                updateDoc(doc(db, "users", currentUser.uid), {
                    isOnline: false
                }).catch((err) => {
                    console.debug("Status update error (non-critical):", err.code);
                });
            }

            // STEP 4: Clear user state before signing out
            setCurrentUser(null);

            // STEP 5: Clear app-specific caches (but NOT Firebase auth persistence)
            await clearAllCaches(db);

            // STEP 6: Sign out from Firebase Auth
            try {
                await signOut(auth);
            } catch (e) {
                // Ignore network errors during logout (e.g. ERR_BLOCKED_BY_CLIENT)
                console.warn("Logout network signal interrupted (harmless):", e.code);
            }

            console.debug('Secure logout complete');

            isLoggingOutRef.current = false;
        }, 10000);
    }

    useEffect(() => {
        // Handle any pending redirect results (fallback for mobile/redirect-based flows)
        getRedirectResult(auth).then((result) => {
            if (result?.user) {
                console.debug('Redirect sign-in result processed for:', result.user.email);
            }
        }).catch((error) => {
            // Only log non-trivial redirect errors
            if (error.code && error.code !== 'auth/credential-already-in-use') {
                console.debug('Redirect result error:', error.code);
            }
        });

        // Fail-safe: Force loading to false after 8 seconds if Firebase/Listeners hang
        const bootTimeout = setTimeout(() => {
            if (loading) {
                console.warn("Boot Sequence Timeout: Forcing load completion.");
                setLoading(false);
            }
        }, 8000);

        // Main auth state listener
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (isLoggingOutRef.current) return;

            try {
                if (user) {
                    const userRef = doc(db, "users", user.uid);
                    let userSnap = await getGetDocWithTimeout(userRef, 5000);

                    if (!userSnap.exists()) {
                        console.debug("Provisioning new user profile...");
                        const searchableName = (user.displayName || user.email?.split('@')[0] || "user").toLowerCase();
                        await setDoc(userRef, {
                            uid: user.uid,
                            displayName: user.displayName || user.email?.split('@')[0] || "User",
                            searchableName: searchableName,
                            email: user.email,
                            photoURL: user.photoURL,
                            createdAt: serverTimestamp(),
                            isOnline: true,
                            locationSharingEnabled: true,
                            lastSeen: serverTimestamp(),
                            phoneNumber: user.phoneNumber,
                            metadata: {
                                creationTime: user.metadata.creationTime,
                                lastSignInTime: user.metadata.lastSignInTime
                            }
                        });
                        userSnap = await getDoc(userRef);
                    } else {
                        const userData = userSnap.data();
                        if (!userData.searchableName && userData.displayName) {
                            updateDoc(userRef, { searchableName: userData.displayName.toLowerCase() }).catch(() => { });
                        }
                        await updateDoc(userRef, {
                            isOnline: true,
                            "metadata.lastSignInTime": user.metadata.lastSignInTime
                        });
                    }

                    const baseData = userSnap.exists() ? userSnap.data() : {};
                    setCurrentUser({ ...user, ...baseData });

                    if (userDocUnsubscribeRef.current) userDocUnsubscribeRef.current();

                    userDocUnsubscribeRef.current = onSnapshot(userRef, (docSnap) => {
                        if (isLoggingOutRef.current) return;
                        if (docSnap.exists()) {
                            const userData = docSnap.data();
                            if (userData.isBanned || userData.deletionRequested) {
                                alert(userData.isBanned ? "Account Banned" : "Deletion Pending");
                                logout();
                                return;
                            }
                            setCurrentUser(prev => prev ? { ...prev, ...userData } : userData);
                            if (userData.locationSharingEnabled) updateUserLocation(user.uid, userData);
                        }
                    }, (err) => {
                        if (err.code === 'permission-denied') logout();
                    });

                } else {
                    if (userDocUnsubscribeRef.current) {
                        userDocUnsubscribeRef.current();
                        userDocUnsubscribeRef.current = null;
                    }
                    setCurrentUser(null);
                }
            } catch (error) {
                console.error("Auth Initialization Error:", error);
                // Fail-safe for permission denied during early boot
                if (error.code === 'permission-denied') {
                    setCurrentUser(null);
                }
            } finally {
                // Ensure loading is always cleared, but with a tiny delay to allow states to settle
                setTimeout(() => {
                    setLoading(false);
                    clearTimeout(bootTimeout);
                }, 100);
            }
        });

        return () => {
            unsubscribe();
            if (userDocUnsubscribeRef.current) userDocUnsubscribeRef.current();
        };
    }, []);

    const value = React.useMemo(() => ({
        currentUser,
        loginWithGoogle,
        loginWithEmail,
        logout,
        toggleLocationSharing,
        deactivateAccount: async () => {
            try {
                const deactivateFn = httpsCallable(functions, 'deactivateAccount');
                await deactivateFn();
                await logout();
            } catch (error) {
                console.error("Deactivation failed:", error);
                throw error;
            }
        }
    }), [currentUser, loginWithGoogle, loginWithEmail, logout, toggleLocationSharing]);

    return (
        <AuthContext.Provider value={value}>
            {loading ? <Loading /> : children}
        </AuthContext.Provider>
    );
}
