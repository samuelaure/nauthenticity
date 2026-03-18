import { useQuery } from '@tanstack/react-query';
import { getAccounts, getMediaUrl, API_URL } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AddAccountForm } from '../components/AddAccountForm';

export const AccountsList = () => {
  const navigate = useNavigate();
  const {
    data: accounts,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });

  if (isLoading) return <div>Loading...</div>;
  if (isError)
    return (
      <div style={{ color: 'red', padding: '1rem' }}>
        Error loading accounts: {error.message}. Check if backend is running on {API_URL}
      </div>
    );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h2 style={{ borderBottom: 'none' }}>Tracked Accounts</h2>
        <AddAccountForm />
      </div>

      <div className="accounts-grid">
        {Array.isArray(accounts) &&
          accounts.map((account) => (
            <div
              key={account.username}
              className="account-card fade-in"
              onClick={() => navigate(`/accounts/${account.username}`)}
            >
              <div className="profile-header">
                <img
                  src={getMediaUrl(account.profileImageUrl) || 'https://via.placeholder.com/64'}
                  alt={account.username}
                  className="avatar"
                />
                <div className="profile-info">
                  <h3>@{account.username}</h3>
                  <span>Updated {formatDistanceToNow(new Date(account.lastScrapedAt))} ago</span>
                </div>
              </div>
              <div className="stats">
                <div className="stat-item">
                  <span className="stat-value">{account._count?.posts || 0}</span>
                  <span className="stat-label">Posts</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">
                    <ImageIcon size={14} />
                  </span>
                  <span className="stat-label">Media</span>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
