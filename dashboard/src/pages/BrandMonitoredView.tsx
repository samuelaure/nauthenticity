import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBrandTargets, addBrandTarget, updateBrandTarget, getAccount } from '../lib/api';
import { Plus, ChevronRight, Activity, Eye, EyeOff } from 'lucide-react';
import { PostGrid } from '../components/PostGrid';

export const BrandMonitoredView = () => {
  const { brandId } = useParams<{ brandId: string }>();
  const queryClient = useQueryClient();
  const [newUsername, setNewUsername] = useState('');
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  // 1. Fetch Monitored Targets
  const { data: targets, isLoading } = useQuery({
    queryKey: ['targets', brandId, 'monitored'],
    queryFn: () => getBrandTargets(brandId!, 'monitored'),
    enabled: !!brandId,
  });

  // 2. Add Target Mutation
  const addMutation = useMutation({
    mutationFn: addBrandTarget,
    onSuccess: () => {
      setNewUsername('');
      queryClient.invalidateQueries({ queryKey: ['targets', brandId, 'monitored'] });
    },
  });

  // 3. Toggle Target Mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateBrandTarget(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', brandId, 'monitored'] });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !brandId) return;

    // Clean up username if they pasted a URL
    let cleanUsername = newUsername.trim();
    if (cleanUsername.includes('instagram.com/')) {
      cleanUsername = cleanUsername.split('instagram.com/')[1].split('/')[0];
    }
    if (cleanUsername.startsWith('@')) cleanUsername = cleanUsername.slice(1);

    addMutation.mutate({
      brandId,
      username: cleanUsername,
      targetType: 'monitored',
      isActive: true,
    });
  };

  if (isLoading) return <div>Loading Monitored Profiles...</div>;

  return (
    <div>
      {/* Selected Profile View */}
      {selectedUsername ? (
        <MonitoredProfileViewer
          username={selectedUsername}
          onBack={() => setSelectedUsername(null)}
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem',
            }}
          >
            <p style={{ color: '#8b949e', margin: 0 }}>
              Profiles being constantly monitored for proactive comment suggestions.
            </p>
          </div>

          {/* Add Form */}
          <form
            onSubmit={handleAddSubmit}
            style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}
          >
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="@username or Instagram URL"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                color: 'white',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                flexGrow: 1,
                maxWidth: '400px',
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={addMutation.isPending || !newUsername.trim()}
              style={{
                padding: '0.6rem 1.2rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {addMutation.isPending ? (
                'Adding...'
              ) : (
                <>
                  <Plus size={18} /> Add Target
                </>
              )}
            </button>
          </form>

          {/* Targets List */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            {targets?.map((target: any) => (
              <div
                key={target.id}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'border-color 0.2s',
                  cursor: 'pointer',
                  opacity: target.isActive ? 1 : 0.6,
                }}
                onClick={(e) => {
                  // Only open if they didn't click the toggle button
                  if ((e.target as HTMLElement).closest('button')) return;
                  setSelectedUsername(target.username);
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    @{target.username}
                  </h3>
                  <p
                    style={{
                      margin: '0.2rem 0 0 0',
                      fontSize: '0.8rem',
                      color: '#8b949e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Activity size={12} />
                    {target.igProfile?._count?.posts || 0} posts captured
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMutation.mutate({ id: target.id, isActive: !target.isActive });
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: target.isActive ? '#3fb950' : '#8b949e',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.7rem',
                    }}
                    title={
                      target.isActive
                        ? 'Monitoring Active. Click to pause.'
                        : 'Monitoring Paused. Click to resume.'
                    }
                  >
                    {target.isActive ? <Eye size={20} /> : <EyeOff size={20} />}
                    {target.isActive ? 'ACTIVE' : 'PAUSED'}
                  </button>
                  <ChevronRight size={20} style={{ color: '#8b949e' }} />
                </div>
              </div>
            ))}

            {targets?.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#8b949e',
                  border: '1px dashed var(--border)',
                  borderRadius: '12px',
                }}
              >
                No monitored profiles yet. Add one to start processing proactive comments.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Sub-component to display the post grid for a specific target
const MonitoredProfileViewer = ({ username, onBack }: { username: string; onBack: () => void }) => {
  const {
    data: account,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['account', username],
    queryFn: () => getAccount(username),
  });

  if (isLoading) return <div>Loading posts for @{username}...</div>;
  if (isError || !account)
    return (
      <div>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#58a6ff',
            cursor: 'pointer',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          &larr; Back to targets
        </button>
        <div style={{ color: 'red' }}>
          Account data could not be loaded. It may not have been scraped yet.
        </div>
      </div>
    );

  return (
    <div className="fade-in">
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: '#58a6ff',
          cursor: 'pointer',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: 0,
          fontWeight: 500,
        }}
      >
        &larr; Back to Monitored Profiles
      </button>

      <div style={{ marginBottom: '2rem' }}>
        <h2
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            margin: 0,
            border: 'none',
          }}
        >
          <Activity size={24} style={{ color: '#3fb950' }} />@{username}
        </h2>
        <p style={{ color: '#8b949e', margin: '0.5rem 0 0 0' }}>
          Showing captured posts available for comment generation.
        </p>
      </div>

      <PostGrid posts={account.posts} sort="recent" />

      {account.posts.length === 0 && (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#8b949e',
            background: 'var(--card-bg)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
          }}
        >
          No posts downloaded yet for this profile.
        </div>
      )}
    </div>
  );
};
