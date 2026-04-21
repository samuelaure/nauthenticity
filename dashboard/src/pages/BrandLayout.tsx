import { Routes, Route, Navigate } from 'react-router-dom';

export const BrandLayout = () => {
  return (
    <Routes>
      <Route path="content" element={<div>Content Module (Phase 3)</div>} />
      <Route path="inspobase" element={<div>InspoBase Module (Phase 3)</div>} />
      <Route path="comments/*" element={<div>Comments Suggester Module (Phase 4)</div>} />
      <Route path="benchmark" element={<div>Benchmark Module (Phase 5)</div>} />
      
      {/* Default fallback redirects to Content */}
      <Route path="*" element={<Navigate to="content" replace />} />
    </Routes>
  );
};
