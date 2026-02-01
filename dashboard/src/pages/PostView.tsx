import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPost, updatePost, getMediaUrl } from '../lib/api';
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Heart,
  Eye,
  Calendar,
  Edit,
  Save,
  X,
} from 'lucide-react';

export const PostView = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: post, isLoading } = useQuery({
    queryKey: ['post', id],
    queryFn: () => getPost(id!),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [caption, setCaption] = useState('');
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    if (post) {
      setCaption(post.caption || '');
      setTranscript(post.transcripts?.[0]?.text || '');
    }
  }, [post]);

  const updateMutation = useMutation({
    mutationFn: (data: { caption: string; transcriptText: string }) => updatePost(id!, data),
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ caption, transcriptText: transcript });
  };

  if (isLoading) return <div>Loading...</div>;
  if (!post) return <div>Post not found</div>;



  return (
    <div className="fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <Link
          to={`/accounts/${post.username}`}
          style={{
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <ArrowLeft size={16} /> Back to Posts
        </Link>
        <div style={{ display: 'flex', gap: '1rem' }}>
          {post.newerPostId && (
            <Link
              to={`/posts/${post.newerPostId}`}
              className="nav-arrow"
              title="Previous Post (Newer)"
              onClick={() => setIsEditing(false)}
            >
              <ArrowLeft size={24} />
            </Link>
          )}
          {post.olderPostId && (
            <Link
              to={`/posts/${post.olderPostId}`}
              className="nav-arrow"
              title="Next Post (Older)"
              onClick={() => setIsEditing(false)}
            >
              <ArrowRight size={24} />
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Left Column: Media */}
        <div
          style={{
            background: '#111',
            borderRadius: '12px',
            overflow: 'hidden',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {post.media && post.media.length > 0 ? (
            (() => {
              const [currentIndex, setCurrentIndex] = useState(0);
              const currentMedia = post.media[currentIndex];

              // Filter valid media just in case
              const validMedia = post.media.filter(m => m.storageUrl);
              const totalSlides = validMedia.length;

              // If logic updates, ensure index is valid
              useEffect(() => {
                if (currentIndex >= totalSlides) setCurrentIndex(0);
              }, [totalSlides]);

              const handleNext = () => setCurrentIndex((prev) => (prev + 1) % totalSlides);
              const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);

              return (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                  {/* Media Content */}
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                    {currentMedia.type === 'video' ? (
                      <video
                        src={getMediaUrl(currentMedia.storageUrl)}
                        controls
                        style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                      />
                    ) : (
                      <img
                        src={getMediaUrl(currentMedia.storageUrl)}
                        alt={`Slide ${currentIndex + 1}`}
                        style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                      />
                    )}
                  </div>

                  {/* Navigation Controls (Only if multiple items) */}
                  {totalSlides > 1 && (
                    <>
                      <button
                        onClick={handlePrev}
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'rgba(0,0,0,0.5)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '40px',
                          height: '40px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10
                        }}
                      >
                        <ArrowLeft size={20} />
                      </button>

                      <button
                        onClick={handleNext}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'rgba(0,0,0,0.5)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '50%',
                          width: '40px',
                          height: '40px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 10
                        }}
                      >
                        <ArrowRight size={20} />
                      </button>

                      {/* Counter Badge */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '20px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          pointerEvents: 'none',
                        }}
                      >
                        {currentIndex + 1} / {totalSlides}
                      </div>

                      {/* Dots Indicator */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '5px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex',
                          gap: '6px'
                        }}
                      >
                        {validMedia.map((_, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: idx === currentIndex ? '#fff' : 'rgba(255,255,255,0.3)',
                              transition: 'background 0.2s'
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()
          ) : (
            <div style={{ padding: '2rem', color: '#666' }}>No media available</div>
          )}
        </div>

        {/* Right Column: Data */}
        <div>
          {/* Header with Edit Button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-secondary)',
              }}
            >
              <Calendar size={16} /> {new Date(post.postedAt).toLocaleDateString()}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="action-btn"
                    title="Save"
                    disabled={updateMutation.isPending}
                  >
                    <Save size={18} />
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="action-btn"
                    style={{ background: '#555' }}
                    title="Cancel"
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="action-btn"
                  title="Edit Content"
                >
                  <Edit size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Collaborators */}
          {post.collaborators && post.collaborators.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                fontSize: '0.9rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>Collab / Origin:</span>
              {post.collaborators.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {c.profilePicUrl && (
                    <img
                      src={getMediaUrl(c.profilePicUrl)}
                      alt={c.username}
                      style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                    />
                  )}
                  <a
                    href={`https://instagram.com/${c.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#fff', textDecoration: 'underline' }}
                  >
                    @{c.username}
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'var(--card-bg)',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Heart className="accent-text" /> <strong>{post.likes.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MessageCircle className="accent-text" />{' '}
              <strong>{post.comments.toLocaleString()}</strong>
            </div>
            {post.views && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye className="accent-text" /> <strong>{post.views.toLocaleString()}</strong>
              </div>
            )}
          </div>

          {/* Caption */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0 }}>Caption</h3>
            {isEditing ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '150px',
                  background: '#000',
                  color: '#fff',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              />
            ) : (
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  paddingRight: '0.5rem',
                  color: '#ccc',
                  lineHeight: '1.6',
                }}
                className="custom-scrollbar"
              >
                {post.caption}
              </div>
            )}
          </div>

          {/* Transcript */}
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Transcript
              {post.transcripts && post.transcripts.length > 0 && (
                <span className="tag">AI Generated</span>
              )}
            </h3>

            {isEditing ? (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '300px',
                  background: '#000',
                  color: '#fff',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              />
            ) : (post.transcripts && post.transcripts.length > 0) || transcript ? (
              <div
                style={{
                  background: 'var(--card-bg)',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
                className="custom-scrollbar"
              >
                {post.transcripts?.[0]?.text || transcript}
              </div>
            ) : (
              <div
                style={{
                  padding: '2rem',
                  border: '1px dashed var(--border)',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                }}
              >
                No transcript available for this post.
              </div>
            )}
          </div>

          <div style={{ marginTop: '2rem' }}>
            <a
              href={post.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--primary)', textDecoration: 'none' }}
            >
              View on Instagram &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
