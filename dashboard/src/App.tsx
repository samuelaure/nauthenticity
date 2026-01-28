
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AccountsList } from './pages/AccountsList';
import { AccountView } from './pages/AccountView';
import { PostView } from './pages/PostView';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="auth-container">
          <header className="header">
            <h1>naŭthenticity</h1>
          </header>
          <Routes>
            <Route path="/" element={<AccountsList />} />
            <Route path="/accounts/:username" element={<AccountView />} />
            <Route path="/posts/:id" element={<PostView />} />
          </Routes>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
