import { useEffect } from 'react';
import { isAuthenticated, redirectToLogin } from '../lib/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isAuthenticated()) {
      redirectToLogin();
    }
  }, []);

  if (!isAuthenticated()) return null;

  return <>{children}</>;
}
