import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAccount, getBrandIntelligence, patchBrandIntelligence, ingestAccount, getMediaUrl } from '../lib/api';
import { RefreshCw, Database, AlertCircle } from 'lucide-react';
import { PostGrid } from '../components/PostGrid';

export const BrandContentView = () => {
  const { brandId, workspaceId } = useParams<{ brandId: string; workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [igInput, setIgInput] = React.useState('');
  const [igError, setIgError] = React.useState('');

  // 1. Fetch Brand Intelligence to get mainIgUsername
  const { data: intelligence, isLoading: loadingIntel } = useQuery({
    queryKey: ['brand-intelligence', brandId],
    queryFn: () => getBrandIntelligence(brandId!),
    enabled: !!brandId,
  });

  const mainIgUsername = intelligence?.mainIgUsername;

  // 2. Fetch Account Details if username exists
  const {
    data: account,
    isLoading: loadingAccount,
    isError: accountError,
  } = useQuery({
    queryKey: ['account', mainIgUsername],
    queryFn: () => getAccount(mainIgUsername!),
    enabled: !!mainIgUsername,
  });

  const linkIgMutation = useMutation({
    mutationFn: (username: string) =>
      patchBrandIntelligence(brandId!, { mainIgUsername: username, workspaceId: workspaceId ?? '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-intelligence', brandId] });
      setIgInput('');
      setIgError('');
    },
    onError: (err: any) => {
      setIgError(err?.response?.data?.error || err.message || 'Failed to link account');
    },
  });

  const handleLinkIg = (e: React.FormEvent) => {
    e.preventDefault();
    const username = igInput.trim().replace(/^@/, '');
    if (!username) { setIgError('Instagram username is required'); return; }
    linkIgMutation.mutate(username);
  };

  const [sort, setSort] = React.useState<'recent' | 'oldest' | 'likes' | 'comments'>('recent');
  const [scrapeLimit, setScrapeLimit] = React.useState<number>(50);

  const ingestMutation = useMutation({
    mutationFn: ingestAccount,
    onSuccess: () => navigate(`/progress?username=${mainIgUsername}`),
  });

  if (loadingIntel) return <div>Loading Brand Settings...</div>;

  if (!mainIgUsername) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          maxWidth: '480px',
          margin: '0 auto',
        }}
      >
        <AlertCircle size={48} style={{ color: '#8b949e', marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem' }}>Link Instagram Account</h2>
        <p style={{ color: '#8b949e', marginBottom: '2rem' }}>
          Enter this brand's official Instagram username to see and manage its content.
        </p>
        <form onSubmit={handleLinkIg} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={igInput}
              onChange={(e) => { setIgInput(e.target.value); setIgError(''); }}
              placeholder="@username"
              autoFocus
              style={{
                flex: 1,
                padding: '10px 12px',
                background: 'var(--bg-primary, #0d1117)',
                border: `1px solid ${igError ? '#f85149' : 'var(--border-color, #30363d)'}`,
                borderRadius: '6px',
                color: 'var(--text-primary, #e6edf3)',
                fontSize: '14px',
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={linkIgMutation.isPending}
              style={{ whiteSpace: 'nowrap' }}
            >
              {linkIgMutation.isPending ? 'Linking…' : 'Link Account'}
            </button>
          </div>
          {igError && (
            <p style={{ color: '#f85149', fontSize: '13px', margin: 0, textAlign: 'left' }}>{igError}</p>
          )}
        </form>
      </div>
    );
  }

  if (loadingAccount) return <div>Loading Content...</div>;

  if (accountError || !account) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2 style={{ color: 'red' }}>Error loading account @{mainIgUsername}</h2>
        <p>Ensure this account has been added to the system.</p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
        <img
          src={getMediaUrl(account.profileImageUrl) || 'https://via.placeholder.com/100'}
          alt={account.username}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '2px solid var(--border)',
          }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>@{account.username}</h1>
          <span style={{ color: 'var(--text-secondary)' }}>
            Main Brand Profile • Last scraped: {new Date(account.lastScrapedAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <option value="recent">Most Recent</option>
          <option value="oldest">Oldest First</option>
          <option value="likes">Most Likes</option>
          <option value="comments">Most Comments</option>
        </select>

        <button
          className="btn-secondary"
          onClick={() =>
            ingestMutation.mutate({ username: account.username, limit: 50, updateSync: true })
          }
          disabled={ingestMutation.isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            borderRadius: '4px',
            background: 'var(--accent-primary)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} /> Update Sync
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ingestMutation.mutate({ username: account.username, limit: scrapeLimit });
          }}
          style={{ display: 'flex', gap: '0.5rem' }}
        >
          <input
            type="number"
            value={scrapeLimit}
            onChange={(e) => setScrapeLimit(Number(e.target.value))}
            min={1}
            max={10000}
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '0.5rem',
              borderRadius: '4px',
              width: '80px',
            }}
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={ingestMutation.isPending}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              borderRadius: '4px',
              background: '#444',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Database size={16} /> Scrape
          </button>
        </form>
      </div>

      <PostGrid posts={account.posts} sort={sort} />
    </div>
  );
};
