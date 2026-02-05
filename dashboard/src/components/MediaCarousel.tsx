import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getMediaUrl } from '../lib/api';

interface MediaItem {
  type: 'image' | 'video';
  storageUrl: string;
}

interface MediaCarouselProps {
  media: MediaItem[];
}

export const MediaCarousel = ({ media }: MediaCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter valid media just in case
  const validMedia = media.filter((m) => m.storageUrl);
  const totalSlides = validMedia.length;

  // If logic updates, ensure index is valid
  useEffect(() => {
    if (currentIndex >= totalSlides) setCurrentIndex(0);
  }, [totalSlides]);

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % totalSlides);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);

  const currentMedia = validMedia[currentIndex];

  if (!currentMedia) {
    return <div style={{ padding: '2rem', color: '#666' }}>No media available</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Media Content */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
        }}
      >
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
              zIndex: 10,
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
              zIndex: 10,
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
              gap: '6px',
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
                  transition: 'background 0.2s',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
