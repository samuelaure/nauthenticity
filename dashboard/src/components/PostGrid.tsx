import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle } from 'lucide-react';
import { getMediaUrl, type Post } from '../lib/api';

interface PostGridItemProps {
  post: Post;
}

export const PostGridItem = ({ post }: PostGridItemProps) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const media = post.media && post.media.length > 0 ? post.media[0] : null;
  const thumbUrl = media ? getMediaUrl(media.thumbnailUrl || media.storageUrl) : null;
  const videoUrl = media && media.type === 'video' ? getMediaUrl(media.storageUrl) : null;

  return (
    <Link
      to={`/posts/${post.id}`}
      className="post-card"
      style={{
        textDecoration: 'none',
        position: 'relative',
        overflow: 'hidden',
        background: '#1a1a1a',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Collaborator Badge */}
      {post.collaborators && post.collaborators.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            padding: '4px 8px 4px 4px',
            borderRadius: '100px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <img
            src={
              getMediaUrl(post.collaborators[0].profilePicUrl) || 'https://via.placeholder.com/24'
            }
            alt={post.collaborators[0].username}
            style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 500 }}>
            {post.collaborators[0].username}
          </span>
        </div>
      )}

      {media ? (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          {media.type === 'video' ? (
            <>
              {isHovered ? (
                <video
                  src={videoUrl!}
                  className="post-media"
                  muted
                  loop
                  autoPlay
                  style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                />
              ) : (
                <img
                  src={thumbUrl!}
                  alt="Post Preview"
                  className="post-media"
                  style={{ objectFit: 'cover' }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  background: 'rgba(0,0,0,0.6)',
                  borderRadius: '4px',
                  padding: '2px 4px',
                  fontSize: '0.8rem',
                  zIndex: 5,
                }}
              >
                🎥
              </div>
            </>
          ) : (
            <img
              src={thumbUrl!}
              alt="Post Preview"
              className="post-media"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
          }}
        >
          No Media
        </div>
      )}

      <div className="post-overlay">
        <span style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <Heart size={16} fill="white" /> {post.likes.toLocaleString()}
        </span>
        <span style={{ color: 'white', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <MessageCircle size={16} /> {post.comments.toLocaleString()}
        </span>
      </div>
    </Link>
  );
};

interface PostGridProps {
  posts: Post[];
  sort?: 'recent' | 'oldest' | 'likes' | 'comments';
}

export const PostGrid = ({ posts, sort = 'recent' }: PostGridProps) => {
  const sortedPosts = [...posts].sort((a, b) => {
    if (sort === 'recent') return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    if (sort === 'oldest') return new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime();
    if (sort === 'likes') return b.likes - a.likes;
    if (sort === 'comments') return b.comments - a.comments;
    return 0;
  });

  return (
    <div className="posts-grid">
      {sortedPosts.map((post) => (
        <PostGridItem key={post.id} post={post} />
      ))}
    </div>
  );
};
