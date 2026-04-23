import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBrands, createBrand } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield, Plus, X } from 'lucide-react';

export const BrandsList = () => {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [error, setError] = useState('');

  const {
    data: brands,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: ['brands', workspaceId],
    queryFn: () => getBrands(workspaceId!),
    enabled: !!workspaceId,
  });

  const mutation = useMutation({
    mutationFn: (name: string) => createBrand(workspaceId!, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', workspaceId] });
      setShowModal(false);
      setBrandName('');
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message || err.message || 'Failed to create brand');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = brandName.trim();
    if (!trimmed) {
      setError('Brand name is required');
      return;
    }
    mutation.mutate(trimmed);
  };

  const handleClose = () => {
    setShowModal(false);
    setBrandName('');
    setError('');
  };

  if (isLoading) return <div>Loading...</div>;
  if (isError)
    return (
      <div style={{ color: 'red', padding: '1rem' }}>
        Error loading brands: {(fetchError as Error).message}. Check if backend is running.
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
        <h2 style={{ borderBottom: 'none' }}>Brands</h2>
        <button
          className="btn-primary"
          onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} />
          New Brand
        </button>
      </div>

      <div className="accounts-grid">
        {Array.isArray(brands) &&
          brands.map((brand: any) => (
            <div
              key={brand.id}
              className="account-card fade-in"
              onClick={() => navigate(`/workspaces/${workspaceId}/brands/${brand.id}/content`)}
            >
              <div className="profile-header">
                <div
                  style={{
                    padding: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '50%',
                    color: '#8b949e',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Shield size={20} />
                </div>
                <div className="profile-info">
                  <h3 style={{ fontSize: '15px' }}>{brand.name}</h3>
                  <span style={{ fontSize: '13px' }}>ID: {brand.id.split('-')[0]}...</span>
                </div>
              </div>
            </div>
          ))}
        {Array.isArray(brands) && brands.length === 0 && (
          <div style={{ color: '#8b949e', padding: '2rem 0' }}>
            No brands yet. Create your first brand to get started.
          </div>
        )}
      </div>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleClose}
        >
          <div
            style={{
              background: 'var(--bg-secondary, #161b22)',
              border: '1px solid var(--border-color, #30363d)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '420px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ margin: 0 }}>New Brand</h3>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b949e',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontSize: '14px',
                    color: '#8b949e',
                  }}
                >
                  Brand name
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => {
                    setBrandName(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. My Brand"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-primary, #0d1117)',
                    border: `1px solid ${error ? '#f85149' : 'var(--border-color, #30363d)'}`,
                    borderRadius: '6px',
                    color: 'var(--text-primary, #e6edf3)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
                {error && (
                  <p style={{ color: '#f85149', fontSize: '13px', marginTop: '6px' }}>{error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={mutation.isPending}
                className="btn-primary"
                style={{ width: '100%' }}
              >
                {mutation.isPending ? 'Creating…' : 'Create Brand'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
