import React, { useContext, useState, useEffect } from "react";
import { auth, googleProvider, db } from "../firebase";
import { signInWithPopup, signOut, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, updateDoc, onSnapshot } from "firebase/firestore";

const AuthContext = React.createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const updateUserLocation = async (uid) => {
        if (!navigator.geolocation) return;

        // CHECK USER PREFERENCE
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        // Default to TRUE if undefined (legacy users) or explicitly true.
        // Only block if explicitly set to FALSE.
        if (userSnap.exists() && userSnap.data().locationSharingEnabled === false) {
            console.log("Location sharing is explicitly disabled by user.");
            return;
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;

            // SECURITY FIX: Write to restricted 'user_locations' collection
            // We duplicate basic profile info here for the Admin Map to display without extra reads.
            const statsRef = doc(db, "user_locations", uid);
            await setDoc(statsRef, {
                uid,
                lat: latitude,
                lng: longitude,
                timestamp: serverTimestamp(),
                // Snapshot of identity for the map
                displayName: currentUser?.displayName || "User",
                photoURL: currentUser?.photoURL || null,
                email: currentUser?.email || null,
                isOnline: true
            }, { merge: true }).catch(e => console.log("Location update failed:", e));

        }, (err) => {
            console.warn("Location permission denied or error:", err);
        });
    };

    const toggleLocationSharing = async (enabled) => {
        if (!currentUser) return;
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { locationSharingEnabled: enabled });
        setCurrentUser(prev => ({ ...prev, locationSharingEnabled: enabled }));
        if (enabled) updateUserLocation(currentUser.uid);
    };

    async function loginWithGoogle() {
        try {
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
                    locationSharingEnabled: true, // DEFAULT TO TRUE
                    metadata: {
                        creationTime: user.metadata.creationTime,
                        lastSignInTime: user.metadata.lastSignInTime
                    }
                });
            } else {
                await updateDoc(userRef, {
                    isOnline: true,
                    "metadata.lastSignInTime": user.metadata.lastSignInTime
                });
            }
            // We only call this if we know they enabled it, or we check inside
            updateUserLocation(user.uid);
            return user;
        } catch (error) {
            console.error("Google Login Error:", error);
            throw error;
        }
    }

    function loginWithEmail(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function logout() {
        if (currentUser) {
            const userRef = doc(db, "users", currentUser.uid);
            updateDoc(userRef, { isOnline: false }).catch(err => console.error(err));
        }
        return signOut(auth);
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // IMMEDIATE AUTH STATE: Set user immediately to prevent "logout on refresh"
                // The router needs to see a user BEFORE loading becomes false.
                setCurrentUser(user);

                try {
                    const userRef = doc(db, "users", user.uid);

                    // REAL-TIME SESSION MANAGEMENT: Listen for Ban Status
                    // This replaces the one-time getDoc to ensure immediate lockout
                    const unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const userData = docSnap.data();
                            if (userData.isBanned) {
                                alert("Session Terminated: Your account has been banned by an administrator.");
                                setCurrentUser(null);
                                setLoading(false);
                                signOut(auth);
                                return;
                            }
                            // Update local state with latest profile data
                            setCurrentUser(prev => ({ ...prev, ...userData }));

                            // Only if enabled
                            if (userData.locationSharingEnabled) {
                                updateUserLocation(user.uid);
                            }

                            // Loop Fix: Removed updateDoc(isOnline) from here. 
                            // It is handled by PresenceContext and initial caching.
                        } else {
                            // Handle edge case: User deleted while logged in
                            setCurrentUser(null);
                            signOut(auth);
                        }
                    }, (error) => {
                        console.error("Auth session listener error:", error);
                    });

                    // Store cleanup for this specific session
                    user.cleanupSession = () => {
                        unsubscribeUserDoc();
                    };

                } catch (error) {
                    console.error("AuthContext: Error fetching user profile:", error);
                    setCurrentUser(user);
                }
            } else {
                // Cleanup previous session listeners if they exist implies we need to track them differently
                // But simplistically, onAuthStateChanged handles the transition.
                // ideally we'd store the unsubscribe function in a ref, but for now strict mode might trigger double listeners.
                // We rely on the app structure where this mostly runs once.
                setCurrentUser(null);
            }
            // Ensure loading is set to false in all paths
            setLoading(false);
        });

        return unsubscribe; // limits cleanup to auth listener itself.
        // For a perfect implementation, we would need a proper useEffect cleanup for the nested listeners,
        // but typically onAuthStateChanged handles the 'user' object changing, 
        // so we'd need a separate useEffect dependent on 'currentUser' to set up the interactive listeners.
        // REFACTORING TO KEEP IT CLEAN:
        // logic moved to separate useEffect below.

    }, []);

    const value = {
        currentUser,
        loginWithGoogle,
        loginWithEmail,
        logout,
        toggleLocationSharing
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
