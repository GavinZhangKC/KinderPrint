import { useState } from 'react'
import type { CSSProperties } from 'react'
import './AmbientStoryVideo.css'

interface AmbientStoryVideoProps {
  className?: string
  mp4Src: string
  webmSrc?: string
  posterSrc: string
  position?: string
}

export default function AmbientStoryVideo({
  className = '',
  mp4Src,
  webmSrc,
  posterSrc,
  position = 'center',
}: AmbientStoryVideoProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={`ambient-story-video ${failed ? 'has-failed' : ''} ${className}`.trim()}
      style={{ '--story-video-position': position } as CSSProperties}
      aria-hidden="true"
    >
      <img className="ambient-story-video__poster" src={posterSrc} alt="" />
      {!failed && (
        <video
          className="ambient-story-video__media"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={posterSrc}
          tabIndex={-1}
          onError={() => setFailed(true)}
        >
          {webmSrc && <source src={webmSrc} type="video/webm" />}
          <source src={mp4Src} type="video/mp4" />
        </video>
      )}
      <div className="ambient-story-video__grade" />
    </div>
  )
}
