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

            // THROTTLE: Only update if 30 seconds have passed OR distance > 50 meters
            const now = Date.now();
            const lastUpdate = lastPosRef.current?.timestamp || 0;
            const timeDiff = now - lastUpdate;

            let shouldUpdate = false;

            // 1. Time based throttle (30s)
            if (timeDiff > 30000) {
                shouldUpdate = true;
            }
            // 2. Distance based filter (approx 50m)
            else if (lastPosRef.current) {
                const dist = getDistanceFromLatLonInKm(
                    latitude, longitude,
                    lastPosRef.current.lat, lastPosRef.current.lng
                );
                // 0.05 km = 50 meters
                if (dist > 0.05) {
                    shouldUpdate = true;
                }
            } else {
                // First update
                shouldUpdate = true;
            }

            if (!shouldUpdate) return;

            // Update ref immediately to prevent race conditions
            lastPosRef.current = { lat: latitude, lng: longitude, timestamp: now };

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

        // Helper: Haversine Formula for distance
        function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
            var R = 6371; // Radius of the earth in km
            var dLat = deg2rad(lat2 - lat1);  // deg2rad below
            var dLon = deg2rad(lon2 - lon1);
            var a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
                ;
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            var d = R * c; // Distance in km
            return d;
        }

        function deg2rad(deg) {
            return deg * (Math.PI / 180)
        }

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
