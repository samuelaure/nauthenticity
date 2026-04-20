import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Check } from 'lucide-react';
import { getAccounts, type Account } from '../lib/api';

export function AccountBreadcrumb({ activeUsername }: { activeUsername: string }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAccounts().then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'transparent',
          border: 'none',
          color: '#f0f6fc',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        @{activeUsername}
        <ChevronDown size={13} style={{ color: '#8b949e' }} />
      </button>

      {open && accounts.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '6px',
            zIndex: 50,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '180px',
          }}
        >
          {accounts.map((acc) => (
            <button
              key={acc.username}
              onClick={() => {
                setOpen(false);
                if (acc.username !== activeUsername) navigate(`/accounts/${acc.username}`);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: acc.username === activeUsername ? '#f0f6fc' : '#8b949e',
                fontSize: '13px',
                fontWeight: acc.username === activeUsername ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span>@{acc.username}</span>
              {acc.username === activeUsername && <Check size={13} style={{ color: '#58a6ff' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
