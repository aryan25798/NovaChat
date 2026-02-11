import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './utils/consoleFilter.js' // Suppress expected Firebase errors
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

// Service Worker registration is handled automatically by vite-plugin-pwa based on vite.config.js

