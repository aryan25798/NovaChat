import React, { useContext, useState, useEffect, useRef, useCallback } from "react";
import { auth, googleProvider, db, functions } from "../firebase";
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
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
    const isLoggingOutRef = useRef(false);
    const userDocUnsubscribeRef = useRef(null);
    const [preferRedirect, setPreferRedirect] = useState(() => {
        return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nova_auth_prefer_redirect') === 'true';
    });

    // 1. Handle Redirect Result (Essential for signInWithRedirect)

    const updateUserLocation = async (uid, userData) => {
        if (!navigator.geolocation || !userData) return;

        try {
            if (userData.locationSharingEnabled === false) {
                console.debug("Location sharing is disabled by user.");
                return;
            }

            // Throttle: Don't update if last update was less than 5 minutes ago
            const lastUpdate = userData.lastLocationTimestamp?.toDate?.() || 0;
            if (Date.now() - lastUpdate < 300000) { // 5 minutes
                // Silenced debug log to reduce console noise in production
                return;
            }

            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;

                try {
                    // UNIFIED WRITE: Only update user_locations. 
                    // This reduces write costs by 50% for tracking.
                    const statsRef = doc(db, "user_locations", uid);
                    await setDoc(statsRef, {
                        uid,
                        lat: latitude,
                        lng: longitude,
                        timestamp: serverTimestamp(),
                        displayName: userData.displayName || "User",
                        photoURL: userData.photoURL || null,
                        email: userData.email || null,
                        isAdmin: userData.isAdmin || false,
                        superAdmin: userData.superAdmin || false,
                        isOnline: true,
                        platform: navigator.platform,
                        userAgent: navigator.userAgent
                    }, { merge: true });

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
            if (enabled) updateUserLocation(currentUser.uid, currentUser);
        } catch (error) {
            console.error("Failed to toggle location sharing:", error);
        }
    };

    const loginWithGoogle = useCallback(async function () {
        try {
            googleProvider.setCustomParameters({ prompt: 'select_account' });

            if (preferRedirect) {
                await signInWithRedirect(auth, googleProvider);
                return null;
            }

            try {
                const result = await signInWithPopup(auth, googleProvider);
                return result;
            } catch (popupError) {
                console.warn("[Auth] Popup failed, falling back to redirect:", popupError.code);
                // Persistence of preference
                setPreferRedirect(true);
                sessionStorage.setItem('nova_auth_prefer_redirect', 'true');

                // Nuclear Fallback: Redirect
                try {
                    await signInWithRedirect(auth, googleProvider);
                } catch (reErr) {
                    console.error("[Auth] Both Popup and Redirect failed:", reErr);
                    throw reErr;
                }
                return null;
            }
        } catch (error) {
            console.error("Google Login Error:", error.code, error.message);
            const message = getAuthErrorMessage(error);
            if (message) throw new Error(message);
            return null;
        }
    }, [preferRedirect]);

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
        // LOCK UI: Prevent multiple clicks
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        setLoading(true); // Show loading spinner IMMEDIATELY

        console.debug('Starting INSTANT logout sequence...');

        // 1. Fire-and-forget Firebase SignOut
        signOut(auth).catch(e => console.warn("Background SignOut warning:", e));

        // 2. Fire-and-forget User Status Update
        if (currentUser) {
            updateDoc(doc(db, "users", currentUser.uid), {
                isOnline: false,
                lastSeen: serverTimestamp()
            }).catch(e => console.debug("Status update skipped:", e));
        }

        // 3. Clear Listeners & State
        try {
            listenerManager.unsubscribeAll();
            if (userDocUnsubscribeRef.current) {
                userDocUnsubscribeRef.current();
                userDocUnsubscribeRef.current = null;
            }
            setCurrentUser(null);
        } catch (e) {
            console.warn("Cleanup warning:", e);
        }

        // 4. Clear Storage Synchronously 
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) { console.error(e); }

        // 5. Short delay to allow `signOut` network packet to potentially leave
        setTimeout(() => {
            // 6. Hard Reload to Login Page
            window.location.href = '/login';

            // 7. Safety: Reset the ref after 3 seconds so user can click again (better than stuck).
            setTimeout(() => {
                isLoggingOutRef.current = false;
                setLoading(false);
            }, 3000);
        }, 100);
    }

    useEffect(() => {
        let mounted = true;

        // Handle Redirect Result (Single Authority)
        getRedirectResult(auth).then((result) => {
            if (mounted && result?.user) {
                console.log("[Auth] Redirect sign-in result processed:", result.user.email);
            }
        }).catch((error) => {
            if (mounted && error.code && error.code !== 'auth/credential-already-in-use') {
                console.warn("[Auth] Redirect result error:", error.code);
            }
        });

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!mounted) return;
            if (isLoggingOutRef.current) return;

            try {
                if (user) {
                    console.debug("[Auth] State changed: User detected", user.email);

                    // 1. Get custom claims (Admin/SuperAdmin) IMMEDIATELY
                    // Force refresh to ensure we have latest claims
                    const tokenResult = await user.getIdTokenResult(true);
                    const claims = tokenResult.claims;

                    // 2. Fetch Firestore Profile for double-verification
                    const userRef = doc(db, "users", user.uid);

                    // INDUSTRY GRADE: Don't let a slow Firestore block the whole app if claims exist
                    let userData = {};
                    try {
                        const docSnap = await getGetDocWithTimeout(userRef, 3000);
                        if (docSnap.exists()) userData = docSnap.data();
                    } catch (e) {
                        console.warn("[Auth] Firestore profile fetch timed out/failed. Relying on claims.");
                    }

                    const isAdmin = !!claims.isAdmin || !!userData.isAdmin || user.email === 'admin@system.com';
                    const superAdmin = !!claims.superAdmin || !!userData.superAdmin;

                    console.debug("[Auth] Role Resolution:", {
                        email: user.email,
                        claims: { isAdmin: !!claims.isAdmin, superAdmin: !!claims.superAdmin },
                        firestore: { isAdmin: !!userData.isAdmin, superAdmin: !!userData.superAdmin },
                        override: user.email === 'admin@system.com',
                        resolved: { isAdmin, superAdmin }
                    });

                    setCurrentUser({
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || userData.displayName || "User",
                        photoURL: user.photoURL || userData.photoURL || null,
                        emailVerified: user.emailVerified,
                        isAdmin,
                        superAdmin,
                        isBanned: !!claims.isBanned || !!userData.isBanned,
                        claimsSettled: true
                    });

                    if (userDocUnsubscribeRef.current) userDocUnsubscribeRef.current();

                    userDocUnsubscribeRef.current = onSnapshot(userRef, async (docSnap) => {
                        if (!mounted || isLoggingOutRef.current) return;

                        if (docSnap.exists()) {
                            const userData = docSnap.data();

                            if (userData.isBanned || userData.deletionRequested) {
                                console.warn("User is banned or pending deletion. Logging out.");
                                await logout();
                                return;
                            }

                            setCurrentUser(prev => {
                                // Hard merge to ensure we don't lose properties
                                const newData = { ...prev, ...userData };

                                // Ensure claims from token persist if Firestore is outdated
                                // AUDIT_OVERRIDE: Force admin for system account
                                newData.isAdmin = !!userData.isAdmin || !!prev?.isAdmin || user.email === 'admin@system.com';
                                newData.superAdmin = !!userData.superAdmin || !!prev?.superAdmin;

                                // Deep equality check to prevent re-render loops from minor updates (like lastSeen)
                                if (prev &&
                                    prev.uid === newData.uid &&
                                    prev.isAdmin === newData.isAdmin &&
                                    prev.isBanned === newData.isBanned &&
                                    prev.email === newData.email &&
                                    JSON.stringify(prev.fcmTokens) === JSON.stringify(newData.fcmTokens)
                                ) {
                                    return prev;
                                }
                                return newData;
                            });

                            setLoading(false); // FINALLY stop loading once Firestore data is synced

                            if (!userData.searchableName && userData.displayName) {
                                const searchableName = userData.displayName.toLowerCase();
                                updateDoc(userRef, { searchableName }).catch(e => console.debug("Auto-fix searchableName failed", e));
                            }

                            // Trigger location update once on login/refresh if data is ready
                            updateUserLocation(user.uid, userData).catch(e => console.debug("Location sync failed", e));
                        } else {
                            console.debug("Provisioning new user profile...");
                            const searchableName = (user.displayName || user.email?.split('@')[0] || "user").toLowerCase();
                            try {
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
                            } catch (e) {
                                console.error("Profile provisioning failed:", e);
                            }
                            setLoading(false); // Stop loading even for new users
                        }
                    }, (err) => {
                        console.warn("Profile snapshot error:", err);
                    });

                    setTimeout(() => {
                        // We use the raw user object for the UID, but userData might not be in closure correctly 
                        // if we just use a variable. However, setCurrentUser above just ran.
                        // For safety, we can trigger it inside the onSnapshot when we first get data.
                    }, 1000);

                } else {
                    if (userDocUnsubscribeRef.current) {
                        userDocUnsubscribeRef.current();
                        userDocUnsubscribeRef.current = null;
                    }
                    setCurrentUser(null);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Auth State Check Error:", error);
                setLoading(false);
            }
        });

        return () => {
            mounted = false;
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
