import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { BrandMonitoredView } from './BrandMonitoredView';
import { BrandSinglePostsView } from './BrandSinglePostsView';

export const BrandCommentsLayout = () => {
  const location = useLocation();

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', marginBottom: '1rem' }}>Comments Suggester</h1>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.5rem',
          }}
        >
          <NavLink
            to="monitored"
            className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}
            style={{
              textDecoration: 'none',
              color: location.pathname.includes('/monitored') ? '#58a6ff' : '#8b949e',
              fontWeight: location.pathname.includes('/monitored') ? 600 : 400,
              padding: '0.5rem 1rem',
              borderBottom: location.pathname.includes('/monitored') ? '2px solid #58a6ff' : 'none',
            }}
          >
            Monitored Profiles
          </NavLink>
          <NavLink
            to="single"
            className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}
            style={{
              textDecoration: 'none',
              color: location.pathname.includes('/single') ? '#58a6ff' : '#8b949e',
              fontWeight: location.pathname.includes('/single') ? 600 : 400,
              padding: '0.5rem 1rem',
              borderBottom: location.pathname.includes('/single') ? '2px solid #58a6ff' : 'none',
            }}
          >
            Single Posts
          </NavLink>
        </div>
      </div>

      <Routes>
        <Route path="monitored" element={<BrandMonitoredView />} />
        <Route path="single" element={<BrandSinglePostsView />} />
        <Route path="*" element={<Navigate to="monitored" replace />} />
      </Routes>
    </div>
  );
};
