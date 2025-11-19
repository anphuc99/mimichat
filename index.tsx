import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import Login from './components/Login';
import http from './services/HTTPService';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root not found");
const root = ReactDOM.createRoot(rootElement);

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const [state, setState] = useState<'checking' | 'ok' | 'fail'>('checking');

  useEffect(() => {
    const jwt = localStorage.getItem('jwt');
    if (!jwt) {
      setState('fail');
      return;
    }
    // Gọi server verify token
    http.verify().then(r => {
      setState(r.ok ? 'ok' : 'fail');
    }).catch(() => setState('fail'));
  }, []);

  if (state === 'checking') return <div style={{padding:20}}>Đang kiểm tra phiên...</div>;
  if (state === 'fail') return <Navigate to="/login" replace />;
  return children;
};

root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
    </Routes>
  </BrowserRouter>
);