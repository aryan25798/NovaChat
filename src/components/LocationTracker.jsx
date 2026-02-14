import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Haversine formula for distance calculation
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
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
    return deg * (Math.PI / 180);
}

const LocationTracker = () => {
    const { currentUser } = useAuth();
    const watchIdRef = useRef(null);
    const lastPosRef = useRef(null);
    const retryCountRef = useRef(0);
    const isActiveRef = useRef(true);

    useEffect(() => {
        isActiveRef.current = true;
        let intervalId = null;

        if (!currentUser) {
            return;
        }

        const updateLocation = async () => {
            if (!currentUser || !isActiveRef.current) return;

            if (!("geolocation" in navigator)) {
                console.debug("Geolocation not supported");
                return;
            }

            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude, heading, speed, altitude } = position.coords;

                const now = Date.now();
                const lastUpdate = lastPosRef.current?.timestamp || 0;

                // Distance Check (0.5km = 500m) - stricter than before to save writes
                let shouldUpdate = false;

                if (lastPosRef.current) {
                    const dist = getDistanceFromLatLonInKm(
                        latitude, longitude,
                        lastPosRef.current.lat, lastPosRef.current.lng
                    );
                    if (dist > 0.5) { // Moved > 500m
                        shouldUpdate = true;
                    } else if (now - lastUpdate > (document.visibilityState === 'visible' ? 3600000 : 7200000)) {
                        // Heartbeat: 1h if visible, 2h if hidden even if not moved
                        shouldUpdate = true;
                    }
                } else {
                    shouldUpdate = true;
                }

                if (!shouldUpdate) return;

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
                    retryCountRef.current = 0;
                } catch (error) {
                    console.debug("Location write failed", error.code);
                }

            }, (error) => {
                console.debug("Location fetch error", error.code);
            }, {
                enableHighAccuracy: false, // Battery optimization
                timeout: 10000,
                maximumAge: 60000 // Accept 1 min old cached position
            });
        };

        // Visibility Change Handler: Adjust polling interval dynamically
        const handleVisibilityChange = () => {
            if (intervalId) clearInterval(intervalId);

            if (document.visibilityState === 'visible') {
                updateLocation(); // Run once immediately on return
                intervalId = setInterval(updateLocation, 300000); // 5 mins
            } else {
                intervalId = setInterval(updateLocation, 1800000); // 30 mins (Background Throttling)
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Initial setup
        handleVisibilityChange();

        return () => {
            isActiveRef.current = false;
            if (intervalId) clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            lastPosRef.current = null;
        };
    }, [currentUser?.uid]); // Use UID for stable dependency

    return null;
};

export default LocationTracker;
