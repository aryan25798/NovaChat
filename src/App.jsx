import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { StatusProvider } from './contexts/StatusContext';
import { FriendProvider } from './contexts/FriendContext';

// Lazy Load Components
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const MainLayout = lazy(() => import('./layouts/MainLayout'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const EmptyState = lazy(() => import('./components/EmptyState'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const CallsPage = lazy(() => import('./pages/CallsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));

// Loading Fallback
const Loading = () => (
  <div className="flex items-center justify-center h-screen w-screen bg-whatsapp-background dark:bg-gray-900 text-whatsapp-teal">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-whatsapp-teal/30 border-t-whatsapp-teal rounded-full animate-spin" />
      <div className="text-sm font-medium uppercase tracking-widest">Loading WhatsApp...</div>
    </div>
  </div>
);

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
}

import { useState, useEffect } from 'react';

const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

const ConnectivityMonitor = ({ children }) => {
  const isOnline = useOnlineStatus();
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowNotification(true);
    } else {
      // Keep "Online" notification briefly or hide immediately
      const timer = setTimeout(() => setShowNotification(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return (
    <div className="relative flex flex-col h-screen overflow-hidden">
      {!isOnline && (
        <div className="bg-[#ea0038] text-white text-xs py-1.5 px-4 text-center animate-in slide-in-from-top duration-300 z-[999]">
          Computer offline. <span className="underline cursor-pointer" onClick={() => window.location.reload()}>Reconnect</span>
        </div>
      )}
      {isOnline && showNotification && (
        <div className="bg-[#00a884] text-white text-xs py-1.5 px-4 text-center animate-in slide-in-from-top duration-300 z-[999]">
          Back online.
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
};

import DeliveryStatusListener from './components/DeliveryStatusListener';

const App = () => {
  return (
    <NotificationProvider>
      <DeliveryStatusListener />
      <FriendProvider>
        <StatusProvider>
          <ConnectivityMonitor>
            <Router>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/share" element={<PrivateRoute><SharePage /></PrivateRoute>} />
                  <Route path="/admin" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
                  <Route
                    path="/"
                    element={
                      <PrivateRoute>
                        <MainLayout />
                      </PrivateRoute>
                    }
                  >
                    <Route index element={<EmptyState />} />
                    <Route path="c/:id" element={<ChatPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="status" element={<StatusPage />} />
                    <Route path="calls" element={<CallsPage />} />
                    <Route path="contacts" element={<ContactsPage />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Suspense>
            </Router>
          </ConnectivityMonitor>
        </StatusProvider>
      </FriendProvider>
    </NotificationProvider>
  );
};

export default App;
