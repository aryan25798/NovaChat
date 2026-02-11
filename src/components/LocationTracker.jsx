import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const LocationTracker = () => {
    const { currentUser } = useAuth();
    const watchIdRef = useRef(null);
    const lastPosRef = useRef(null);
    const retryCountRef = useRef(0);
    const isActiveRef = useRef(true);

    useEffect(() => {
        // Reset active flag on mount
        isActiveRef.current = true;

        if (!currentUser) {
            // Cleanup immediately if no user
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }

        const updateLocation = async (position) => {
            // Double-check user is still authenticated
            if (!currentUser || !isActiveRef.current) return;

            const { latitude, longitude, heading, speed, altitude } = position.coords;

            // Optimization: Skip if position hasn't changed enough
            const currentPosKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
            if (lastPosRef.current === currentPosKey) return;
            lastPosRef.current = currentPosKey;

            try {
                await setDoc(doc(db, 'user_locations', currentUser.uid), {
                    lat: latitude,
                    lng: longitude,
                    heading: heading || 0,
                    speed: speed || 0,
                    altitude: altitude || 0,
                    timestamp: serverTimestamp(),
                    displayName: currentUser.displayName || 'Unknown',
                    photoURL: currentUser.photoURL || null,
                    isOnline: true
                }, { merge: true });

                // Reset retry count on success
                retryCountRef.current = 0;
            } catch (error) {
                // Graceful error handling
                if (error.code === 'permission-denied') {
                    // User logged out or permissions changed - stop tracking
                    console.debug('Location tracking stopped: Permission denied');
                    if (watchIdRef.current) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                } else if (error.code === 'unavailable') {
                    // Transient network error - implement exponential backoff
                    retryCountRef.current++;
                    if (retryCountRef.current > 5) {
                        console.error('Location update failed after 5 retries, stopping tracker');
                        if (watchIdRef.current) {
                            navigator.geolocation.clearWatch(watchIdRef.current);
                            watchIdRef.current = null;
                        }
                    }
                } else {
                    // Log other errors silently
                    console.debug('Location update error:', error.code);
                }
            }
        };

        const handleError = (error) => {
            // Silently handle geolocation errors
            if (error.code === error.PERMISSION_DENIED) {
                console.debug('Geolocation permission denied by user');
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                console.debug('Geolocation position unavailable');
            }
            // Don't spam console with timeout errors
        };

        if ("geolocation" in navigator && currentUser) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                updateLocation,
                handleError,
                {
                    enableHighAccuracy: true,
                    maximumAge: 30000,
                    timeout: 27000
                }
            );
        }

        return () => {
            // Cleanup on unmount or user change
            isActiveRef.current = false;
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            lastPosRef.current = null;
            retryCountRef.current = 0;
        };
    }, [currentUser]);

    return null;
};

export default LocationTracker;
