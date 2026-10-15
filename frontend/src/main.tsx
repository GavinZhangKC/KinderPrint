import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import BrandLogo from './components/BrandLogo'
import { ThemeProvider } from './theme/ThemeProvider'
import './components/cesium/CesiumExperimentPage.css'
import './styles/midnight-tokens.css'
import './styles/midnight-glass.css'

const App = lazy(() => import('./App'))
const CesiumExperimentPage = lazy(
  () => import('./components/cesium/CesiumExperimentPage'),
)

function CesiumPageFallback() {
  return (
    <div className="cesium-experiment-loading" role="status" aria-live="polite">
      <span className="cesium-loading-glow cesium-loading-glow-one" aria-hidden="true" />
      <span className="cesium-loading-glow cesium-loading-glow-two" aria-hidden="true" />
      <section className="cesium-loading-panel">
        <div className="cesium-loading-brand" aria-hidden="true">
          <BrandLogo />
          <span>Vkinder</span>
        </div>
        <p className="cesium-loading-kicker">Parkville in 3D</p>
        <h1>Preparing your journey</h1>
        <p className="cesium-loading-copy">Building your Melbourne experience...</p>
        <div
          className="cesium-loading-track is-indeterminate"
          role="progressbar"
          aria-label="Loading the Parkville journey"
          aria-valuetext="Loading the 3D experience"
        >
          <i />
        </div>
        <div className="cesium-loading-meta">
          <span>Loading the 3D experience...</span>
          <strong>Preparing</strong>
        </div>
      </section>
    </div>
  )
}

function RootPage() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'

  if (pathname === '/insight-journey' || pathname === '/cesium-experiment') {
    return (
      <Suspense fallback={<CesiumPageFallback />}>
        <CesiumExperimentPage />
      </Suspense>
    )
  }

  return <App />
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider><RootPage /></ThemeProvider>
  </StrictMode>,
)
