import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { getAccount } from '../lib/api';
import { ArrowLeft, MessageCircle, Heart } from 'lucide-react';

export const AccountView = () => {
    const { username } = useParams<{ username: string }>();
    const { data: account, isLoading } = useQuery({
        queryKey: ['account', username],
        queryFn: () => getAccount(username!)
    });

    if (isLoading) return <div>Loading...</div>;
    if (!account) return <div>Account not found</div>;

    return (
        <div className="fade-in">
            <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                <img
                    src={account.profileImageUrl || "https://via.placeholder.com/100"}
                    alt={account.username}
                    style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid var(--border)' }}
                />
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem' }}>@{account.username}</h1>
                    <span style={{ color: 'var(--text-secondary)' }}>Last scraped: {new Date(account.lastScrapedAt).toLocaleString()}</span>
                </div>
            </div>

            <div className="posts-grid">
                {account.posts.map(post => (
                    <div key={post.id} className="post-card">
                        {post.media && post.media.length > 0 ? (
                            post.media[0].type === 'video' ? (
                                <video src={post.media[0].storageUrl} className="post-media" controls />
                            ) : (
                                <img src={post.media[0].storageUrl} alt="Post" className="post-media" />
                            )
                        ) : (
                            // Fallback if media missing but still a post (should have instagramUrl logic)
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#222' }}>
                                No Media
                            </div>
                        )}
                        <div className="post-overlay">
                            <span style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                <Heart size={16} fill="white" /> {post.likes}
                            </span>
                            <span style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                <MessageCircle size={16} /> {post.comments}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
