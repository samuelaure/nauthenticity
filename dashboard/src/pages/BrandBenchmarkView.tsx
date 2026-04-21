import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getBrandTargets, addBrandTarget, updateBrandTarget, getAccount } from '../lib/api';
import { Activity, Plus, BarChart2, Save, Settings2 } from 'lucide-react';
import { PostGrid } from '../components/PostGrid';

export const BrandBenchmarkView = () => {
  const { brandId } = useParams<{ brandId: string }>();
  const queryClient = useQueryClient();
  const [newUsername, setNewUsername] = useState('');
  const [newInitialCount, setNewInitialCount] = useState<number>(20);
  const [newAutoUpdate, setNewAutoUpdate] = useState<boolean>(true);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  const { data: targets, isLoading } = useQuery({
    queryKey: ['targets', brandId, 'benchmark'],
    queryFn: () => getBrandTargets(brandId!, 'benchmark'),
    enabled: !!brandId,
  });

  const addMutation = useMutation({
    mutationFn: addBrandTarget,
    onSuccess: () => {
      setNewUsername('');
      setNewInitialCount(20);
      setNewAutoUpdate(true);
      queryClient.invalidateQueries({ queryKey: ['targets', brandId, 'benchmark'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => updateBrandTarget(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['targets', brandId, 'benchmark'] });
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !brandId) return;

    let cleanUsername = newUsername.trim();
    if (cleanUsername.includes('instagram.com/')) {
       cleanUsername = cleanUsername.split('instagram.com/')[1].split('/')[0];
    }
    if (cleanUsername.startsWith('@')) cleanUsername = cleanUsername.slice(1);

    addMutation.mutate({
      brandId,
      username: cleanUsername,
      targetType: 'benchmark',
      isActive: true,
      initialDownloadCount: Number(newInitialCount) || 20,
      autoUpdate: newAutoUpdate,
    });
  };

  if (isLoading) return <div>Loading Benchmarks...</div>;

  return (
    <div className="fade-in">
      {selectedUsername ? (
        <BenchmarkProfileViewer 
          username={selectedUsername} 
          onBack={() => setSelectedUsername(null)} 
        />
      ) : (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ margin: 0, fontSize: '2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 size={28} /> Benchmarks
            </h1>
            <p style={{ color: '#8b949e', margin: 0 }}>
              Track competitor and peer profiles to analyze their engagement metrics and visual patterns.
            </p>
          </div>

          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Benchmark Target</h3>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexGrow: 1 }}>
                <label style={{ fontSize: '0.85rem', color: '#8b949e' }}>Target Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="@competitor"
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '0.6rem 1rem', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '150px' }}>
                <label style={{ fontSize: '0.85rem', color: '#8b949e' }}>Initial Download</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={newInitialCount}
                  onChange={(e) => setNewInitialCount(parseInt(e.target.value))}
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '0.6rem 1rem', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="autoUpdateCheck"
                  checked={newAutoUpdate}
                  onChange={(e) => setNewAutoUpdate(e.target.checked)}
                />
                <label htmlFor="autoUpdateCheck" style={{ fontSize: '0.85rem', color: '#8b949e', cursor: 'pointer' }}>Auto-Update</label>
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={addMutation.isPending || !newUsername.trim()}
                style={{ padding: '0.6rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', height: '42px' }}
              >
                {addMutation.isPending ? 'Saving...' : <><Plus size={18} /> Add</>}
              </button>
            </form>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
            {targets?.map((target: any) => (
              <BenchmarkTargetCard 
                key={target.id} 
                target={target} 
                onSelect={() => setSelectedUsername(target.username)}
                onUpdate={(updates) => updateMutation.mutate({ id: target.id, updates })}
              />
            ))}
            
            {targets?.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#8b949e', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                No benchmark targets added. Start tracking competitors to analyze their content.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const BenchmarkTargetCard = ({ target, onSelect, onUpdate }: { target: any; onSelect: () => void; onUpdate: (u: any) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState({
    autoUpdate: target.autoUpdate ?? true,
    initialDownloadCount: target.initialDownloadCount ?? 20,
    isActive: target.isActive
  });

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(formState);
    setIsEditing(false);
  };

  return (
    <div 
      style={{ 
        background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px',
        padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem',
        cursor: isEditing ? 'default' : 'pointer',
        transition: 'border-color 0.2s', opacity: target.isActive ? 1 : 0.6
      }}
      onClick={() => { if (!isEditing) onSelect(); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            @{target.username}
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Activity size={12} />
            {target.igProfile?._count?.posts || 0} posts captured
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: '4px' }}
        >
          <Settings2 size={18} />
        </button>
      </div>

      {isEditing && (
        <div style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '0.8rem' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.85rem', color: '#c9d1d9' }}>Auto-update (Cron)</label>
            <input type="checkbox" checked={formState.autoUpdate} onChange={(e) => setFormState(s => ({ ...s, autoUpdate: e.target.checked }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.85rem', color: '#c9d1d9' }}>Active Target</label>
            <input type="checkbox" checked={formState.isActive} onChange={(e) => setFormState(s => ({ ...s, isActive: e.target.checked }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '0.85rem', color: '#c9d1d9' }}>Download Limit</label>
            <input type="number" min="1" max="500" value={formState.initialDownloadCount} onChange={(e) => setFormState(s => ({ ...s, initialDownloadCount: parseInt(e.target.value) }))} style={{ width: '80px', padding: '4px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', borderRadius: '4px' }} />
          </div>
          <button onClick={handleSave} className="btn-primary" style={{ padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Save size={14} /> Update Config
          </button>
        </div>
      )}

      {!isEditing && (
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#8b949e' }}>
          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
            Auto: {target.autoUpdate ? 'ON' : 'OFF'}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
            Limit: {target.initialDownloadCount || 'Default'}
          </span>
        </div>
      )}
    </div>
  );
};

const BenchmarkProfileViewer = ({ username, onBack }: { username: string; onBack: () => void }) => {
  const { data: account, isLoading, isError } = useQuery({
    queryKey: ['account', username],
    queryFn: () => getAccount(username),
  });

  if (isLoading) return <div>Loading benchmark data for @{username}...</div>;
  if (isError || !account) return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
        &larr; Back to targets
      </button>
      <div style={{ color: 'red' }}>Account data could not be loaded.</div>
    </div>
  );

  return (
    <div className="fade-in">
      <button 
        onClick={onBack} 
        style={{ 
          background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', 
          marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0, fontWeight: 500 
        }}
      >
        &larr; Back to Benchmarks
      </button>
      
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, border: 'none' }}>
            <BarChart2 size={24} style={{ color: '#0969da' }} />
            @{username}
          </h2>
          <p style={{ color: '#8b949e', margin: '0.5rem 0 0 0' }}>
            Raw metric tracking and visual profiling.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
           <div style={{ textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px', minWidth: '100px' }}>
             <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{account.posts.length}</div>
             <div style={{ fontSize: '0.8rem', color: '#8b949e', textTransform: 'uppercase' }}>Posts Crawled</div>
           </div>
        </div>
      </div>

      <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Captured Content</h3>
      <PostGrid posts={account.posts} sort="recent" />
      
      {account.posts.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#8b949e', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
          No posts downloaded yet for this competitor. Add an initial download sync via the API to hydrate.
        </div>
      )}
    </div>
  );
};
