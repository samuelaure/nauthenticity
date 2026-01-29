import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { getAccount } from '../lib/api';
import { ArrowLeft, MessageCircle, Heart } from 'lucide-react';

export const AccountView = () => {
  const { username } = useParams<{ username: string }>();
  const { data: account, isLoading } = useQuery({
    queryKey: ['account', username],
    queryFn: () => getAccount(username!),
  });

  // Sorting state
  const [sort, setSort] = React.useState<'recent' | 'oldest' | 'likes' | 'comments'>('recent');

  if (isLoading) return <div>Loading...</div>;
  if (!account) return <div>Account not found</div>;

  const sortedPosts = [...account.posts].sort((a, b) => {
    if (sort === 'recent') return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    if (sort === 'oldest') return new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime();
    if (sort === 'likes') return b.likes - a.likes;
    if (sort === 'comments') return b.comments - a.comments;
    return 0;
  });

  return (
    <div className="fade-in">
      <Link
        to="/"
        style={{
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
        <img
          src={account.profileImageUrl || 'https://via.placeholder.com/100'}
          alt={account.username}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: '2px solid var(--border)',
          }}
        />
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>@{account.username}</h1>
          <span style={{ color: 'var(--text-secondary)' }}>
            Last scraped: {new Date(account.lastScrapedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Sorting Controls */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          style={{
            padding: '0.5rem',
            borderRadius: '4px',
            background: 'var(--card-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        >
          <option value="recent">Most Recent</option>
          <option value="oldest">Oldest First</option>
          <option value="likes">Most Likes</option>
          <option value="comments">Most Comments</option>
        </select>
      </div>

      <div className="posts-grid">
        {sortedPosts.map((post) => (
          <Link
            to={`/posts/${post.id}`}
            key={post.id}
            className="post-card"
            style={{ textDecoration: 'none' }}
          >
            {post.media && post.media.length > 0 ? (
              post.media[0].type === 'video' ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <video
                    src={
                      post.media[0].storageUrl.startsWith('http')
                        ? post.media[0].storageUrl
                        : `http://localhost:3000/content/${post.media[0].storageUrl.split(/[\\/]/).pop()}`
                    }
                    className="post-media"
                    muted
                    loop
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 5,
                      right: 5,
                      background: 'rgba(0,0,0,0.6)',
                      borderRadius: '4px',
                      padding: '2px 4px',
                    }}
                  >
                    🎥
                  </div>
                </div>
              ) : (
                <img src={post.media[0].storageUrl} alt="Post" className="post-media" />
              )
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#222',
                  color: '#666',
                }}
              >
                No Media
              </div>
            )}
            <div className="post-overlay">
              <span
                style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
              >
                <Heart size={16} fill="white" /> {post.likes.toLocaleString()}
              </span>
              <span
                style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}
              >
                <MessageCircle size={16} /> {post.comments.toLocaleString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
