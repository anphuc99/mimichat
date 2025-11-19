import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import http from '../services/HTTPService';

const Login: React.FC = () => {
  const [clientToken, setClientToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!clientToken.trim()) {
      setError('Bạn chưa nhập token');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await http.login(clientToken.trim());
      if (!res.ok) {
        setError(res.error || 'Login failed');
      } else {
        const verify = await http.verify();
        if (!verify.ok) {
          setError(verify.error || 'Không thể xác thực token');
          return;
        }
        navigate('/');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to connect to the server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      gap: '1rem',
      backgroundColor: '#f0f2f5'
    }}>
      <h2>Mimi Messenger Login</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '2rem', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)', minWidth: '300px' }}>
        <input
          type="password"
          value={clientToken}
          onChange={(e) => setClientToken(e.target.value)}
          placeholder="Enter access token"
          style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
          disabled={loading}
        />
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ padding: '0.5rem', borderRadius: '4px', border: 'none', backgroundColor: loading ? '#6c757d' : '#007bff', color: 'white', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Đang xử lý...' : 'Login'}
        </button>
        {error && <p style={{ color: 'red', margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
};

export default Login;
