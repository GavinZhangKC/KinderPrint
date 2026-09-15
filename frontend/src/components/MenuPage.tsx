import { useEffect, useRef } from 'react'

import '../styles/menu.css'

interface MenuPageProps {
  onInsight?: () => void
  onMap?: () => void
  onAboutUs?: () => void
}

interface PreviewMenuLinkProps {
  number: string
  label: string
  videoSrc: string
  active?: boolean
  onClick?: () => void
}

function PreviewMenuLink({
  number,
  label,
  videoSrc,
  active = false,
  onClick,
}: PreviewMenuLinkProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = 0.85
    video.pause()
    video.currentTime = 0
  }, [])

  const playPreview = () => {
    void videoRef.current?.play().catch(() => undefined)
  }

  const resetPreviewAfterClosing = () => {
    const video = videoRef.current
    if (!video || video.closest('.menu-link')?.matches(':hover, :focus-visible')) return
    video.pause()
    video.currentTime = 0
  }

  return (
    <button
      className={`menu-link${active ? ' menu-link-active' : ''}`}
      type="button"
      onClick={onClick}
      onMouseEnter={playPreview}
      onFocus={playPreview}
    >
      <span
        className="menu-link-preview"
        aria-hidden="true"
        onTransitionEnd={(event) => {
          if (event.propertyName === 'clip-path') resetPreviewAfterClosing()
        }}
      >
        <video
          ref={videoRef}
          className="menu-link-video"
          src={videoSrc}
          muted
          loop
          playsInline
          preload="metadata"
        />
        <span className="menu-link-overlay" />
      </span>
      <span className="menu-link-content">
        <span className="menu-link-number">{number}</span>
        <span className="menu-link-label">{label}</span>
      </span>
    </button>
  )
}

export default function MenuPage({ onInsight, onMap, onAboutUs }: MenuPageProps) {
  return (
    <section className="menu-page" id="menu" aria-labelledby="menu-title" data-ripple-surface>
      <div className="menu-intro" data-no-ripple>
        <p>Explore Vkinder</p>
        <h2 id="menu-title">Choose where to begin.</h2>
      </div>

      <nav className="menu-links" aria-label="Explore sections" data-no-ripple>
        <PreviewMenuLink number="01" label="INSIGHT" videoSrc="/insight-preview.mp4" active onClick={onInsight} />
        <PreviewMenuLink number="02" label="MAP" videoSrc="/map-preview.mp4" onClick={onMap} />
        <PreviewMenuLink number="03" label="ABOUT US" videoSrc="/about-preview.mp4" onClick={onAboutUs} />
      </nav>

      <div className="menu-visual" aria-hidden="true" data-no-ripple>
        <div className="menu-orb menu-orb-large" />
        <div className="menu-orb menu-orb-small" />
        <div className="glass menu-visual-card">
          <span>INSIGHT</span>
          <strong>Local evidence, clearly connected.</strong>
        </div>
      </div>
    </section>
  )
}
