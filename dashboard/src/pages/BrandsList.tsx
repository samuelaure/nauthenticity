import { useQuery } from '@tanstack/react-query';
import { getBrands } from '../lib/api';
import { useNavigate, useParams } from 'react-router-dom';
import { Shield } from 'lucide-react';

export const BrandsList = () => {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const {
    data: brands,
    isLoading,
    isError,
    error,
  } = useQuery({ 
    queryKey: ['brands', workspaceId], 
    queryFn: () => getBrands(workspaceId!),
    enabled: !!workspaceId
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError)
    return (
      <div style={{ color: 'red', padding: '1rem' }}>
        Error loading brands: {(error as Error).message}. Check if backend is running.
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
                <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', color: '#8b949e', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
              No brands found in this workspace. Create one in the central naŭ platform.
            </div>
          )}
      </div>
    </div>
  );
};
