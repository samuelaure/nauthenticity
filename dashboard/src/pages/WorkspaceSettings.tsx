import { useState, useEffect } from 'react';
import { Building2, Users, Loader2, Check, Settings } from 'lucide-react';
import { getToken } from '../lib/auth';


type Workspace = { id: string; name: string };
type Member = {
  id: string;
  role: string;
  user: { id: string; email: string; name: string | null };
};

export function WorkspaceSettings() {
  const workspaceId = localStorage.getItem('nau_workspace_id');

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      setMembersLoading(false);
      return;
    }

    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    // Load the workspace name by fetching the full list and finding the active one
    fetch('/api/workspaces', { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Workspace[]) => {
        const ws = data.find((w) => w.id === workspaceId) ?? null;
        setWorkspace(ws);
        if (ws) {
          setName(ws.name);
          setOriginalName(ws.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Load members separately
    fetch(`/api/workspaces/${workspaceId}/members`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Member[]) => setMembers(data))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [workspaceId]);

  const handleSave = async () => {
    if (!name.trim() || name.trim() === originalName || !workspaceId) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setOriginalName(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('Failed to update workspace name.');
    } finally {
      setSaving(false);
    }
  };

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !workspaceId) return;
    setInviting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Invitation failed');
      }
      const newMember = await res.json();
      setMembers([...members, newMember]);
      setInviteEmail('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to remove this member?')) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      setMembers(members.filter((m) => m.user.id !== userId));
    } catch {
      alert('Failed to remove member.');
    }
  };

  // ── No workspace selected ────────────────────────────────────────────────────
  if (!workspaceId) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <Settings size={32} color="#8b949e" style={{ margin: '0 auto 16px' }} />
        <p style={{ fontSize: '14px', color: '#8b949e' }}>
          Select a workspace from the sidebar to manage its settings.
        </p>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
        <Loader2 size={28} color="#8b949e" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // ── Workspace not found ──────────────────────────────────────────────────────
  if (!workspace) {
    return (
      <p style={{ fontSize: '14px', color: '#8b949e', fontStyle: 'italic', padding: '40px 0' }}>
        Workspace not found.
      </p>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '640px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px', color: '#f0f6fc' }}>
          Workspace Settings
        </h2>
        <p style={{ fontSize: '13px', color: '#8b949e' }}>
          Manage <strong style={{ color: '#f0f6fc' }}>{workspace.name}</strong>'s name and members.
        </p>
      </div>

      {/* General / Name */}
      <div style={{ border: '1px solid #21262d', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #21262d' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Building2 size={15} color="#8b949e" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f6fc' }}>General</span>
          </div>
          <label style={{ display: 'block', fontSize: '12px', color: '#8b949e', marginBottom: '6px' }}>
            Workspace name
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid #30363d',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f0f6fc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || name.trim() === originalName}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: saved ? '#238636' : '#58a6ff',
                border: 'none',
                color: 'white',
                fontSize: '13px',
                cursor: saving || name.trim() === originalName ? 'not-allowed' : 'pointer',
                opacity: name.trim() === originalName ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? (
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              ) : saved ? (
                <><Check size={13} /> Saved</>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </div>

        {/* Members */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Users size={15} color="#8b949e" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f6fc' }}>Members</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email..."
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid #30363d',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#f0f6fc',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: '#238636',
                border: 'none',
                color: 'white',
                fontSize: '13px',
                cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                opacity: !inviteEmail.trim() ? 0.6 : 1,
              }}
            >
              {inviting ? 'Inviting...' : 'Invite'}
            </button>
          </div>

          {membersLoading ? (
            <p style={{ fontSize: '13px', color: '#8b949e' }}>Loading members…</p>
          ) : members.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#8b949e', fontStyle: 'italic' }}>No members found.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {members.map((m) => (
                <li
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: '1px solid #21262d',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', color: '#f0f6fc', fontWeight: 500 }}>
                      {m.user.name ?? m.user.email}
                    </span>
                    {m.user.name && (
                      <span style={{ fontSize: '12px', color: '#8b949e' }}>
                        {m.user.email}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'capitalize',
                        background: '#161b22',
                        border: '1px solid #30363d',
                        color: '#8b949e',
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}
                    >
                      {m.role}
                    </span>
                    {m.role !== 'owner' && (
                      <button
                        onClick={() => handleRemove(m.user.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f85149',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
