import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/store';
import { authApi } from './lib/api';
import { socketClient } from './lib/socket';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import OperatorDashboard from './pages/OperatorDashboard';
import WhatsAppQR from './pages/WhatsAppQR';
import WhatsAppManagement from './pages/WhatsAppManagement';
import LeadsManagement from './pages/LeadsManagement';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user, token } = useAuth();

  if (!token) {
    return <Navigate to="/login" />;
  }

  if (user && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/operator'} />;
  }

  return <>{children}</>;
}

function App() {
  const { token, setAuth, user } = useAuth();

  useEffect(() => {
    if (token && !user) {
      authApi.me()
        .then(({ data }) => {
          setAuth(data, token);
          // Connect WebSocket after auth
          socketClient.connect(token);
        })
        .catch(() => {
          localStorage.removeItem('token');
          window.location.href = '/login';
        });
    } else if (token) {
      // Connect WebSocket if user already loaded
      socketClient.connect(token);
    }

    return () => {
      // Disconnect WebSocket on unmount
      if (!token) {
        socketClient.disconnect();
      }
    };
  }, [token, user, setAuth]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/operator"
          element={
            <ProtectedRoute allowedRoles={['OPERATOR']}>
              <OperatorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/whatsapp-qr"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <WhatsAppQR />
            </ProtectedRoute>
          }
        />
        <Route
          path="/whatsapp"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <WhatsAppManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads"
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <LeadsManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            token ? (
              user?.role === 'ADMIN' ? (
                <Navigate to="/admin" />
              ) : (
                <Navigate to="/operator" />
              )
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
