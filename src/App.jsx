import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

import { FriendProvider } from './contexts/FriendContext';
import { FileUploadProvider } from './contexts/FileUploadContext';
import Login from './pages/Login';
import { NotificationProvider } from './contexts/NotificationContext';
import { StatusProvider } from './contexts/StatusContext';

// ... (imports)


const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const MainLayout = lazy(() => import('./layouts/MainLayout'));
const Home = lazy(() => import('./pages/Home'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const EmptyState = lazy(() => import('./components/EmptyState'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const CallsPage = lazy(() => import('./pages/CallsPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const SharePage = lazy(() => import('./pages/SharePage'));

import Loading from './components/ui/Loading';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" />;
  return children;
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
import LocationTracker from './components/LocationTracker';
import GlobalAnnouncements from './components/GlobalAnnouncements'; // Import New Component

import ErrorBoundary from './components/ErrorBoundary';
import PermissionErrorBoundary from './components/PermissionErrorBoundary';

// Shells are defined outside and memoized to prevent re-mounting the entire tree on auth changes
const AdminShell = React.memo(() => (
  <Routes>
    <Route path="*" element={<AdminDashboard />} />
  </Routes>
));

const UserShell = React.memo(() => (
  <Routes>
    <Route element={<MainLayout />}>
      <Route index element={<Home />} />
      <Route path="c/:id" element={<ChatPage />} />
      {/* Fallback/Legacy Route */}
      <Route path="chat/:id" element={<ChatPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="status" element={<StatusPage />} />
      <Route path="calls" element={<CallsPage />} />
      <Route path="contacts" element={<ContactsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
));

const RootGate = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // If claims are not settled, we wait (Crucial for role resolution)
  if (!currentUser) return <Login />;
  if (!currentUser.claimsSettled) return <Loading />;

  const isAdmin = !!currentUser.isAdmin || !!currentUser.superAdmin;
  console.debug("[RootGate] Selecting Shell. isAdmin:", isAdmin, "email:", currentUser.email);

  return isAdmin ? <AdminShell /> : <UserShell />;
};

const App = () => {
  return (
    <ErrorBoundary>
      <PermissionErrorBoundary>

        <NotificationProvider>
          <LocationTracker />
          <DeliveryStatusListener />
          <GlobalAnnouncements />
          <FriendProvider>
            <StatusProvider>
              <FileUploadProvider>
                <ConnectivityMonitor>
                  <Router>
                    <Suspense fallback={<Loading />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/share" element={<PrivateRoute><SharePage /></PrivateRoute>} />
                        {/* ROOT GATE: Absolute isolation after login */}
                        <Route path="*" element={
                          <PrivateRoute>
                            <RootGate />
                          </PrivateRoute>
                        } />
                      </Routes>
                    </Suspense>
                  </Router>
                </ConnectivityMonitor>
              </FileUploadProvider>
            </StatusProvider>
          </FriendProvider>
        </NotificationProvider>
      </PermissionErrorBoundary>
    </ErrorBoundary>
  );
};

export default App;
