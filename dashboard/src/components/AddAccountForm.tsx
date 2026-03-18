import { useMutation } from '@tanstack/react-query';
import { ingestAccount } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export const AddAccountForm = ({ initialUsername = '' }: { initialUsername?: string }) => {
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState(initialUsername);
  const [newLimit, setNewLimit] = useState<number>(20);

  const ingestMutation = useMutation({
    mutationFn: ingestAccount,
    onSuccess: (_, variables) => {
      setNewUsername('');
      navigate(`/progress?username=${variables.username}`);
    },
  });

  const handleIngest = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUsername) ingestMutation.mutate({ username: newUsername, limit: newLimit });
  };

  return (
    <form onSubmit={handleIngest} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <input
        type="text"
        value={newUsername}
        onChange={(e) => setNewUsername(e.target.value)}
        placeholder="Instagram Username"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '0.5rem',
          borderRadius: '6px',
        }}
      />
      <input
        type="number"
        value={newLimit}
        onChange={(e) => setNewLimit(Number(e.target.value))}
        min={1}
        max={10000}
        title="Max Posts to Scrape"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          color: 'white',
          padding: '0.5rem',
          borderRadius: '6px',
          width: '80px',
        }}
        placeholder="Posts"
      />
      <button
        type="submit"
        className="action-btn"
        disabled={ingestMutation.isPending}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        {ingestMutation.isPending ? (
          'Ingesting...'
        ) : (
          <>
            <Plus size={20} />
            <span>Process Account</span>
          </>
        )}
      </button>
    </form>
  );
};
import React from 'react';
