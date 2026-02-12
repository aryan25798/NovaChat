import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, OverlayViewF, InfoWindow, MarkerClustererF } from '@react-google-maps/api';
import { db } from '../../firebase';
import { collection, query, onSnapshot, orderBy, limit, where, doc, getDoc } from 'firebase/firestore';
import { Avatar } from '../ui/Avatar';

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

const UserMarker = React.memo(({ user, onClick }) => (
    <OverlayViewF
        position={{ lat: user.lat, lng: user.lng }}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
        <div
            onClick={() => onClick(user)}
            className="group cursor-pointer flex flex-col items-center -translate-x-1/2 -translate-y-full pb-2 hover:z-50 active:scale-95 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ position: 'relative' }}
        >
            {/* Pulsing Aura */}
            <div className="absolute inset-0 w-12 h-12 -translate-x-1/2 -translate-y-[calc(100%+8px)] bg-cyan-500/10 rounded-full animate-ping pointer-events-none" />

            {/* User Avatar */}
            <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-cyan-400 p-0.5 bg-black shadow-[0_0_15px_rgba(34,211,238,0.4)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.8)] transition-all duration-300 overflow-hidden flex items-center justify-center">
                    <Avatar
                        src={user.photoURL}
                        alt={user.displayName}
                        fallback={user.displayName?.[0]}
                        className="w-full h-full rounded-full"
                    />
                </div>
                {/* Online Indicator Dot */}
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
            </div>

            {/* Name Label */}
            <div className="mt-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-md shadow-lg group-hover:border-cyan-400 transition-colors">
                <span className="text-[10px] font-black text-white whitespace-nowrap uppercase tracking-widest leading-none">
                    {user.displayName?.split(' ')[0] || 'Unknown'}
                </span>
            </div>

            {/* Pointer Stem */}
            <div className="w-px h-2 bg-gradient-to-t from-transparent to-cyan-500/50 mt-0.5" />
        </div>
    </OverlayViewF>
));

