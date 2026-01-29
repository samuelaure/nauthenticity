import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccounts, ingestAccount } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Plus, Image as ImageIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

export const AccountsList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: accounts, isLoading } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const [newUsername, setNewUsername] = useState('');

  const ingestMutation = useMutation({
    mutationFn: ingestAccount,
    onSuccess: () => {
      setNewUsername('');
      // Invalidate to refresh (though might take time to appear)
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      alert('Ingestion started! Check back in a few minutes.');
    },
  });

  const handleIngest = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUsername) ingestMutation.mutate(newUsername);
  };

  if (isLoading) return <div>Loading...</div>;

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
        <form onSubmit={handleIngest} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Instagram Username"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'white',
              padding: '0.5rem',
              borderRadius: '6px',
            }}
          />
          <button type="submit" className="action-btn" disabled={ingestMutation.isPending}>
            {ingestMutation.isPending ? '...' : <Plus size={20} />}
          </button>
        </form>
      </div>

      <div className="accounts-grid">
        {accounts?.map((account) => (
          <div
            key={account.username}
            className="account-card fade-in"
            onClick={() => navigate(`/accounts/${account.username}`)}
          >
            <div className="profile-header">
              <img
                src={account.profileImageUrl || 'https://via.placeholder.com/64'}
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
