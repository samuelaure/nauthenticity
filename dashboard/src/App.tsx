import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AccountsList } from './pages/AccountsList';
import { AccountView } from './pages/AccountView';
import { PostView } from './pages/PostView';
import { ProgressView } from './pages/ProgressView';
import { Link } from 'react-router-dom';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="auth-container">
          <header className="header">
            <Link to="/" style={{ textDecoration: 'none' }}>
              <h1>naŭthenticity</h1>
            </Link>
            <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <Link to="/" className="nav-link">
                Accounts
              </Link>
              <Link to="/progress" className="nav-link">
                Progress
              </Link>
            </nav>
          </header>
          <Routes>
            <Route path="/" element={<AccountsList />} />
            <Route path="/accounts/:username" element={<AccountView />} />
            <Route path="/posts/:id" element={<PostView />} />
            <Route path="/progress" element={<ProgressView />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
