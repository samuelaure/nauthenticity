import { Routes, Route, Navigate } from 'react-router-dom';
import { BrandContentView } from './BrandContentView';
import { BrandInspoBaseView } from './BrandInspoBaseView';
import { BrandCommentsLayout } from './BrandCommentsLayout';
import { BrandBenchmarkView } from './BrandBenchmarkView';

export const BrandLayout = () => {
  return (
    <Routes>
      <Route path="content" element={<BrandContentView />} />
      <Route path="inspobase" element={<BrandInspoBaseView />} />
      <Route path="comments/*" element={<BrandCommentsLayout />} />
      <Route path="benchmark" element={<BrandBenchmarkView />} />

      {/* Default fallback redirects to Content */}
      <Route path="*" element={<Navigate to="content" replace />} />
    </Routes>
  );
};
