import { useQuery } from '@tanstack/react-query';
import { getWorkspaces } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';

export const WorkspacesList = () => {
  const navigate = useNavigate();

  const {
    data: workspaces,
    isLoading,
    isError,
    error,
  } = useQuery({ queryKey: ['workspaces'], queryFn: getWorkspaces });

  if (isLoading) return <div>Loading...</div>;
  if (isError)
    return (
      <div style={{ color: 'red', padding: '1rem' }}>
        Error loading workspaces: {(error as Error).message}. Check if backend is running.
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
        <h2 style={{ borderBottom: 'none' }}>Your Workspaces</h2>
      </div>

      <div className="accounts-grid">
        {Array.isArray(workspaces) &&
          workspaces.map((workspace: any) => (
            <div
              key={workspace.id}
              className="account-card fade-in"
              onClick={() => {
                localStorage.setItem('nau_workspace_id', workspace.id);
                navigate(`/workspaces/${workspace.id}/brands`);
              }}
            >
              <div className="profile-header">
                <div
                  style={{
                    padding: '8px',
                    background: 'rgba(56,139,253,0.15)',
                    borderRadius: '8px',
                    color: '#58a6ff',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Briefcase size={20} />
                </div>
                <div className="profile-info">
                  <h3 style={{ fontSize: '15px' }}>{workspace.name}</h3>
                  <span style={{ fontSize: '13px' }}>ID: {workspace.id.split('-')[0]}...</span>
                </div>
              </div>
            </div>
          ))}
        {Array.isArray(workspaces) && workspaces.length === 0 && (
          <div style={{ color: '#8b949e', padding: '2rem 0' }}>
            No workspaces found. Create one.
          </div>
        )}
      </div>
    </div>
  );
};
