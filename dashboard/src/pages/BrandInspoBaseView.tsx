import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getInspoItems, getInspoDigest } from '../lib/api';
import { Sparkles, RefreshCw, MessageSquare, ExternalLink, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const BrandInspoBaseView = () => {
  const { brandId } = useParams<{ brandId: string }>();

  // 1. Fetch Inspo Items
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['inspo-items', brandId],
    queryFn: () => getInspoItems(brandId!),
    enabled: !!brandId,
  });

  // 2. Fetch Latest Synthesis
  const {
    data: digest,
    isLoading: loadingDigest,
    refetch: refetchDigest,
    isFetching: fetchingDigest,
  } = useQuery({
    queryKey: ['inspo-digest', brandId],
    queryFn: () => getInspoDigest(brandId!),
    enabled: !!brandId,
  });

  if (loadingItems || loadingDigest) return <div>Loading InspoBase...</div>;

  return (
    <div className="fade-in">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '2rem' }}>InspoBase</h1>
        <button
          onClick={() => refetchDigest()}
          disabled={fetchingDigest}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1rem',
            background: 'rgba(88, 166, 255, 0.15)',
            color: '#58a6ff',
            border: '1px solid rgba(88, 166, 255, 0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          <RefreshCw size={16} className={fetchingDigest ? 'spin' : ''} />
          {fetchingDigest ? 'Synthesizing...' : 'Trigger Synthesis'}
        </button>
      </div>

      {/* Synthesis Section */}
      <section style={{ marginBottom: '3rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: '#c9d1d9',
          }}
        >
          <Sparkles size={18} style={{ color: '#d29922' }} />
          <h2 style={{ fontSize: '1.25rem', margin: 0, border: 'none' }}>
            Current Creative Direction
          </h2>
        </div>

        {digest ? (
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4px',
                height: '100%',
                background: 'linear-gradient(to bottom, #d29922, #58a6ff)',
              }}
            />

            <p
              style={{
                lineHeight: '1.6',
                fontSize: '1.05rem',
                color: '#f0f6fc',
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {digest.content}
            </p>

            {digest.attachedUrls && digest.attachedUrls.length > 0 && (
              <div
                style={{
                  marginTop: '1.5rem',
                  borderTop: '1px solid var(--border)',
                  paddingTop: '1rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: '#8b949e',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Top Influences
                </span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {digest.attachedUrls.map((url: string) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.85rem',
                        color: '#58a6ff',
                        textDecoration: 'none',
                        background: 'rgba(88, 166, 255, 0.1)',
                        padding: '4px 10px',
                        borderRadius: '100px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ExternalLink size={12} />
                      {url.split('/p/')[1]?.split('/')[0] || 'View Post'}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#8b949e',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '12px',
              border: '1px dashed var(--border)',
            }}
          >
            No synthesis generated yet. Add some inspo items and trigger one.
          </div>
        )}
      </section>

      {/* Inspo Items Grid */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#c9d1d9' }}>
            <Calendar size={18} />
            <h2 style={{ fontSize: '1.25rem', margin: 0, border: 'none' }}>
              Captured Inspo ({items?.length || 0})
            </h2>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {items?.map((item: any) => (
            <div
              key={item.id}
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '100px',
                    background:
                      item.type === 'inspo'
                        ? 'rgba(56, 139, 253, 0.15)'
                        : 'rgba(163, 113, 247, 0.15)',
                    color: item.type === 'inspo' ? '#58a6ff' : '#a371f7',
                    border: `1px solid ${item.type === 'inspo' ? 'rgba(56, 139, 253, 0.3)' : 'rgba(163, 113, 247, 0.3)'}`,
                  }}
                >
                  {item.type.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </span>
              </div>

              {item.post && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '8px',
                    borderRadius: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      background: '#333',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    {/* Placeholder for media if available */}
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
                      <Sparkles size={16} />
                    </div>
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f0f6fc' }}>
                      @{item.post.username}
                    </div>
                    <a
                      href={item.post.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: '#8b949e',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      View on IG <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              )}

              {item.note && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <MessageSquare
                    size={14}
                    style={{ color: '#8b949e', marginTop: '4px', flexShrink: 0 }}
                  />
                  <p
                    style={{ margin: 0, fontSize: '0.9rem', color: '#c9d1d9', fontStyle: 'italic' }}
                  >
                    "{item.note}"
                  </p>
                </div>
              )}

              <div
                style={{
                  marginTop: 'auto',
                  paddingTop: '0.5rem',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: item.status === 'processed' ? '#3fb950' : '#d29922',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: item.status === 'processed' ? '#3fb950' : '#d29922',
                    }}
                  />
                  {item.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
          {items?.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '3rem',
                color: '#8b949e',
              }}
            >
              No items in your InspoBase yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
