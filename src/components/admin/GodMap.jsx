import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in Leaflet with Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const GodMap = () => {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        // Query users who are online OR have a last known location
        // Note: Firestore doesn't support logical OR in simple queries easily for different fields without composite indexes.
        // simpler: Get ALL users and filter client side for the map (God Mode privilege)
        // OPTIMIZATION for 10k users: Limit to top 100 most recently active to prevent crash
        // Query secure locations collection (Only readable by Admin/God)
        const q = query(
            collection(db, 'user_locations'),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            // Map the secure location docs to the format expected by the map
            const liveUsers = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Adapt fields to match previous structure if needed, 
                    // or just use direct values (lat/lng are top level now)
                    lastLoginLocation: { lat: data.lat, lng: data.lng },
                    lastSeen: data.timestamp
                };
            });

            setUsers(liveUsers);
        }, (error) => {
            console.error("Error subscribing to GodMap users:", error);
        });

        return () => unsubscribe();
    }, []);

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer
                center={[20, 0]}
                zoom={2}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
                className="leaflet-container-custom"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {users.map(user => (
                    <Marker
                        key={user.id}
                        position={[user.lastLoginLocation.lat, user.lastLoginLocation.lng]}
                    >
                        <Popup>
                            <div className="flex flex-col items-center gap-2 min-w-[150px]">
                                <img
                                    src={user.photoURL || 'https://via.placeholder.com/50'}
                                    alt={user.displayName}
                                    className="w-10 h-10 rounded-full border-2 border-whatsapp-teal"
                                />
                                <div className="text-center">
                                    <strong className="block text-sm font-bold text-gray-800">{user.displayName}</strong>
                                    <span className="text-xs text-gray-500">{user.email || user.phoneNumber}</span>
                                    <div className="mt-1">
                                        {user.isOnline ? (
                                            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">ONLINE</span>
                                        ) : (
                                            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full">
                                                Last seen: {user.lastSeen?.toDate ? user.lastSeen.toDate().toLocaleTimeString() : 'Unknown'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Overlay Stats */}
            <div className="absolute top-4 right-4 bg-black/70 text-white p-4 rounded-lg backdrop-blur-md z-[9999] border border-white/10 shadow-xl pointer-events-none">
                <h3 className="font-bold text-lg mb-1">Marauder's Map</h3>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm font-mono">{users.filter(u => u.isOnline).length} Active Targets</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                    Total Tracked: {users.length}
                </div>
            </div>
        </div>
    );
};

export default GodMap;
