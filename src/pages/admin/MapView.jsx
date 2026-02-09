import React, { useEffect, useRef } from "react";
import { FaMapMarkedAlt } from "react-icons/fa";

export default function MapView({ users }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markers = useRef({});

    useEffect(() => {
        if (!window.google || !mapRef.current || mapInstance.current) return;

        mapInstance.current = new window.google.maps.Map(mapRef.current, {
            center: { lat: 20, lng: 77 },
            zoom: 3,
            styles: [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            ]
        });
    }, []);

    useEffect(() => {
        if (!mapInstance.current || !window.google) return;

        users.forEach(user => {
            const loc = user.lastLoginLocation;
            if (loc && loc.lat && loc.lng) {
                if (markers.current[user.id]) {
                    markers.current[user.id].setPosition({ lat: loc.lat, lng: loc.lng });
                } else {
                    const marker = new window.google.maps.Marker({
                        position: { lat: loc.lat, lng: loc.lng },
                        map: mapInstance.current,
                        title: user.displayName,
                        icon: {
                            url: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
                            scaledSize: new window.google.maps.Size(40, 40),
                            origin: new window.google.maps.Point(0, 0),
                            anchor: new window.google.maps.Point(20, 20),
                        }
                    });

                    const infoWindow = new window.google.maps.InfoWindow({
                        content: `<div style="color: black;"><strong>${user.displayName}</strong><br/>Status: ${user.isOnline ? 'Online' : 'Offline'}</div>`
                    });

                    marker.addListener("click", () => {
                        infoWindow.open(mapInstance.current, marker);
                    });

                    markers.current[user.id] = marker;
                }
            }
        });
    }, [users]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ padding: '20px' }}>Live Geo-Tracking</h1>
            <div className="map-container" style={{ flex: 1, position: 'relative' }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
                {!window.google && (
                    <div className="map-placeholder" style={{ position: 'absolute', inset: 0, background: '#1c2630' }}>
                        <FaMapMarkedAlt style={{ fontSize: '4rem', marginBottom: '20px' }} />
                        <p>Loading Google Maps API...</p>
                        <small>Ensure VITE_GOOGLE_MAPS_API_KEY is set in .env</small>
                    </div>
                )}
            </div>
        </div>
    );
}
