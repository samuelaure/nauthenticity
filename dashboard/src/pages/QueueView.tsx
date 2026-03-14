import { useQuery } from '@tanstack/react-query';
import { getQueueStatus, type QueueMetrics } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  RefreshCcw,
  Database,
  HardDrive,
  Cpu,
  Trash2,
  XCircle,
} from 'lucide-react';
import React from 'react';
import { deleteJob } from '../lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const QueueSection = ({
  title,
  metrics,
  icon,
  queueName,
}: {
  title: string;
  metrics: QueueMetrics;
  icon: React.ReactNode;
  queueName: string;
}) => {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => deleteJob(queueName, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
  const stats = [
    {
      label: 'Active',
      value: metrics.counts.active,
      icon: <Activity size={20} className="text-blue" />,
      color: '#3b82f6',
    },
    {
      label: 'Waiting',
      value: metrics.counts.waiting,
      icon: <Clock size={20} className="text-yellow" />,
      color: '#f59e0b',
    },
    {
      label: 'Completed',
      value: metrics.counts.completed,
      icon: <CheckCircle size={20} className="text-green" />,
      color: '#10b981',
    },
    {
      label: 'Failed',
      value: metrics.counts.failed,
      icon: <AlertCircle size={20} className="text-red" />,
      color: '#ef4444',
    },
  ];

  return (
    <div style={{ marginBottom: '3rem' }}>
      <h3
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.5rem',
        }}
      >
        {icon} {title}
      </h3>

      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {stats.map((s) => (
          <div key={s.label} className="stat-card" style={{ borderLeft: `4px solid ${s.color}` }}>
            <div className="stat-header">
              {s.icon}
              <span className="stat-label">{s.label}</span>
            </div>
            <div className="stat-value">{s.value || 0}</div>
          </div>
        ))}
      </div>

      <div className="queue-sections">
        {metrics.active && metrics.active.length > 0 && (
          <section>
            <h4 className="section-title" style={{ fontSize: '1rem' }}>
              Active Jobs
            </h4>
            <div className="jobs-list">
              {metrics.active.map((job) => (
                <div key={job.id} className="job-item active">
                  <div className="job-info">
                    <span className="job-name">{job.name}</span>
                    <span className="job-id">#{job.id}</span>
                  </div>
                  <div className="job-details" style={{ minWidth: 0 }}>
                    {job.data?.username && <span>@{job.data.username}</span>}
                    <span style={{ whiteSpace: 'nowrap' }}>
                      Started {formatDistanceToNow(new Date(job.processedOn || job.timestamp))} ago
                    </span>
                  </div>
                  {typeof job.progress === 'number' && (
                    <div className="job-progress-container">
                      <div className="job-progress-header">
                        <span className="job-progress-step">
                          {job.progressData?.step || 'Processing...'}
                        </span>
                        <span className="job-progress-value">{job.progress}%</span>
                      </div>
                      <div className="progress-bar-container">
                        <div
                          className="progress-bar"
                          style={{
                            width: `${job.progress}%`,
                            transition: 'width 0.3s ease-in-out',
                          }}
                        />
                      </div>
                      <div className="job-progress-meta">
                        {job.progressData?.postId && (
                          <span title="Post ID">Post: {job.progressData.postId.slice(0, 8)}...</span>
                        )}
                        {job.progressData?.mediaId && (
                          <span title="Media ID">
                            Media: {job.progressData.mediaId.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {metrics.waiting && metrics.waiting.length > 0 && (
          <section>
            <h4 className="section-title" style={{ fontSize: '1rem' }}>
              Waiting in Queue
            </h4>
            <div className="jobs-list">
              {metrics.waiting.map((job) => (
                <div key={job.id} className="job-item waiting">
                  <div className="job-info">
                    <span className="job-name">{job.name}</span>
                    <span className="job-id">#{job.id}</span>
                  </div>
                  <div className="job-details">
                    {job.data?.username && <span>@{job.data.username}</span>}
                    <span>Queued {formatDistanceToNow(new Date(job.timestamp))} ago</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {metrics.failed && metrics.failed.length > 0 && (
          <section>
            <h4 className="section-title" style={{ fontSize: '1rem' }}>
              Recently Failed
            </h4>
            <div className="jobs-list">
              {metrics.failed.map((job) => (
                <div key={job.id} className="job-item failed">
                  <div className="job-header-row">
                    <span className="job-name">{job.name}</span>
                    <div className="job-header-actions">
                      <span className="job-id">#{job.id}</span>
                      <button
                        className="icon-btn delete-btn"
                        onClick={() => deleteMutation.mutate({ id: job.id })}
                        title="Ignore/Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="job-details" style={{ minWidth: 0 }}>
                    <span className="error-msg">
                      <XCircle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>{job.failedReason}</span>
                    </span>
                    <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      Failed {formatDistanceToNow(new Date(job.finishedOn || job.timestamp))} ago
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export const QueueView = () => {
  const {
    data: queue,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['queue'],
    queryFn: getQueueStatus,
    refetchInterval: 5000, // Refresh every 5s
  });

  if (isLoading) return <div className="loading">Checking queue status...</div>;
  if (!queue) return <div className="loading">Cannot load queue data from API.</div>;

  return (
    <div className="queue-container fade-in">
      <div className="header-row" style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>System Queues</h2>
        <button
          className="action-btn"
          onClick={() => refetch()}
          disabled={isFetching}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCcw size={16} className={isFetching ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <QueueSection
        title="Ingestion Queue"
        metrics={queue.ingestion}
        icon={<Database size={20} />}
        queueName="ingestion"
      />
      <QueueSection
        title="Download Queue"
        metrics={queue.download}
        icon={<HardDrive size={20} />}
        queueName="download"
      />
      <QueueSection
        title="Compute Queue"
        metrics={queue.compute}
        icon={<Cpu size={20} />}
        queueName="compute"
      />
    </div>
  );
};
