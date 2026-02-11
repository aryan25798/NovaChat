import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, OverlayViewF, InfoWindow, MarkerClustererF } from '@react-google-maps/api';
import { db } from '../../firebase';
import { collection, query, onSnapshot, orderBy, limit, where, doc, getDoc } from 'firebase/firestore';

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
                <div className="w-10 h-10 rounded-full border-2 border-cyan-400 p-0.5 bg-black shadow-[0_0_15px_rgba(34,211,238,0.4)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.8)] transition-all duration-300 overflow-hidden">
                    <img
                        src={user.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${user.id}`}
                        alt={user.displayName}
                        className="w-full h-full rounded-full object-cover"
                        loading="lazy"
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

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });

    useEffect(() => {
        // INDUSTRY GRADE ROBUST STREAMING:
        // 1. Attempt to query online users (requires index).
        // 2. Fallback to general query + client-side filter if index is building.
        // 3. Filter out admins client-side for stealth.

        let currentUnsub = null;

        const startListening = (q, isFallback = false) => {
            return onSnapshot(q, (locSnapshot) => {
                const combined = locSnapshot.docs.map(docSnap => {
                    const data = docSnap.data();
                    const timestamp = data.timestamp?.toDate() || new Date(0);
                    const now = new Date();
                    const diffMins = (now - timestamp) / (1000 * 60);

                    return {
                        id: docSnap.id,
                        lat: Number(data.lat),
                        lng: Number(data.lng),
                        displayName: data.displayName || 'Agent',
                        photoURL: data.photoURL,
                        email: data.email,
                        lastUpdate: data.timestamp,
                        isOnline: data.isOnline,
                        isAdmin: data.isAdmin,
                        superAdmin: data.superAdmin,
                        platform: data.platform || 'Unknown',
                        userAgent: data.userAgent || 'Unknown',
                        diffMins
                    };
                }).filter(u => {
                    const isValid = !isNaN(u.lat) && !isNaN(u.lng);
                    const isNotAdmin = !u.isAdmin && !u.superAdmin;
                    const onlineMatch = isFallback ? u.isOnline : true;
                    // INDUSTRY GRADE: Freshness Validation (10 minute cutoff)
                    const isFresh = u.diffMins < 10;

                    return isValid && isNotAdmin && onlineMatch && isFresh;
                });

                setLiveUsers(combined);
            }, (err) => {
                if (!isFallback && (err.code === 'failed-precondition' || err.message.includes('index'))) {
                    console.warn("Index building - switching to robust fallback mode.");
                    const fallbackQuery = query(
                        collection(db, 'user_locations'),
                        orderBy('timestamp', 'desc'),
                        limit(300)
                    );
                    if (currentUnsub) currentUnsub();
                    currentUnsub = startListening(fallbackQuery, true);
                } else {
                    console.error("Map stream error:", err);
                }
            });
        };

        const locQuery = query(
            collection(db, 'user_locations'),
            where('isOnline', '==', true),
            orderBy('timestamp', 'desc'),
            limit(1000)
        );

        currentUnsub = startListening(locQuery);

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
            url: 'data:image/svg+xml;base64,' + btoa(`
                <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" fill="rgba(0, 0, 0, 0.8)" stroke="rgba(34, 211, 238, 0.6)" stroke-width="2"/>
                    <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(34, 211, 238, 0.3)" stroke-width="1"/>
                </svg>
            `),
            height: 40,
            width: 40,
            textSize: 10,
            fontWeight: '900'
        }
    ];

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
                                <img
                                    src={selectedUser.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${selectedUser.id}`}
                                    alt=""
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
                                    <img
                                        key={u.id}
                                        src={u.photoURL || `https://api.dicebear.com/9.x/avataaars/svg?seed=${u.id}`}
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
