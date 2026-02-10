import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { CallProvider } from './contexts/CallContext'
import { PresenceProvider } from './contexts/PresenceContext'
import { ThemeProvider } from './contexts/ThemeContext'





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

// Register Service Worker for PWA + FCM
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
