import { useQuery } from '@tanstack/react-query';
import {
  getAccountProgress,
  getAccounts,
  type AccountProgress,
  type PostProgress,
} from '../lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { CheckCircle, XCircle, Clock, Download, Mic } from 'lucide-react';

// ─── Progress Bar ────────────────────────────────────────────────────────────

const ProgressBar = ({
  pct,
  label,
  color = '#3b82f6',
  height = 10,
}: {
  pct: number;
  label: string;
  color?: string;
  height?: number;
}) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color }}>{pct}%</span>
    </div>
    <div
      style={{
        background: 'var(--border)',
        borderRadius: 99,
        height,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}cc, ${color})`,
          borderRadius: 99,
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  </div>
);

// ─── Summary Header ──────────────────────────────────────────────────────────

const SummaryCards = ({ summary }: { summary: AccountProgress['summary'] }) => {
  const cards = [
    { label: 'Total Posts', value: summary.totalPosts, color: '#8b5cf6' },
    { label: 'Media Files', value: summary.totalMedia, color: '#3b82f6' },
    { label: 'Downloaded', value: summary.localMedia, color: '#10b981' },
    { label: 'Pending DL', value: summary.pendingDownloads, color: '#f59e0b' },
    { label: 'Video Posts', value: summary.videoPostsTotal, color: '#ec4899' },
    { label: 'Transcribed', value: summary.transcribedPosts, color: '#06b6d4' },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: '0.75rem',
        marginBottom: '2rem',
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${c.color}`,
            borderRadius: 8,
            padding: '0.75rem',
          }}
        >
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── Per-Post Row ─────────────────────────────────────────────────────────────

const PostRow = ({ post }: { post: PostProgress }) => {
  const dlOk = post.downloaded;
  const trOk = post.transcribed;
  const needsTranscript = post.hasVideo;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '90px 1fr auto auto',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.82rem',
      }}
    >
      {/* Date */}
      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {format(new Date(post.postedAt), 'MMM d, yy')}
      </span>

      {/* Caption preview */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: post.caption ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {post.caption ?? '(no caption)'}
      </span>

      {/* Download status */}
      <span title={dlOk ? 'Downloaded' : 'Pending download'}>
        {dlOk ? <Download size={14} color="#10b981" /> : <Clock size={14} color="#f59e0b" />}
      </span>

      {/* Transcript status */}
      <span
        title={!needsTranscript ? 'Image only' : trOk ? 'Transcribed' : 'Pending transcription'}
      >
        {!needsTranscript ? (
          <Mic size={14} color="#4b5563" />
        ) : trOk ? (
          <CheckCircle size={14} color="#10b981" />
        ) : (
          <XCircle size={14} color="#f59e0b" />
        )}
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const ProgressView = () => {
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const [selected, setSelected] = React.useState<string | null>(null);

  // Auto-select first account
  React.useEffect(() => {
    if (accounts && accounts.length > 0 && !selected) {
      setSelected(accounts[0].username);
    }
  }, [accounts, selected]);

  const {
    data: progress,
    isLoading,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['progress', selected],
    queryFn: () => getAccountProgress(selected!),
    enabled: !!selected,
    refetchInterval: 8000, // Refresh every 8s
  });

  return (
    <div className="fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Ingestion Progress</h2>

        {/* Account selector */}
        <select
          value={selected ?? ''}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'white',
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {(accounts ?? []).map((a) => (
            <option key={a.username} value={a.username}>
              @{a.username}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div className="loading">Loading progress…</div>}

      {progress && (
        <>
          {/* Summary cards */}
          <SummaryCards summary={progress.summary} />

          {/* Progress bars */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            <ProgressBar
              pct={progress.summary.downloadPct}
              label={`Downloads: ${progress.summary.localMedia} / ${progress.summary.totalMedia} files`}
              color="#10b981"
              height={12}
            />
            <ProgressBar
              pct={progress.summary.transcriptPct}
              label={`Transcriptions: ${progress.summary.transcribedPosts} / ${progress.summary.videoPostsTotal} video posts`}
              color="#06b6d4"
              height={12}
            />
          </div>

          {/* Per-post table */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr auto auto',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <span>Date</span>
              <span>Caption</span>
              <span title="Downloaded">DL</span>
              <span title="Transcribed">TR</span>
            </div>

            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {progress.posts.map((p) => (
                <PostRow key={p.id} post={p} />
              ))}
            </div>

            <div
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--border)',
              }}
            >
              Showing last 200 posts · Auto-refreshes every 8s
              {dataUpdatedAt > 0 &&
                ` · Last updated ${formatDistanceToNow(new Date(dataUpdatedAt))} ago`}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Need React in scope for hooks
import React from 'react';
