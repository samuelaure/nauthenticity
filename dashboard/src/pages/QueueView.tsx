import { useQuery } from '@tanstack/react-query';
import { getQueueStatus } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Clock, AlertCircle, CheckCircle, RefreshCcw } from 'lucide-react';

export const QueueView = () => {
    const { data: queue, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['queue'],
        queryFn: getQueueStatus,
        refetchInterval: 5000 // Refresh every 5s
    });

    if (isLoading) return <div className="loading">Checking queue status...</div>;

    const stats = [
        { label: 'Active', value: queue?.counts.active, icon: <Activity size={20} className="text-blue" />, color: '#3b82f6' },
        { label: 'Waiting', value: queue?.counts.waiting, icon: <Clock size={20} className="text-yellow" />, color: '#f59e0b' },
        { label: 'Completed', value: queue?.counts.completed, icon: <CheckCircle size={20} className="text-green" />, color: '#10b981' },
        { label: 'Failed', value: queue?.counts.failed, icon: <AlertCircle size={20} className="text-red" />, color: '#ef4444' },
    ];

    return (
        <div className="queue-container fade-in">
            <div className="header-row">
                <h2 style={{ margin: 0 }}>Processing Queue</h2>
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

            <div className="stats-grid">
                {stats.map(s => (
                    <div key={s.label} className="stat-card" style={{ borderLeft: `4px solid ${s.color}` }}>
                        <div className="stat-header">
                            {s.icon}
                            <span className="stat-label">{s.label}</span>
                        </div>
                        <div className="stat-value">{s.value}</div>
                    </div>
                ))}
            </div>

            <div className="queue-sections">
                {queue?.active.length ? (
                    <section>
                        <h3 className="section-title">Active Jobs</h3>
                        <div className="jobs-list">
                            {queue.active.map(job => (
                                <div key={job.id} className="job-item active">
                                    <div className="job-info">
                                        <span className="job-name">{job.name}</span>
                                        <span className="job-id">#{job.id}</span>
                                    </div>
                                    <div className="job-details">
                                        {job.data?.username && <span>@{job.data.username}</span>}
                                        <span>Started {formatDistanceToNow(new Date(job.processedOn || job.timestamp))} ago</span>
                                    </div>
                                    {typeof job.progress === 'number' && (
                                        <div className="progress-bar-container">
                                            <div className="progress-bar" style={{ width: `${job.progress}%` }} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {queue?.waiting.length ? (
                    <section>
                        <h3 className="section-title">Waiting in Queue</h3>
                        <div className="jobs-list">
                            {queue.waiting.map(job => (
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
                ) : null}

                {queue?.failed.length ? (
                    <section>
                        <h3 className="section-title">Recently Failed</h3>
                        <div className="jobs-list">
                            {queue.failed.map(job => (
                                <div key={job.id} className="job-item failed">
                                    <div className="job-info">
                                        <span className="job-name">{job.name}</span>
                                        <span className="job-id">#{job.id}</span>
                                    </div>
                                    <div className="job-details">
                                        <span className="error-msg">{job.failedReason}</span>
                                        <span>Failed {formatDistanceToNow(new Date(job.finishedOn || job.timestamp))} ago</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {!queue?.active.length && !queue?.waiting.length && (
                    <div className="empty-state">
                        <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                        <p>No active or waiting jobs. Everything is processed!</p>
                    </div>
                )}
            </div>
        </div>
    );
};
