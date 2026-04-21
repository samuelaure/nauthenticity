import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AccountsList } from './pages/AccountsList';
import { AccountView } from './pages/AccountView';
import { PostView } from './pages/PostView';
import { ProgressView } from './pages/ProgressView';
import { AuthCallback } from './pages/AuthCallback';
import { WorkspaceSettings } from './pages/WorkspaceSettings';
import { WorkspacesList } from './pages/WorkspacesList';
import { BrandsList } from './pages/BrandsList';
import { BrandLayout } from './pages/BrandLayout';
import { RequireAuth } from './components/RequireAuth';
import { Sidebar } from './components/Sidebar';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <div className="app-layout">
                  <Sidebar />
                  <main className="main-content">
                    <Routes>
                      <Route path="/workspaces" element={<WorkspacesList />} />
                      <Route path="/workspaces/:workspaceId/brands" element={<BrandsList />} />
                      <Route
                        path="/workspaces/:workspaceId/brands/:brandId/*"
                        element={<BrandLayout />}
                      />
                      <Route path="/" element={<Navigate to="/workspaces" replace />} />

                      {/* Legacy Routes - kept for backwards compatibility during migration */}
                      <Route path="/accounts" element={<AccountsList />} />
                      <Route path="/accounts/:username" element={<AccountView />} />
                      <Route path="/posts/:id" element={<PostView />} />
                      <Route path="/progress" element={<ProgressView />} />
                      <Route path="/workspace-settings" element={<WorkspaceSettings />} />
                    </Routes>
                  </main>
                </div>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
