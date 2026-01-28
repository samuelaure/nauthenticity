import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { getPost } from '../lib/api';
import { ArrowLeft, MessageCircle, Heart, Eye, Calendar } from 'lucide-react';

export const PostView = () => {
    const { id } = useParams<{ id: string }>();
    const { data: post, isLoading } = useQuery({
        queryKey: ['post', id],
        queryFn: () => getPost(id!)
    });

    if (isLoading) return <div>Loading...</div>;
    if (!post) return <div>Post not found</div>;

    const video = post.media.find(m => m.type === 'video');
    const image = post.media.find(m => m.type === 'image');

    return (
        <div className="fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <Link to={`/accounts/${post.username}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <ArrowLeft size={16} /> Back to Posts
            </Link>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Left Column: Media */}
                <div style={{ background: '#111', borderRadius: '12px', overflow: 'hidden', maxHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {video ? (
                        <video
                            src={video.storageUrl.replace('c:\\Users\\Sam\\code\\nauthenticity\\storage', 'http://localhost:3000/content')}
                            controls
                            style={{ width: '100%', maxHeight: '100%' }}
                        />
                    ) : (
                        <img
                            src={image?.storageUrl || "https://via.placeholder.com/400"}
                            alt="Post Media"
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                    )}
                </div>

                {/* Right Column: Data */}
                <div>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Heart className="accent-text" /> <strong>{post.likes.toLocaleString()}</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MessageCircle className="accent-text" /> <strong>{post.comments.toLocaleString()}</strong>
                        </div>
                        {post.views && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Eye className="accent-text" /> <strong>{post.views.toLocaleString()}</strong>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                            <Calendar size={16} /> {new Date(post.postedAt).toLocaleDateString()}
                        </div>
                    </div>

                    {/* Caption */}
                    {post.caption && (
                        <div style={{ marginBottom: '2rem', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                            <h3 style={{ marginTop: 0 }}>Caption</h3>
                            <p style={{ color: '#ccc', lineHeight: '1.6' }}>{post.caption}</p>
                        </div>
                    )}

                    {/* Transcript */}
                    <div>
                        <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            Transcript
                            {post.transcripts && post.transcripts.length > 0 && <span className="tag">AI Generated</span>}
                        </h3>

                        {post.transcripts && post.transcripts.length > 0 ? (
                            <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '8px', maxHeight: '400px', overflowY: 'auto', whiteSpace: 'pre-wrap' }} className="custom-scrollbar">
                                {post.transcripts[0].text}
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No transcript available for this post.
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '2rem' }}>
                        <a href={post.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                            View on Instagram &rarr;
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
