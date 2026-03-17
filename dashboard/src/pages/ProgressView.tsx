import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import {
  getAccountProgress,
  getAccounts,
  abortIngestion,
  type AccountProgress,
  type PostProgress,
} from '../lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { CheckCircle, XCircle, Clock, Download, Mic, Activity, Loader2, StopCircle } from 'lucide-react';

// ─── Active Jobs ─────────────────────────────────────────────────────────────

const ActiveJobs = ({ jobs, username }: { jobs: AccountProgress['activeJobs'], username: string }) => {
  const queryClient = useQueryClient();
  const abortMutation = useMutation({
    mutationFn: () => abortIngestion(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', username] });
    }
  });

  if (!jobs || jobs.length === 0) return null;

  const handleAbort = () => {
    if (window.confirm('Are you sure you want to ABORT this ingestion and stop the Apify actor?')) {
      abortMutation.mutate();
    }
  };

  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.05)',
        border: '1px solid rgba(239, 68, 68, 0.2)',
        borderRadius: 10,
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444' }}>
          <Activity size={18} className="spin" />
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Active Tasks</h3>
        </div>

        <button
          onClick={handleAbort}
          disabled={abortMutation.isPending}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            opacity: abortMutation.isPending ? 0.6 : 1,
          }}
        >
          {abortMutation.isPending ? <Loader2 size={14} className="spin" /> : <StopCircle size={14} />}
          Abort All Tasks
        </button>
      </div>

      {jobs.map((job) => {
        const isIngestion = job.name === 'start-ingestion';
        const isDownload = job.name === 'process-media';
        const isCompute = job.name === 'compute-video' || job.name === 'compute-image';

        let label = 'Processing...';
        if (isIngestion) label = `Scraping & Ingesting: ${job.data?.step || 'Waiting for actor...'}`;
        if (isDownload) label = `Downloading Media: ${job.data?.mediaId?.slice(0, 8) || '...'}`;
        if (isCompute)
          label = `Optimizing / Transcribing: ${job.data?.step || (job.data?.mediaId?.slice(0, 8) || '...')}`;

        return (
          <div key={job.id} style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '0.4rem',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ fontWeight: 600 }}>{label}</span>
              <span>
                {typeof job.progress === 'number' && job.progress > 0 ? (
                  `${job.progress}%`
                ) : (
                  <Loader2 size={14} className="spin" />
                )}
              </span>
            </div>
            {typeof job.progress === 'number' && job.progress > 0 && (
              <div
                style={{
                  height: 6,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 99,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${job.progress}%`,
                    background: '#3b82f6',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

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
  const location = useLocation();
  const [selected, setSelected] = React.useState<string | null>(null);

  // Parse username from URL: /progress?username=karenexplora
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const userParam = params.get('username');
    if (userParam && userParam !== selected) {
      setSelected(userParam);
    }
  }, [location.search]);

  // Fallback: Auto-select first account if none in URL
  React.useEffect(() => {
    if (accounts && accounts.length > 0 && !selected && !new URLSearchParams(location.search).get('username')) {
      setSelected(accounts[0].username);
    }
  }, [accounts, selected, location.search]);

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

          {/* Active Jobs */}
          <ActiveJobs jobs={progress.activeJobs} username={selected!} />

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
