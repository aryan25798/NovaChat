import React, { useContext, useState, useEffect, useRef } from "react";
import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, onSnapshot, disableNetwork, enableNetwork, clearIndexedDbPersistence } from "firebase/firestore";
import { listenerManager } from "../utils/ListenerManager";
import { logoutWithTimeout, clearAllCaches } from "../utils/logoutUtils";

const AuthContext = React.createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const userDocUnsubscribeRef = useRef(null);
    const isLoggingOutRef = useRef(false); // Track logout state to prevent listener errors

    const updateUserLocation = async (uid) => {
        if (!navigator.geolocation) return;

        try {
            // CHECK USER PREFERENCE
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);

            // Default to TRUE if undefined (legacy users) or explicitly true.
            // Only block if explicitly set to FALSE.
            if (userSnap.exists() && userSnap.data().locationSharingEnabled === false) {
                console.debug("Location sharing is disabled by user.");
                return;
            }

            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;

                // SECURITY FIX: Write to restricted 'user_locations' collection
                const statsRef = doc(db, "user_locations", uid);
                await setDoc(statsRef, {
                    uid,
                    lat: latitude,
                    lng: longitude,
                    timestamp: serverTimestamp(),
                    displayName: currentUser?.displayName || "User",
                    photoURL: currentUser?.photoURL || null,
                    email: currentUser?.email || null,
                    isOnline: true
                }, { merge: true }).catch(e => {
                    // Silently handle permission errors
                    if (e.code !== 'permission-denied') {
                        console.debug("Location update failed:", e.code);
                    }
                });
            }, (err) => {
                console.debug("Location permission denied or error:", err.code);
            });
        } catch (error) {
            // Silently handle errors
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

    async function loginWithGoogle() {
        try {
            // CRITICAL: Re-enable Firestore network BEFORE sign-in
            // This prevents SDK assertion errors when auth state changes
            try {
                await enableNetwork(db);
                console.debug('Firestore network enabled before login');
            } catch (err) {
                console.debug('Network enable error (may already be enabled):', err.code);
            }

            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    createdAt: serverTimestamp(),
                    isOnline: true,
                    superAdmin: false,
                    isAdmin: false,
                    locationSharingEnabled: true,
                    metadata: {
                        creationTime: user.metadata.creationTime,
                        lastSignInTime: user.metadata.lastSignInTime
                    }
                });
            } else {
                const updateData = {
                    isOnline: true,
                    "metadata.lastSignInTime": user.metadata.lastSignInTime
                };
                if (userSnap.data().superAdmin === undefined) {
                    updateData.superAdmin = false;
                }
                await updateDoc(userRef, updateData);
            }
            updateUserLocation(user.uid);

            return user;
        } catch (error) {
            console.error("Google Login Error:", error);
            throw error;
        }
    }

    async function loginWithEmail(email, password) {
        try {
            // CRITICAL: Re-enable Firestore network BEFORE sign-in
            // This prevents SDK assertion errors when auth state changes
            try {
                await enableNetwork(db);
                console.debug('Firestore network enabled before login');
            } catch (err) {
                console.debug('Network enable error (may already be enabled):', err.code);
            }

            const result = await signInWithEmailAndPassword(auth, email, password);

            return result;
        } catch (error) {
            console.error("Email Login Error:", error);
            throw error;
        }
    }

    async function logout() {
        // Wrap entire logout in timeout protection
        return logoutWithTimeout(async () => {
            console.debug('Starting secure logout sequence...');

            // CRITICAL: Set logout flag FIRST to prevent listener from firing
            isLoggingOutRef.current = true;

            // STEP 1: Cleanup ALL Firestore listeners FIRST (most important)
            listenerManager.unsubscribeAll();

            // STEP 2: Cleanup auth-specific listener
            if (userDocUnsubscribeRef.current) {
                userDocUnsubscribeRef.current();
                userDocUnsubscribeRef.current = null;
            }

            // STEP 3: Update user status (NON-BLOCKING - fire and forget)
            // Don't wait for this to complete - logout should never hang
            if (currentUser) {
                updateDoc(doc(db, "users", currentUser.uid), {
                    isOnline: false
                }).catch((err) => {
                    console.debug("Status update error (non-critical):", err.code);
                });
            }

            // STEP 4: Clear user state before signing out to prevent race conditions
            setCurrentUser(null);

            console.debug('Disabling Firestore network and clearing caches...');

            // STEP 5: Disable Firestore network to cleanly shut down all internal watch streams
            // This prevents "INTERNAL ASSERTION FAILED" errors from the SDK
            try {
                await disableNetwork(db);
                console.debug('Firestore network disabled successfully');
            } catch (err) {
                console.debug('Firestore network disable error:', err.code);
            }

            // STEP 6: SECURITY - Clear all caches and storage
            // This prevents data leaks on shared devices
            await clearAllCaches(db);

            // STEP 7: Sign out from Firebase Auth
            await signOut(auth);

            console.debug('Secure logout complete');

            // NOTE: Network will be re-enabled during next login, not here
            // This prevents security window where Firestore is active but user is logged out

            // Reset logout flag after signOut completes
            isLoggingOutRef.current = false;
        }, 10000); // 10 second timeout
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            // CRITICAL FIX: If we're logging out, ignore this auth state change
            if (isLoggingOutRef.current) {
                console.debug('Auth state changed during logout - ignoring');
                return;
            }

            if (user) {
                // IMMEDIATE AUTH STATE: Set user immediately
                setCurrentUser(user);

                try {
                    const userRef = doc(db, "users", user.uid);

                    // Cleanup previous listener if it exists
                    if (userDocUnsubscribeRef.current) {
                        userDocUnsubscribeRef.current();
                    }

                    // REAL-TIME SESSION MANAGEMENT
                    userDocUnsubscribeRef.current = onSnapshot(userRef, (docSnap) => {
                        // Double-check we're not logging out
                        if (isLoggingOutRef.current) {
                            console.debug('User doc snapshot during logout - ignoring');
                            return;
                        }

                        if (docSnap.exists()) {
                            const userData = docSnap.data();

                            // Check for ban or deletion
                            if (userData.isBanned || userData.deletionRequested) {
                                const msg = userData.isBanned
                                    ? "Session Terminated: Your account has been banned by an administrator."
                                    : "Deletion Pending: Your request to delete this account is being processed.";
                                alert(msg);

                                // Cleanup and logout
                                if (userDocUnsubscribeRef.current) {
                                    userDocUnsubscribeRef.current();
                                    userDocUnsubscribeRef.current = null;
                                }
                                setCurrentUser(null);
                                setLoading(false);
                                signOut(auth);
                                return;
                            }

                            // PATCH: Ensure superAdmin flag exists
                            if (userData.superAdmin === undefined && !window._patched_superadmin) {
                                window._patched_superadmin = true;
                                updateDoc(userRef, { superAdmin: false }).catch(e => {
                                    console.debug("Auto-patch failed:", e.code);
                                    window._patched_superadmin = false;
                                });
                            }

                            // Update local state
                            setCurrentUser(prev => ({ ...prev, ...userData }));

                            // Update location if enabled
                            if (userData.locationSharingEnabled) {
                                updateUserLocation(user.uid);
                            }
                        } else {
                            // User deleted while logged in
                            if (userDocUnsubscribeRef.current) {
                                userDocUnsubscribeRef.current();
                                userDocUnsubscribeRef.current = null;
                            }
                            setCurrentUser(null);
                            signOut(auth);
                        }
                    }, (error) => {
                        // CRITICAL FIX: Don't log errors if we're logging out
                        if (isLoggingOutRef.current) {
                            console.debug('User doc listener error during logout (expected) - ignoring');
                            return;
                        }

                        // Gracefully handle permission errors
                        if (error.code === 'permission-denied') {
                            console.error('Auth session listener error: Permission denied. This should not happen during normal operation.');
                            if (userDocUnsubscribeRef.current) {
                                userDocUnsubscribeRef.current();
                                userDocUnsubscribeRef.current = null;
                            }
                            setCurrentUser(null);
                            signOut(auth);
                        } else {
                            console.error("Auth session listener error:", error);
                        }
                    });

                } catch (error) {
                    console.error("AuthContext: Error fetching user profile:", error);
                    setCurrentUser(user);
                }
            } else {
                // User logged out - cleanup listeners
                if (userDocUnsubscribeRef.current) {
                    userDocUnsubscribeRef.current();
                    userDocUnsubscribeRef.current = null;
                }
                setCurrentUser(null);
            }
            setLoading(false);
        });

        return () => {
            // Cleanup on unmount
            unsubscribe();
            if (userDocUnsubscribeRef.current) {
                userDocUnsubscribeRef.current();
                userDocUnsubscribeRef.current = null;
            }
        };
    }, []);

    const value = {
        currentUser,
        loginWithGoogle,
        loginWithEmail,
        logout,
        toggleLocationSharing,
        deactivateAccount: async () => {
            const { httpsCallable } = await import("firebase/functions");
            const { functions } = await import("../firebase");
            const deactivateFn = httpsCallable(functions, 'deactivateAccount');
            await deactivateFn();
            await logout();
        }
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
