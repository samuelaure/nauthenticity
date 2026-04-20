import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken, redirectToLogin } from '../lib/auth';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      redirectToLogin();
      return;
    }

    setToken(token);
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <p style={{ color: 'var(--text-secondary, #888)' }}>Iniciando sesión…</p>
    </div>
  );
}
