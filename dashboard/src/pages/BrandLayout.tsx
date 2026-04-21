import { Routes, Route, Navigate } from 'react-router-dom';
import { BrandContentView } from './BrandContentView';
import { BrandInspoBaseView } from './BrandInspoBaseView';

export const BrandLayout = () => {
  return (
    <Routes>
      <Route path="content" element={<BrandContentView />} />
      <Route path="inspobase" element={<BrandInspoBaseView />} />
      <Route path="comments/*" element={<div>Comments Suggester Module (Phase 4)</div>} />
      <Route path="benchmark" element={<div>Benchmark Module (Phase 5)</div>} />
      
      {/* Default fallback redirects to Content */}
      <Route path="*" element={<Navigate to="content" replace />} />
    </Routes>
  );
};
