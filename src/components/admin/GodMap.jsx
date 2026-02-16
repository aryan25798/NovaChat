import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, OverlayViewF, InfoWindow, MarkerClustererF } from '@react-google-maps/api';
import { db } from '../../firebase';
import { collection, query, onSnapshot, orderBy, limit, where, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { Virtuoso } from 'react-virtuoso';

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

const UserMarker = React.memo(({ user, onClick, batterySaver }) => (
    <OverlayViewF
        position={{ lat: user.lat, lng: user.lng }}
        mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
        <div
            onClick={(e) => {
                e.stopPropagation();
                onClick(user);
            }}
            className={`group cursor-pointer flex flex-col items-center -translate-x-1/2 -translate-y-full pb-2 hover:z-50 active:scale-95 transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${user.isActive ? 'opacity-100 scale-100' : 'opacity-60 scale-90'}`}
        >
            {/* Pulsing Aura - Disabled in Battery Saver or Offline */}
            {!batterySaver && user.isActive && (
                <div className="absolute inset-0 w-12 h-12 -translate-x-1/2 -translate-y-[calc(100%+8px)] bg-cyan-500/10 rounded-full animate-ping pointer-events-none" />
            )}

            {/* User Avatar */}
            <div className="relative">
                <div className={`w-10 h-10 rounded-full border-2 p-0.5 bg-black transition-all duration-300 overflow-hidden flex items-center justify-center ${user.isActive ? 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)] group-hover:shadow-[0_0_30px_rgba(34,211,238,0.8)]' : 'border-gray-600 grayscale brightness-50 shadow-none'}`}>
                    <Avatar
                        src={user.photoURL}
                        alt={user.displayName}
                        fallback={user.displayName?.[0]}
                        className="w-full h-full rounded-full"
                    />
                </div>
                {/* Online Indicator Dot */}
                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${user.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-700'}`} />
            </div>

            {/* Name Label */}
            <div className={`mt-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-md border rounded-md shadow-lg transition-colors ${user.isActive ? 'border-cyan-500/30 text-white' : 'border-gray-800 text-gray-500'}`}>
                <span className="text-[10px] font-black whitespace-nowrap uppercase tracking-widest leading-none">
                    {user.displayName?.split(' ')[0] || 'Unknown'}
                </span>
            </div>

            {/* Pointer Stem */}
            <div className={`w-px h-2 mt-0.5 ${user.isActive ? 'bg-gradient-to-t from-transparent to-cyan-500/50' : 'bg-gray-800'}`} />
        </div>
    </OverlayViewF>
));

const GodMap = () => {
    const [liveUsers, setLiveUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [batterySaver, setBatterySaver] = useState(false);
    const [lastSync, setLastSync] = useState(Date.now());
    const [searchQuery, setSearchQuery] = useState('');
    const [showSidebar, setShowSidebar] = useState(false);
    const mapRef = useRef(null);
    const { currentUser } = useAuth();
    const updateBatchRef = useRef([]);
    const lastUpdateRef = useRef(0);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    });

    const [timeoutError, setTimeoutError] = useState(false);

    useEffect(() => {
        if (!isLoaded && !loadError) {
            const timer = setTimeout(() => {
                setTimeoutError(true);
            }, 8000);
            return () => clearTimeout(timer);
        }
    }, [isLoaded, loadError]);

    useEffect(() => {
        if (!currentUser) return;

        // NEURAL SYNC: Fetch all known locations (Online + Offline)
        // Scalability: We no longer filter by time here to show last known positions.
        const q = query(
            collection(db, 'user_locations')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).filter(u => {
                const isValid = u.lat && u.lng;
                const isNotAdmin = !u.isAdmin && !u.superAdmin && u.email !== 'admin@system.com';
                return isValid && isNotAdmin;
            });

            // THROTTLING: Batch updates to save DOM re-renders and CPU
            const now = Date.now();
            const delay = batterySaver ? 10000 : 3000; // 10s if saver on, 3s if off

            if (now - lastUpdateRef.current >= delay) {
                setLiveUsers(users);
                setLastSync(now);
                lastUpdateRef.current = now;
            } else {
                updateBatchRef.current = users;
            }
        });

        // Forced Refresh Interval for batched data
        const refreshInterval = setInterval(() => {
            if (updateBatchRef.current.length > 0) {
                setLiveUsers(updateBatchRef.current);
                setLastSync(Date.now());
                updateBatchRef.current = [];
            }
        }, 5000);

        return () => {
            unsubscribe();
            clearInterval(refreshInterval);
        };
    }, [currentUser, batterySaver]);

    const filteredUsers = useMemo(() => {
        if (!searchQuery) return liveUsers;
        return liveUsers.filter(u =>
            u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [liveUsers, searchQuery]);

    const center = useMemo(() => ({ lat: 20, lng: 0 }), []);
    const onLoad = useCallback((map) => { mapRef.current = map; }, []);
    const onUnmount = useCallback(() => { mapRef.current = null; }, []);

    const clusterOptions = {
        gridSize: 50,
        maxZoom: 15,
        styles: [
            {
                textColor: 'white',
                url: 'https://raw.githubusercontent.com/googlemaps/v3-utility-library/master/markerclustererplus/images/m1.png',
                height: 50,
                width: 50,
                anchorText: [16, 16],
                fontFamily: 'monospace',
                fontWeight: 'bold'
            }
        ]
    };

    if (loadError || timeoutError) {
        // ... (Error UI kept as is for stability)
        return (
            <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-6 font-mono p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500 animate-pulse">
                    <div className="w-8 h-8 bg-red-500 rounded-sm transform rotate-45" />
                </div>
                <div>
                    <h3 className="text-red-500 font-black text-xl tracking-[0.2em] uppercase">Signal Lost</h3>
                    <p className="text-red-400/60 text-xs mt-2 max-w-sm mx-auto leading-relaxed">卫星链路失败。</p>
                </div>
            </div>
        );
    }

    if (!isLoaded) return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-4 font-mono">
            <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_cyan]" />
            <span className="text-cyan-500 animate-pulse text-xs font-black tracking-widest uppercase">Initializing Global Marauder Net...</span>
        </div>
    );

    return (
        <div className="h-full w-full relative z-0 bg-[#000000] overflow-hidden">
            {/* Grid Line Overlay - Hidden in Battery Saver */}
            {!batterySaver && (
                <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none z-10" />
            )}

            <GoogleMap
                mapContainerStyle={containerStyle}
                center={center}
                zoom={3}
                options={mapOptions}
                onLoad={onLoad}
                onUnmount={onUnmount}
                onClick={() => setSelectedUser(null)}
            >
                <MarkerClustererF options={clusterOptions}>
                    {(clusterer) => (
                        <>
                            {liveUsers.map(user => (
                                <UserMarker
                                    key={user.id}
                                    user={{
                                        ...user,
                                        isActive: user.timestamp?.toDate ? (Date.now() - user.timestamp.toDate().getTime() < 900000) : false
                                    }}
                                    clusterer={clusterer}
                                    onClick={setSelectedUser}
                                    batterySaver={batterySaver}
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
                        <div className="p-4 min-w-[300px] bg-[#0a0a0b] text-white font-mono rounded-xl overflow-hidden border border-cyan-500/40 shadow-[0_0_60px_rgba(0,0,0,0.9)] scale-105">
                            <div className="flex items-center gap-5 mb-5 border-b border-white/10 pb-5">
                                <div className="relative group">
                                    <Avatar
                                        src={selectedUser.photoURL}
                                        alt={selectedUser.displayName}
                                        fallback={selectedUser.displayName?.[0]}
                                        className={`w-16 h-16 rounded-full border-2 shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-transform group-hover:scale-110 ${selectedUser.timestamp?.toDate && (Date.now() - selectedUser.timestamp.toDate().getTime() < 900000) ? 'border-cyan-500' : 'border-gray-600 grayscale'}`}
                                    />
                                    <div className={`absolute bottom-0 right-0 w-5 h-5 rounded-full border-2 border-[#0a0a0b] ${selectedUser.timestamp?.toDate && (Date.now() - selectedUser.timestamp.toDate().getTime() < 900000) ? 'bg-green-500 animate-pulse' : 'bg-gray-700'} shadow-[0_0_10px_rgba(0,0,0,0.5)]`} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-black text-base text-cyan-400 truncate uppercase tracking-tighter leading-none mb-1">{selectedUser.displayName}</h3>
                                    <p className="text-[11px] text-gray-400 truncate font-bold tracking-tight mb-2 opacity-80">{selectedUser.email}</p>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded shadow-sm ${selectedUser.timestamp?.toDate && (Date.now() - selectedUser.timestamp.toDate().getTime() < 900000) ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-500/20 text-gray-500 border border-gray-500/30'}`}>
                                            {selectedUser.timestamp?.toDate && (Date.now() - selectedUser.timestamp.toDate().getTime() < 900000) ? 'Active Link' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-center">
                                        <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Global Coordinates</span>
                                        <span className="text-xs text-cyan-400 font-bold tabular-nums">
                                            {(selectedUser.lat || 0).toFixed(6)}, {(selectedUser.lng || 0).toFixed(6)}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2.5 bg-white/5 p-4 rounded-lg border border-white/10 shadow-inner">
                                    <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-gray-500 uppercase font-black tracking-tighter">Identity Tag</span>
                                        <span className="text-white font-mono font-bold bg-white/5 px-2 py-0.5 rounded text-[10px]">ID_{selectedUser.id.slice(-8).toUpperCase()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-gray-500 uppercase font-black tracking-tighter">Node Environment</span>
                                        <span className="text-cyan-500 font-black uppercase italic">{selectedUser.platform || 'General Terminal'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-gray-500 uppercase font-black tracking-tighter">Last Seen</span>
                                        <span className="text-white font-black uppercase">
                                            {selectedUser.timestamp?.toDate ? format(selectedUser.timestamp.toDate(), 'MMM dd | HH:mm:ss') : 'Unknown'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    if (mapRef.current) {
                                        mapRef.current.panTo({ lat: selectedUser.lat, lng: selectedUser.lng });
                                        mapRef.current.setZoom(17);
                                    }
                                }}
                                className="w-full mt-5 py-3 bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-[0_5px_20px_rgba(34,211,238,0.3)] hover:shadow-[0_8px_25px_rgba(34,211,238,0.4)] active:scale-95 flex items-center justify-center gap-2"
                            >
                                Neural Lock-On ⊕
                            </button>
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>

            {/* Floating Hamburger Toggle */}
            <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`absolute top-6 left-6 z-50 p-3 rounded-full border backdrop-blur-xl transition-all duration-500 hover:scale-110 active:scale-95 shadow-2xl ${showSidebar ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.5)]' : 'bg-black/60 border-cyan-500/30 text-cyan-400 hover:border-cyan-400'}`}
            >
                <div className="flex flex-col gap-1 w-5 h-4 justify-between items-center">
                    <div className={`h-[2px] w-full bg-current rounded-full transition-transform duration-500 ${showSidebar ? 'translate-y-[7px] rotate-45' : ''}`} />
                    <div className={`h-[2px] w-full bg-current rounded-full transition-opacity duration-300 ${showSidebar ? 'opacity-0' : ''}`} />
                    <div className={`h-[2px] w-full bg-current rounded-full transition-transform duration-500 ${showSidebar ? '-translate-y-[7px] -rotate-45' : ''}`} />
                </div>
            </button>
            <div className={`absolute top-8 left-8 bottom-8 flex flex-col gap-4 z-20 pointer-events-auto transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${showSidebar ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0'}`}>
                {/* Tactical Control Sidebar */}
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl min-w-[320px] shrink-0">
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                        <div className="flex flex-col">
                            <h3 className="font-black text-[11px] tracking-[0.4em] text-cyan-400 uppercase leading-none">Marauder System</h3>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-[7px] text-green-500 font-black tracking-widest uppercase">v3.0 // Tactical Link</span>
                                <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                            </div>
                        </div>
                        <button
                            onClick={() => setBatterySaver(!batterySaver)}
                            className={`px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest transition-all ${batterySaver ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500'}`}
                        >
                            {batterySaver ? 'Battery: Eco' : 'Battery: Performance'}
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-end justify-between">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-gray-500 tracking-[0.2em] uppercase mb-1">Total Nodes</span>
                                <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                    {liveUsers.length}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-bold text-cyan-500/50 tracking-widest uppercase italic mb-2">Sync Delta</span>
                                <span className="text-[10px] font-mono font-bold text-green-500">
                                    {Math.floor((Date.now() - lastSync) / 1000)}s
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest px-1">
                                <span>Active Spectrum</span>
                                <span className="text-cyan-400">
                                    {liveUsers.filter(u => u.timestamp?.toDate && (Date.now() - u.timestamp.toDate().getTime() < 900000)).length} NODES
                                </span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-cyan-500 transition-all duration-1000"
                                    style={{ width: `${(liveUsers.filter(u => u.timestamp?.toDate && (Date.now() - u.timestamp.toDate().getTime() < 900000)).length / Math.max(1, liveUsers.length)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-white/5 opacity-40">
                        <p className="text-[6px] font-mono text-gray-500 text-center uppercase tracking-[0.4em] leading-relaxed">
                            Encrypted Neural Path • Adaptive Throttling Active
                        </p>
                    </div>
                </div>

                {/* Industrial User List */}
                <div className="bg-black/60 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl shadow-2xl min-w-[300px] flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="p-4 border-b border-white/5">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search Neural Nodes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-[10px] text-cyan-400 font-mono placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_cyan]" />
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden">
                        {filteredUsers.length === 0 ? (
                            <div className="py-8 text-center opacity-30">
                                <span className="text-[8px] font-black uppercase tracking-[0.2em]">No Nodes Found</span>
                            </div>
                        ) : (
                            <Virtuoso
                                data={filteredUsers}
                                className="custom-scrollbar"
                                style={{ height: '100%' }}
                                itemContent={(index, user) => {
                                    const isUserActive = user.timestamp?.toDate && (Date.now() - user.timestamp.toDate().getTime() < 900000);
                                    return (
                                        <div className="p-1 px-2">
                                            <div
                                                key={user.id}
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    if (mapRef.current) {
                                                        mapRef.current.panTo({ lat: user.lat, lng: user.lng });
                                                        mapRef.current.setZoom(14);
                                                    }
                                                }}
                                                className={`group flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all duration-300 ${selectedUser?.id === user.id ? 'bg-cyan-500/20 border border-cyan-500/30' : 'hover:bg-white/5 border border-transparent hover:border-white/10'}`}
                                            >
                                                <div className="relative shrink-0">
                                                    <Avatar
                                                        src={user.photoURL}
                                                        alt={user.displayName}
                                                        fallback={user.displayName?.[0]}
                                                        className={`size-8 rounded-full border border-white/10 shadow-[0_0_10px_rgba(0,0,0,0.5)] transition-all ${isUserActive ? 'opacity-100' : 'opacity-40 grayscale'}`}
                                                    />
                                                    <div className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-black ${isUserActive ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-gray-600'}`} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className={`text-[10px] font-black truncate uppercase tracking-wider ${isUserActive ? 'text-white' : 'text-gray-500'}`}>{user.displayName}</span>
                                                        <span className={`shrink-0 text-[7px] font-black uppercase px-1 rounded ${isUserActive ? 'text-green-400 bg-green-500/10 border border-green-500/20' : 'text-gray-600 bg-gray-500/5'}`}>
                                                            {isUserActive ? 'Active' : 'Offline'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase truncate">{user.platform || 'Node'}</span>
                                                        <div className="size-1 rounded-full bg-white/10" />
                                                        <span className="text-[8px] text-gray-400 font-mono">{(user.lat || 0).toFixed(2)}, {(user.lng || 0).toFixed(2)}</span>
                                                    </div>
                                                </div>
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 group-hover:translate-x-0">
                                                    <div className="size-4 flex items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                                        <span className="text-[10px] font-black">⊕</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        )}
                    </div>

                    <div className="p-3 border-t border-white/5 bg-white/5">
                        <div className="flex items-center justify-between text-[7px] font-black text-gray-500 uppercase tracking-widest px-1">
                            <span>Encrypted Link</span>
                            <span className="text-cyan-500/50 animate-pulse">Tracking active</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Visual Effects - Conditional for battery saving */}
            {!batterySaver && (
                <>
                    {/* Scanline Effect */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_2px,3px_100%] z-30 pointer-events-none opacity-20" />
                    {/* Vignette */}
                    <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_150px_rgba(0,0,0,1)]" />
                </>
            )}
        </div>
    );
};

export default GodMap;
