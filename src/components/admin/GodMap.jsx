import React, { useState, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, OverlayViewF, InfoWindow } from '@react-google-maps/api';
import { db } from '../../firebase';
import { collection, query, onSnapshot, orderBy, limit, where } from 'firebase/firestore';

const containerStyle = {
    width: '100%',
    height: '100%'
};

// Tactical Dark Map Styles
const mapOptions = {
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    scaleControl: false,
    rotateControl: false,
    fullscreenControl: false,
    gestureHandling: 'greedy',
    styles: [
        { elementType: "geometry", stylers: [{ color: "#000000" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#333333" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a0a0a" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
    ],
};

const UserMarker = ({ user, onClick }) => (
    <OverlayViewF
        position={{ lat: user.lat, lng: user.lng }}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
        <div
            onClick={() => onClick(user)}
            className="group cursor-pointer flex flex-col items-center -translate-x-1/2 -translate-y-full pb-2 hover:z-50 transition-all active:scale-95"
        >
            {/* Pulsing Aura */}
            <div className="absolute inset-0 w-12 h-12 -translate-x-1/2 -translate-y-[calc(100%+8px)] bg-cyan-500/20 rounded-full animate-ping pointer-events-none" />

            {/* User Avatar */}
            <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-cyan-400 p-0.5 bg-black shadow-[0_0_15px_rgba(34,211,238,0.5)] group-hover:shadow-[0_0_25px_rgba(34,211,238,0.8)] transition-shadow overflow-hidden">
                    <img
                        src={user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.id}`}
                        alt={user.displayName}
                        className="w-full h-full rounded-full object-cover"
                    />
                </div>
                {/* Online Indicator Dot */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
            </div>

            {/* Name Label */}
            <div className="mt-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-md shadow-lg">
                <span className="text-[10px] font-black text-white whitespace-nowrap uppercase tracking-widest leading-none">
                    {user.displayName?.split(' ')[0] || 'Unknown'}
                </span>
            </div>

            {/* Pointer Stem */}
            <div className="w-px h-2 bg-gradient-to-t from-transparent to-cyan-500/50 mt-0.5" />
        </div>
    </OverlayViewF>
);

const GodMap = () => {
    const [liveUsers, setLiveUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });

    useEffect(() => {
        // 1. Listen to ONLINE users only
        const usersQuery = query(collection(db, 'users'), where('isOnline', '==', true));

        let unsubLocations = () => { };

        const unsubUsers = onSnapshot(usersQuery, (userSnapshot) => {
            const onlineUids = userSnapshot.docs.map(doc => doc.id);
            const userDataMap = {};
            userSnapshot.docs.forEach(doc => {
                userDataMap[doc.id] = doc.data();
            });

            if (onlineUids.length === 0) {
                setLiveUsers([]);
                return;
            }

            // 2. Listen to LOCATIONS for those online users
            unsubLocations(); // Clean up previous location listener
            const locQuery = query(
                collection(db, 'user_locations'),
                where('__name__', 'in', onlineUids.slice(0, 30)) // Firebase limit for 'in'
            );

            unsubLocations = onSnapshot(locQuery, (locSnapshot) => {
                const combined = locSnapshot.docs.map(doc => {
                    const locData = doc.data();
                    const profile = userDataMap[doc.id] || {};
                    return {
                        id: doc.id,
                        ...profile,
                        lat: Number(locData.lat),
                        lng: Number(locData.lng),
                        lastUpdate: locData.timestamp
                    };
                }).filter(u => !isNaN(u.lat) && !isNaN(u.lng));

                setLiveUsers(combined);
            });
        });

        return () => {
            unsubUsers();
            unsubLocations();
        };
    }, []);

    const center = useMemo(() => {
        if (liveUsers.length > 0) {
            return { lat: liveUsers[0].lat, lng: liveUsers[0].lng };
        }
        return { lat: 20, lng: 0 };
    }, [liveUsers]);

    if (!isLoaded) return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-4 font-mono">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_cyan]" />
            <span className="text-cyan-500 animate-pulse text-xs font-black tracking-widest">INITIALIZING GLOBAL MARAUDER NET...</span>
        </div>
    );

    return (
        <div className="h-full w-full relative z-0 bg-[#000000] overflow-hidden">
            {/* Grid Line Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-10" />

            <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={4}
                options={mapOptions}
            >
                {liveUsers.map(user => (
                    <UserMarker
                        key={user.id}
                        user={user}
                        onClick={setSelectedUser}
                    />
                ))}

                {selectedUser && (
                    <InfoWindow
                        position={{ lat: selectedUser.lat, lng: selectedUser.lng }}
                        onCloseClick={() => setSelectedUser(null)}
                    >
                        <div className="p-2 min-w-[220px] bg-black text-white font-mono rounded-lg">
                            <div className="flex items-center gap-3 mb-3 border-b border-cyan-500/30 pb-3">
                                <img
                                    src={selectedUser.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedUser.id}`}
                                    alt=""
                                    className="w-10 h-10 rounded-full border-2 border-cyan-500 shadow-[0_0_10px_cyan]"
                                />
                                <div className="min-w-0">
                                    <h3 className="font-black text-xs text-cyan-400 truncate uppercase tracking-widest">{selectedUser.displayName}</h3>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[9px] text-green-500 font-bold uppercase">Active Signal</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1.5 text-[9px] text-gray-400">
                                <div className="flex justify-between">
                                    <span>COORD_LAT</span>
                                    <span className="text-white">{selectedUser.lat.toFixed(6)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>COORD_LNG</span>
                                    <span className="text-white">{selectedUser.lng.toFixed(6)}</span>
                                </div>
                                <div className="flex justify-between pt-1 border-t border-white/5">
                                    <span>TELEMETRY_ID</span>
                                    <span className="text-white font-mono">{selectedUser.id.slice(0, 12)}</span>
                                </div>
                            </div>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>

            {/* Tactical Sidebar Stats */}
            <div className="absolute bottom-8 left-8 bg-black/60 backdrop-blur-2xl border border-cyan-500/20 p-6 rounded-3xl z-20 shadow-2xl min-w-[280px]">
                <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/5">
                    <div className="flex flex-col">
                        <h3 className="font-black text-[10px] tracking-[0.3em] text-cyan-400 uppercase">Marauder Net</h3>
                        <span className="text-[8px] text-gray-500 font-bold mt-1 tracking-widest">LIVE TRACKING ACTIVE</span>
                    </div>
                    <div className="w-3 h-3 rounded-full bg-cyan-500 animate-ping shadow-[0_0_10px_#22d3ee]" />
                </div>

                <div className="space-y-5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 tracking-wider">ONLINE AGENTS</span>
                        <div className="flex items-center gap-3">
                            <span className="text-3xl font-black text-white italic">{liveUsers.length}</span>
                            <div className="h-8 w-px bg-white/10" />
                            <div className="flex -space-x-2">
                                {liveUsers.slice(0, 3).map(u => (
                                    <img
                                        key={u.id}
                                        src={u.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.id}`}
                                        className="w-6 h-6 rounded-full border-2 border-black"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 animate-[shimmer_2s_infinite]" style={{ width: '100%' }} />
                    </div>
                    <p className="text-[7px] font-mono text-gray-600 mt-3 text-center uppercase tracking-[0.4em]">Satellite Link: Established (Stable)</p>
                </div>
            </div>

            {/* Scanline Effect Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_2px,3px_100%] z-30 pointer-events-none opacity-40" />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_150px_rgba(0,0,0,0.9)]" />
        </div>
    );
};

export default GodMap;
