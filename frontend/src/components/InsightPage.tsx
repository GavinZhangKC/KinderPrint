import BrandHeader from './BrandHeader'
import './InsightPage.css'

interface InsightPageProps {
  onLogoClick: () => void
  onBackToMenu: () => void
  onExploreMap: () => void
}

const insightAreas = [
  {
    title: 'Child Development',
    description: 'Explore indicators related to children’s development and wellbeing.',
  },
  {
    title: 'Social Context',
    description: 'Understand the social and socioeconomic conditions of each neighbourhood.',
  },
  {
    title: 'Environment',
    description: 'Review environmental factors including heat, vegetation and public open space.',
  },
]

export default function InsightPage({ onLogoClick, onBackToMenu, onExploreMap }: InsightPageProps) {
  return (
    <div className="app-background insight-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <BrandHeader
        onLogoClick={onLogoClick}
        onExplore={onExploreMap}
        onBackToMenu={onBackToMenu}
      />

      <main className="insight-page__main">
        <article className="glass insight-panel" aria-labelledby="insight-title">
          <header className="insight-panel__heading">
            <p className="insight-panel__kicker">INSIGHT</p>
            <h1 id="insight-title">Understand the factors shaping each neighbourhood.</h1>
            <p>
              KinderPrint brings together child development, social context and environmental
              indicators to help users understand neighbourhood conditions more clearly.
            </p>
          </header>

          <div className="insight-grid">
            {insightAreas.map((area, index) => (
              <section className="glass-subtle insight-card" key={area.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <h2>{area.title}</h2>
                <p>{area.description}</p>
              </section>
            ))}
          </div>

          <button className="button primary insight-map-button" type="button" onClick={onExploreMap}>
            Explore the Map
          </button>
        </article>
      </main>
    </div>
  )
}