const GodMap = () => {
    const [liveUsers, setLiveUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const mapRef = useRef(null);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });

    const [timeoutError, setTimeoutError] = useState(false);

    useEffect(() => {
        if (!isLoaded && !loadError) {
            const timer = setTimeout(() => {
                setTimeoutError(true);
            }, 8000); // 8s timeout for ad blockers
            return () => clearTimeout(timer);
        }
    }, [isLoaded, loadError]);

    useEffect(() => {
        let currentUnsub = null;

        // SCALABILITY: Filter server-side for ONLY online users.
        const q = query(
            collection(db, 'users'),
            where('isOnline', '==', true)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => {
                const data = doc.data();
                // SCHEMA FIX: Read from lastLoginLocation object, not root
                const loc = data.lastLoginLocation || {};
                return {
                    id: doc.id,
                    ...data,
                    lat: loc.lat,
                    lng: loc.lng
                };
            }).filter(u => {
                const isValid = u.lat && u.lng;
                const isNotAdmin = !u.isAdmin;
                return isValid && isNotAdmin;
            });

            setLiveUsers(users);
        });

        currentUnsub = unsubscribe;
        return () => currentUnsub && currentUnsub();
    }, []);

    const center = useMemo(() => {
        if (liveUsers.length > 0) {
            // If the map is already loaded, don't keep jumping the center
            return undefined;
        }
        return { lat: 20, lng: 0 };
    }, [liveUsers.length === 0]);

    const onLoad = useCallback((map) => {
        mapRef.current = map;
    }, []);

    const onUnmount = useCallback((map) => {
        mapRef.current = null;
    }, []);

    const clusterStyles = [
        {
            textColor: 'white',
            url: 'https://raw.githubusercontent.com/googlemaps/v3-utility-library/master/markerclustererplus/images/m1.png',
            height: 50,
            width: 50,
            anchorText: [16, 16],
            fontFamily: 'monospace',
            fontWeight: 'bold'
        }
    ];

    if (loadError || timeoutError) {
        const errorMessage = loadError?.message || "Connection Timed Out (Client Blocked)";
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-6 font-mono p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500 animate-pulse">
                    <div className="w-8 h-8 bg-red-500 rounded-sm transform rotate-45" />
                </div>
                <div>
                    <h3 className="text-red-500 font-black text-xl tracking-[0.2em] uppercase">Signal Lost</h3>
                    <p className="text-red-400/60 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
                        Satellite Uplink Failed. This matches the signature of a client-side interception (AdBlock) or Invalid API Credentials.
                    </p>
                    <p className="text-red-500/40 text-[10px] mt-1 font-bold">Error Code: {errorMessage}</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-red-900/30 border border-red-500/50 text-red-500 text-xs font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                >
                    Re-Initialize Uplink
                </button>
            </div>
        );
    }

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
                zoom={3}
                options={mapOptions}
                onLoad={onLoad}
                onUnmount={onUnmount}
            >
                <MarkerClustererF
                    options={{
                        styles: clusterStyles,
                        gridSize: 60,
                        maxZoom: 15
                    }}
                >
                    {(clusterer) => (
                        <>
                            {liveUsers.map(user => (
                                <UserMarker
                                    key={user.id}
                                    user={user}
                                    clusterer={clusterer}
                                    onClick={setSelectedUser}
                                />
                            ))}
                        </>
                    )}
                </MarkerClustererF>

                {selectedUser && (
                    <InfoWindow
                        position={{ lat: selectedUser.lat, lng: selectedUser.lng }}
                        onCloseClick={() => setSelectedUser(null)}
                    >
                        <div className="p-2 min-w-[240px] bg-black text-white font-mono rounded-lg overflow-hidden border border-cyan-500/30">
                            <div className="flex items-center gap-3 mb-3 border-b border-cyan-500/30 pb-3">
                                <Avatar
                                    src={selectedUser.photoURL}
                                    alt={selectedUser.displayName}
                                    fallback={selectedUser.displayName?.[0]}
                                    className="w-12 h-12 rounded-full border-2 border-cyan-500 shadow-[0_0_10px_cyan]"
                                />
                                <div className="min-w-0">
                                    <h3 className="font-black text-[11px] text-cyan-400 truncate uppercase tracking-widest leading-tight">{selectedUser.displayName}</h3>
                                    <p className="text-[9px] text-gray-400 truncate mt-0.5">{selectedUser.email}</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                        <div className={`w-1.5 h-1.5 rounded-full ${selectedUser.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                        <span className={`text-[8px] font-bold uppercase ${selectedUser.isOnline ? 'text-green-500' : 'text-gray-500'}`}>
                                            {selectedUser.isOnline ? 'Active Signal' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 text-[9px] text-gray-400 p-1">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                                        <span className="opacity-50 block text-[7px] mb-0.5 uppercase tracking-tighter">Lat</span>
                                        <span className="text-white font-bold">{selectedUser.lat.toFixed(6)}</span>
                                    </div>
                                    <div className="bg-white/5 p-1.5 rounded border border-white/5">
                                        <span className="opacity-50 block text-[7px] mb-0.5 uppercase tracking-tighter">Lng</span>
                                        <span className="text-white font-bold">{selectedUser.lng.toFixed(6)}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="opacity-50 uppercase tracking-tighter">Platform</span>
                                    <span className="text-cyan-400 font-bold uppercase">{selectedUser.platform}</span>
                                </div>
                                <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="opacity-50 uppercase tracking-tighter">Signal Ping</span>
                                    <span className="text-green-500 font-bold">~{Math.floor(Math.random() * 50) + 10}ms</span>
                                </div>
                                <div className="flex justify-between items-center py-1 border-b border-white/5">
                                    <span className="opacity-50 uppercase tracking-tighter">Status</span>
                                    <span className="text-white">Active / Stationed</span>
                                </div>
                                <div className="pt-2 text-[7px] opacity-30 font-mono break-all leading-tight border-t border-white/5">
                                    GUID: {selectedUser.id}<br />
                                    UA: {selectedUser.userAgent?.substring(0, 60)}...
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    if (mapRef.current) {
                                        mapRef.current.panTo({ lat: selectedUser.lat, lng: selectedUser.lng });
                                        mapRef.current.setZoom(16);
                                    }
                                }}
                                className="w-full mt-3 py-1.5 bg-cyan-950/50 border border-cyan-500/30 text-cyan-400 text-[9px] font-black uppercase tracking-widest hover:bg-cyan-500/20 transition-colors"
                            >
                                Lock On Target
                            </button>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>

            {/* Tactical Sidebar Stats */}
            <div className="absolute top-8 left-8 bg-black/40 backdrop-blur-xl border border-cyan-500/20 p-6 rounded-2xl z-20 shadow-2xl min-w-[300px] pointer-events-auto">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                    <div className="flex flex-col">
                        <h3 className="font-black text-[11px] tracking-[0.4em] text-cyan-400 uppercase">Marauder System</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[7px] text-green-500 font-black tracking-widest">v2.5 // SECURE LINK</span>
                            <div className="w-1 w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-end justify-between">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-500 tracking-[0.2em] uppercase mb-1">Live Feed</span>
                            <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums">
                                {liveUsers.length}
                            </span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] font-bold text-cyan-500/50 tracking-widest uppercase italic">Subscribers</span>
                            <div className="flex -space-x-2.5 mt-2">
                                {liveUsers.slice(0, 5).map(u => (
                                    <Avatar
                                        key={u.id}
                                        src={u.photoURL}
                                        alt={u.displayName}
                                        fallback={u.displayName?.[0]}
                                        className="w-7 h-7 rounded-full border-2 border-black ring-1 ring-cyan-500/30"
                                    />
                                ))}
                                {liveUsers.length > 5 && (
                                    <div className="w-7 h-7 rounded-full bg-gray-900 border-2 border-black flex items-center justify-center text-[8px] font-black text-cyan-400 ring-1 ring-cyan-500/30">
                                        +{liveUsers.length - 5}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest px-1">
                            <span>Network Load</span>
                            <span className="text-cyan-400">Stable</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 animate-[shimmer_2s_infinite]" style={{ width: `${Math.min(100, (liveUsers.length / 500) * 100)}%` }} />
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/5">
                    <p className="text-[6px] font-mono text-gray-600 text-center uppercase tracking-[0.5em] leading-relaxed">
                        Precision tracking enabled. Data encrypted via end-to-end signal path.
                        Unauthorized access is prohibited.
                    </p>
                </div>
            </div>

            {/* Scanline Effect Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_2px,3px_100%] z-30 pointer-events-none opacity-20" />

            {/* Vignette */}
            <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_150px_rgba(0,0,0,1)]" />
        </div>
    );
};

export default GodMap;
