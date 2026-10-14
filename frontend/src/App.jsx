/**
 * ═══════════════════════════════════════════════════════════════
 * KAAPAV APP - Main Application with Routing
 * ═══════════════════════════════════════════════════════════════
 */

import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, useUIStore, useChatStore, useOrderStore } from './store';

// Components
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import LoadingScreen from './components/LoadingScreen';
import OfflineBanner from './components/OfflineBanner';

// Lazy load screens for better performance
const Login = lazy(() => import('./screens/Login'));
const Dashboard = lazy(() => import('./screens/Dashboard'));
const StudioDashboard = lazy(() => import('./screens/StudioDashboard'));
const Chats = lazy(() => import('./screens/Chats'));
const ChatWindow = lazy(() => import('./screens/ChatWindow'));
const Orders = lazy(() => import('./screens/Orders'));
const OrderDetail = lazy(() => import('./screens/OrderDetail'));
const Products = lazy(() => import('./screens/Products'));
const ProductDetail = lazy(() => import('./screens/ProductDetail'));
const Customers = lazy(() => import('./screens/Customers'));
const Broadcasts = lazy(() => import('./screens/Broadcasts'));
const Settings = lazy(() => import('./screens/Settings'));

// ═══════════════════════════════════════════════════════════════
// PROTECTED ROUTE WRAPPER
// ═══════════════════════════════════════════════════════════════

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// ═══════════════════════════════════════════════════════════════
// APP LAYOUT (with bottom nav)
// ═══════════════════════════════════════════════════════════════

function AppLayout({ children, showNav = true }) {
  const location = useLocation();
  
  // Hide nav on certain routes
  const hideNavRoutes = ['/login', '/chat/'];
  const shouldShowNav = showNav && !hideNavRoutes.some(route => 
    location.pathname.startsWith(route) || location.pathname === route
  );

  return (
    <div className="app">
      {children}
      {shouldShowNav && <BottomNav />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════

function App() {
  const { isAuthenticated, token } = useAuthStore();
  const { toast, isOffline, globalLoading } = useUIStore();
  const { unreadTotal } = useChatStore();
  const { pendingCount } = useOrderStore();

  // Update document title with notifications
  useEffect(() => {
    const totalBadge = unreadTotal + pendingCount;
    document.title = totalBadge > 0 
      ? `(${totalBadge}) KAAPAV Business` 
      : 'KAAPAV Business';
  }, [unreadTotal, pendingCount]);

  // Setup real-time connection when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      // Initialize real-time connection (SSE/WebSocket)
      // This will be implemented in the real-time service
      setupRealtimeConnection(token);
    }

    return () => {
      // Cleanup connection on logout
      cleanupRealtimeConnection();
    };
  }, [isAuthenticated, token]);

  // Register service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration);
        })
        .catch((error) => {
          console.error('SW registration failed:', error);
        });
    }
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
        <AppLayout>
          <Routes>
            {/* Public Routes */}
            <Route 
              path="/login" 
              element={
                isAuthenticated ? <Navigate to="/chats" replace /> : <Login />
              } 
            />

            {/* Protected Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />

            <Route path="/studio" element={
              <ProtectedRoute><StudioDashboard /></ProtectedRoute>
            } />
            
            <Route path="/chats" element={
              <ProtectedRoute><Chats /></ProtectedRoute>
            } />
            
            <Route path="/chat/:phone" element={
              <ProtectedRoute><ChatWindow /></ProtectedRoute>
            } />
            
            <Route path="/orders" element={
              <ProtectedRoute><Orders /></ProtectedRoute>
            } />
            
            <Route path="/orders/:orderId" element={
              <ProtectedRoute><OrderDetail /></ProtectedRoute>
            } />
            
            <Route path="/products" element={
              <ProtectedRoute><Products /></ProtectedRoute>
            } />
            
            <Route path="/products/:sku" element={
              <ProtectedRoute><ProductDetail /></ProtectedRoute>
            } />
            
            <Route path="/customers" element={
              <ProtectedRoute><Customers /></ProtectedRoute>
            } />
            
            <Route path="/broadcasts" element={
              <ProtectedRoute><Broadcasts /></ProtectedRoute>
            } />
            
            <Route path="/settings" element={
              <ProtectedRoute><Settings /></ProtectedRoute>
            } />

            {/* Redirect root to chats or login */}
            <Route 
              path="/" 
              element={<Navigate to={isAuthenticated ? "/chats" : "/login"} replace />} 
            />

            {/* 404 - Redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Suspense>

      {/* Global UI Elements */}
      {toast?.visible && <Toast message={toast.message} type={toast.type} />}
      {isOffline && <OfflineBanner />}
      {globalLoading && <LoadingScreen overlay />}
    </BrowserRouter>
  );
}

// ═══════════════════════════════════════════════════════════════
// REAL-TIME CONNECTION HELPERS
// ═══════════════════════════════════════════════════════════════

let eventSource = null;

function setupRealtimeConnection(token) {
  // Use Server-Sent Events for real-time updates
  const apiUrl = import.meta.env.VITE_API_URL || '';
  
  // Close existing connection
  if (eventSource) {
    eventSource.close();
  }

  // For now, we'll use polling as a fallback
  // SSE endpoint would be: `${apiUrl}/api/events?token=${token}`
  console.log('[Realtime] Connection would be established here');
}

function cleanupRealtimeConnection() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export default App;
