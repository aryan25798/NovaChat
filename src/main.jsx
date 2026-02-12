import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { CallProvider } from './contexts/CallContext'
import { PresenceProvider } from './contexts/PresenceContext'
import { ThemeProvider } from './contexts/ThemeContext'





// --- Service Worker Migration & Purge Logic ---
if ('serviceWorker' in navigator) {
  const MIGRATION_KEY = 'nova_sw_migrated_v4';
  if (!localStorage.getItem(MIGRATION_KEY)) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister();
        console.log('Stale Service Worker unregistered.');
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

