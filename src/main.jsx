import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { CallProvider } from './contexts/CallContext'
import { PresenceProvider } from './contexts/PresenceContext'
import { ThemeProvider } from './contexts/ThemeContext'





import { registerSW } from 'virtual:pwa-register';

// Register PWA Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New content available, please refresh.');
  },
  onOfflineReady() {
    console.log('App ready to work offline.');
  },
});

// --- Service Worker Migration & Purge Logic (Legacy) ---
if ('serviceWorker' in navigator) {
  const MIGRATION_KEY = 'nova_sw_migrated_v5'; // Bumped version
  if (!localStorage.getItem(MIGRATION_KEY)) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        // Only unregister if it's NOT our current sw.js or if it's from a legacy path
        if (registration.active?.scriptURL.includes('firebase-messaging-sw')) {
          registration.unregister();
          console.log('Legacy FCM Service Worker unregistered.');
        }
      }
      localStorage.setItem(MIGRATION_KEY, 'true');
    });
  }
}
// ----------------------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <CallProvider>
          <PresenceProvider>
            <App />
          </PresenceProvider>
        </CallProvider>
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>,
)

