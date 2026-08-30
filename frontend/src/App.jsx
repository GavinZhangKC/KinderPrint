import './App.css'

const profileDomains = ['Child Development', 'Social', 'Environment']

export default function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#main-content">KinderPrint</a>
        <nav aria-label="Primary navigation">
          <a href="#explore">Explore</a>
          <a href="#profile">Profile</a>
          <a href="#compare">Compare</a>
        </nav>
      </header>

      <main id="main-content">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Neighbourhood evidence</p>
          <h1 id="page-title">Explore community-level information</h1>
          <p>
            Search for a supported neighbourhood to view its profile, investigation priority,
            contributing factors and comparable area.
          </p>
        </section>

        <section id="explore" aria-labelledby="explore-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Explore</p>
              <h2 id="explore-title">Find a neighbourhood</h2>
            </div>
          </div>

          <form className="search-form">
            <label htmlFor="neighbourhood-search">Neighbourhood name</label>
            <div className="field-row">
              <input
                id="neighbourhood-search"
                name="neighbourhood"
                type="search"
                placeholder="Search supported neighbourhoods"
              />
              <button type="submit" disabled>Search</button>
            </div>
          </form>

          <div className="map-placeholder" role="img" aria-label="Neighbourhood map placeholder">
            <p>Map area</p>
            <small>Neighbourhood boundaries will appear here.</small>
          </div>
        </section>

        <section id="profile" aria-labelledby="profile-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Neighbourhood profile</p>
              <h2 id="profile-title">No neighbourhood selected</h2>
            </div>
            <span className="status">Awaiting selection</span>
          </div>

          <div className="domain-grid">
            {profileDomains.map((domain) => (
              <article key={domain}>
                <h3>{domain}</h3>
                <p>Indicators will be shown when supported data is available.</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="priority-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Priority for Investigation</p>
              <h2 id="priority-title">Investigation overview</h2>
            </div>
          </div>

          <div className="two-column">
            <article>
              <h3>Relative priority band</h3>
              <p>No priority result is available until a neighbourhood is selected.</p>
            </article>
            <article>
              <h3>Contributing domains</h3>
              <p>Approved contributing domains will be listed here.</p>
            </article>
          </div>
        </section>

        <section aria-labelledby="explanation-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Explanation</p>
              <h2 id="explanation-title">Contributing factors</h2>
            </div>
          </div>

          <div className="empty-state">
            <p>Full and highlighted contributing factors will appear here.</p>
            <small>Prominent factors are investigation leads, not proven causes.</small>
          </div>
        </section>

        <section id="compare" aria-labelledby="compare-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Match and compare</p>
              <h2 id="compare-title">Compare neighbourhoods</h2>
            </div>
          </div>

          <div className="two-column">
            <article>
              <h3>Recommended comparable neighbourhood</h3>
              <p>A supported match and its similarity basis will appear here.</p>
            </article>
            <article>
              <h3>Manual comparison</h3>
              <label htmlFor="comparison-neighbourhood">Second neighbourhood</label>
              <select id="comparison-neighbourhood" disabled defaultValue="">
                <option value="">Select a neighbourhood</option>
              </select>
              <button type="button" disabled>Compare</button>
            </article>
          </div>
        </section>

        <aside className="notice" aria-label="Information notice">
          <h2>About this information</h2>
          <p>
            KinderPrint presents aggregate area-level information. Required approved notices will
            be displayed with each result.
          </p>
        </aside>
      </main>

      <footer>
        <small>KinderPrint — Iteration 1 application shell</small>
      </footer>
    </div>
  )
}
