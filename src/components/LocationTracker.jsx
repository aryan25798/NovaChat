import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const LocationTracker = () => {
    const { currentUser } = useAuth();

    useEffect(() => {
        if (!currentUser) return;

        let watchId;
        let lastPos = null;

        const updateLocation = async (position) => {
            const { latitude, longitude, heading, speed, altitude } = position.coords;

            // Optimization: Skip if position hasn't changed enough (exact string check for speed)
            const currentPosKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
            if (lastPos === currentPosKey) return;
            lastPos = currentPosKey;

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
            } catch (error) {
                console.error("Location error:", error);
            }
        };

        const handleError = (error) => {
            console.error("Location error:", error);
        };

        if ("geolocation" in navigator) {
            watchId = navigator.geolocation.watchPosition(
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
            if (watchId) navigator.geolocation.clearWatch(watchId);
            // Optionally mark as offline when component unmounts
        };
    }, [currentUser]);

    return null; // This component renders nothing
};

export default LocationTracker;
