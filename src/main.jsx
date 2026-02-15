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
/* 
// Register PWA Service Worker (DISABLED: Using manual registration in NotificationContext for FCM consistency)
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New content available, please refresh.');
  },
  onOfflineReady() {
    console.log('App ready to work offline.');
  },
});
*/

// --- Service Worker Migration & Purge Logic (Legacy) ---
if ('serviceWorker' in navigator) {
  const MIGRATION_KEY = 'nova_sw_migrated_v6'; // Bumped to v6 for fresh cycle
  if (!localStorage.getItem(MIGRATION_KEY)) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        const url = registration.active?.scriptURL || "";
        // Only unregister OLD/LEGACY paths, NOT our new standard one
        if (url.includes('firebase-messaging-sw') && !url.includes('firebase-messaging-sw.js')) {
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

