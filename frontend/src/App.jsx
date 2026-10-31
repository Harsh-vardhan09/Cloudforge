import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Market from './pages/Market';
import Jobs from './pages/Jobs';
import Billing from './pages/Billing';
import ApiMarket from './pages/ApiMarket';
import ApiPlayground from './pages/ApiPlayground';
import Host from './pages/Host';
import Migration from './pages/Migration';
import Login from './pages/Login';
import { Loader2 } from 'lucide-react';
import './index.css';

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="market" element={<Market />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="migration" element={<Migration />} />
            <Route path="billing" element={<Billing />} />
            <Route path="host" element={<Host />} />
            <Route path="ai-market" element={<ApiMarket />} />
            <Route path="ai-sandbox" element={<ApiPlayground />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
