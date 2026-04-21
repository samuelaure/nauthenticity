import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  getBrandTargets,
  addBrandTarget,
  generateComment,
  getAccount,
  type Post,
} from '../lib/api';
import { Link2, MessageSquare, List, LayoutGrid, AlertCircle } from 'lucide-react';
import { PostGrid } from '../components/PostGrid';

export const BrandSinglePostsView = () => {
  const { brandId } = useParams<{ brandId: string }>();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('flat');
  const [newUrl, setNewUrl] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [generationResult, setGenerationResult] = useState<any[] | null>(null);

  // 1. Fetch Single Post Targets
  const { data: targets, isLoading: loadingTargets } = useQuery({
    queryKey: ['targets', brandId, 'single_post'],
    queryFn: () => getBrandTargets(brandId!, 'single_post'),
    enabled: !!brandId,
  });

  // Fetch all accounts data for flat/grouped view if there are targets
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-bulk', targets?.map((t: any) => t.username)],
    queryFn: async () => {
      if (!targets || targets.length === 0) return [];
      const promises = targets.map((t: any) => getAccount(t.username).catch(() => null));
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: !!targets && targets.length > 0,
  });

  // Compute Flat Posts List
  const flatPosts = useMemo(() => {
    if (!accountsData) return [];
    let allPosts: Post[] = [];
    accountsData.forEach((acc) => {
      if (acc && acc.posts) allPosts = [...allPosts, ...acc.posts];
    });
    return allPosts.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }, [accountsData]);

  const addTargetMutation = useMutation({
    mutationFn: addBrandTarget,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', brandId, 'single_post'] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: generateComment,
    onSuccess: (data) => {
      setGenerationResult(data.suggestions);
      if (newUsername) {
        addTargetMutation.mutate({
          brandId: brandId!,
          username: newUsername.replace('@', ''),
          targetType: 'single_post',
          isActive: true,
        });
      }
      setNewUrl('');
      setNewUsername('');
    },
  });

  const handleManualTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || !brandId) return;
    setGenerationResult(null);
    generateMutation.mutate({ brandId, targetUrl: newUrl });
  };

  if (loadingTargets) return <div>Loading Single Posts Data...</div>;

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
        <p style={{ color: '#8b949e', margin: 0 }}>
          Ad-hoc comments generated for specific single posts.
        </p>

        <div
          style={{
            display: 'flex',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '2px',
          }}
        >
          <button
            onClick={() => setViewMode('flat')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: viewMode === 'flat' ? '#30363d' : 'transparent',
              border: 'none',
              color: viewMode === 'flat' ? '#c9d1d9' : '#8b949e',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <List size={16} /> Flat
          </button>
          <button
            onClick={() => setViewMode('grouped')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              background: viewMode === 'grouped' ? '#30363d' : 'transparent',
              border: 'none',
              color: viewMode === 'grouped' ? '#c9d1d9' : '#8b949e',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={16} /> Grouped
          </button>
        </div>
      </div>

      {/* Manual Request Form */}
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '2rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={18} style={{ color: '#a371f7' }} />
          Request Single Post Comment
        </h3>
        <form
          onSubmit={handleManualTrigger}
          style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Instagram Post URL"
            required
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              color: 'white',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              flexGrow: 2,
              minWidth: '200px',
            }}
          />
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="@username (Optional, links post to profile)"
            style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              color: 'white',
              padding: '0.6rem 1rem',
              borderRadius: '6px',
              flexGrow: 1,
              minWidth: '150px',
            }}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={generateMutation.isPending || !newUrl.trim()}
            style={{
              padding: '0.6rem 1.2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#a371f7',
            }}
          >
            {generateMutation.isPending ? (
              'Generating...'
            ) : (
              <>
                <Link2 size={18} /> Generate
              </>
            )}
          </button>
        </form>

        {generationResult && (
          <div
            style={{
              marginTop: '1.5rem',
              background: 'rgba(163, 113, 247, 0.1)',
              border: '1px solid rgba(163, 113, 247, 0.3)',
              padding: '1rem',
              borderRadius: '8px',
            }}
          >
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#a371f7' }}>Generation Success</h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#c9d1d9' }}>
              {generationResult.map((text, i) => (
                <li key={i} style={{ marginBottom: '0.5rem' }}>
                  "{text}"
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Mode Renderings */}
      {viewMode === 'flat' ? (
        <div>
          <h3
            style={{
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            All Single Posts ({flatPosts.length})
          </h3>
          {flatPosts.length > 0 ? (
            <PostGrid posts={flatPosts} sort="recent" />
          ) : (
            <div
              style={{
                padding: '3rem',
                textAlign: 'center',
                color: '#8b949e',
                border: '1px dashed var(--border)',
                borderRadius: '12px',
              }}
            >
              No single posts found across targets.
            </div>
          )}
        </div>
      ) : (
        <div>
          <h3
            style={{
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            Grouped By Profile
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1rem',
            }}
          >
            {targets?.map((target: any) => {
              const targetAccount = accountsData?.find((a) => a?.username === target.username);
              const postCount = targetAccount?.posts?.length || 0;
              return (
                <div
                  key={target.id}
                  style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    padding: '1rem',
                    borderRadius: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>@{target.username}</span>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: '#8b949e',
                        background: 'rgba(255,255,255,0.05)',
                        padding: '2px 8px',
                        borderRadius: '100px',
                      }}
                    >
                      {postCount} posts
                    </span>
                  </div>
                  {postCount > 0 ? (
                    <div style={{ marginTop: '1rem' }}>
                      <PostGrid posts={targetAccount!.posts.slice(0, 3)} sort="recent" />
                    </div>
                  ) : (
                    <div style={{ marginTop: '1rem', color: '#8b949e', fontSize: '0.85rem' }}>
                      <AlertCircle
                        size={14}
                        style={{ display: 'inline', verticalAlign: 'text-bottom' }}
                      />{' '}
                      No specific posts crawled yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
