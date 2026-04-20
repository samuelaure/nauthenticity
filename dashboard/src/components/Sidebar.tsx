import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { clearToken, getToken } from '../lib/auth';
import {
  LayoutDashboard,
  Activity,
  LogOut,
  ChevronDown,
  Check,
  Plus,
  X,
  Loader,
  Video,
} from 'lucide-react';

const NAU_API_URL =
  (import.meta.env.VITE_NAU_API_URL as string | undefined) ?? 'https://api.9nau.com';

type Workspace = { id: string; name: string };

function WorkspaceSelector() {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Persist selected workspace in localStorage
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem('nau_workspace_id'),
  );

  const active = workspaces.find((w) => w.id === activeId);

  useEffect(() => {
    const token = getToken();
    fetch(`${NAU_API_URL}/api/workspaces`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Workspace[]) => {
        setWorkspaces(data);
        if (!activeId && data.length > 0) {
          setActiveId(data[0].id);
          localStorage.setItem('nau_workspace_id', data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const select = (id: string) => {
    setActiveId(id);
    localStorage.setItem('nau_workspace_id', id);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${NAU_API_URL}/api/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error();
      const created: Workspace = await res.json();
      setWorkspaces((ws) => [...ws, created]);
      select(created.id);
      setCreating(false);
      setNewName('');
      navigate('/');
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative', marginBottom: '16px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#f0f6fc',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          gap: '8px',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active?.name ?? 'Select workspace'}
        </span>
        <ChevronDown size={14} style={{ color: '#8b949e', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            zIndex: 100,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => select(ws.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: ws.id === activeId ? '#f0f6fc' : '#8b949e',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: ws.id === activeId ? 600 : 400,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span>{ws.name}</span>
              {ws.id === activeId && <Check size={13} style={{ color: '#58a6ff' }} />}
            </button>
          ))}

          <div style={{ borderTop: '1px solid #21262d', padding: '4px 0' }}>
            {creating ? (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                  }}
                  placeholder="Workspace name"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    color: '#f0f6fc',
                    fontSize: '13px',
                    outline: 'none',
                    width: '100%',
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setCreating(false); setNewName(''); }}
                    style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #30363d', background: 'transparent', color: '#8b949e', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={12} />
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                    style={{ padding: '4px 10px', borderRadius: '6px', background: '#58a6ff', border: 'none', color: 'white', fontSize: '12px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {saving ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : 'Create'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  color: '#58a6ff',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <Plus size={14} /> Create a new workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navItems = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Progress', to: '/progress', icon: Activity },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = () => {
    clearToken();
    navigate('/auth/callback'); // will redirect to login since no token
    window.location.href = '/';
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
        <div style={{ padding: '8px', background: '#58a6ff', borderRadius: '8px', display: 'flex' }}>
          <Video size={18} color="white" />
        </div>
        <span style={{ fontWeight: 800, fontSize: '17px', letterSpacing: '-0.02em' }}>
          naŭthenticity
        </span>
      </div>

      {/* Workspace selector */}
      <WorkspaceSelector />

      {/* Nav links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {navItems.map(({ label, to, icon: Icon }) => {
          const isActive =
            to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`sidebar-link${isActive ? ' sidebar-link--active' : ''}`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <button className="sidebar-signout" onClick={handleSignOut}>
        <LogOut size={17} /> Sign Out
      </button>
    </aside>
  );
}
