/* Run in the local Vite page after entering Insight:
 * Get-Content frontend/tests/insight.browser.js -Raw | npx.cmd --yes agent-browser eval --stdin
 * Assertions use the live API. No fixtures are used as displayed evidence.
 */
(async () => {
  const checks = []
  const assert = (condition, label) => {
    if (!condition) throw new Error(label)
    checks.push(label)
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const root = document.querySelector('.insight-page')
  assert(root, 'Insight is mounted')
  const sections = [...root.querySelectorAll('.insight-chapter')]
  assert(sections.length === 5, 'All five chapters exist')
  for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
    window.scrollTo({ top: Number(sections[index].dataset.arrival) + 1, behavior: 'instant' })
    await wait(900)
    assert(root.dataset.chapter === String(index + 1), `Scroll chapter ${index + 1}`)
    assert(root.querySelector('[aria-current="step"]')?.getAttribute('aria-label').startsWith(String(index + 1)), 'Accessible chapter indicator matches')
    if (root.dataset.scene === 'ready') {
      const stations = [...root.querySelectorAll('[data-station]')]
      assert(stations.every((node, i) => node.dataset.state === (i === index ? 'current' : i < index ? 'passed' : 'future')), 'Five scene node states match')
      assert(Number(root.querySelector('.insight-scene').dataset.cameraClearance) >= 13, 'Camera clears terrain')
      assert(root.querySelector('.insight-scene').dataset.markerVisible === 'true', 'Traveller is visible at arrival')
      assert(sections[index].dataset.active === 'true', 'Reading chapter shares the same state')
    }
  }
  const { journeyAtScroll, weatherAt } = await import('/src/components/insight/journey.ts')
  assert(journeyAtScroll(1998, [0, 1000, 2000, 3000, 4000], 2).chapter === 2 && journeyAtScroll(1990, [0, 1000, 2000, 3000, 4000], 2).chapter === 1, 'One scroll map handles boundary hysteresis and reversal')
  assert(root.querySelectorAll('.insight-progress button').length === 5 && !root.querySelector('.insight-progress svg'), 'Vertical five-point navigation replaces the horizontal card')
  assert(weatherAt(.5).rain > .9 && weatherAt(1).rain === 0 && weatherAt(1).sun === 1, 'Weather follows journey progress')
  const data = await import('/src/components/insight/useInsightData.ts')
  const exampleId = root.querySelector('[data-neighbourhood]').dataset.neighbourhood
  const response = await fetch(`/api/neighbourhoods/${encodeURIComponent(exampleId)}/profile`).then(r => r.json())
  const profile = response.data
  assert(response.status === 'available' || response.status === 'limited', 'Real example API is available')
  for (const element of root.querySelectorAll('[data-metric]')) {
    const raw = profile.domains.flatMap(domain => domain.indicators).find(item => item.id === element.dataset.metric)
    assert(element.querySelector('strong').textContent === data.formatMetric(raw), `${raw.id} equals API value`)
    assert(element.querySelector('cite').textContent.includes(String(raw.reference_year)), `${raw.id} includes reference year`)
  }
  // These alterations are isolated validation inputs and are never rendered.
  const altered = structuredClone(profile)
  const metric = altered.domains[0].indicators[0]
  metric.value = 0
  assert(data.validMetric(altered, metric.id, metric.unit)?.value === 0, 'Zero remains valid')
  metric.status = 'unavailable'
  assert(data.validMetric(altered, metric.id, metric.unit) === null, 'Unavailable values are never displayed as zero')
  metric.status = 'available'; metric.geographic_unit = 'incompatible geography'
  assert(data.validMetric(altered, metric.id, metric.unit) === null, 'Incompatible geography is rejected')
  window.scrollTo({ top: sections[4].offsetTop, behavior: 'instant' })
  await wait(900)
  const before = root.dataset.progress
  const panelTop = sections[4].querySelector('article').getBoundingClientRect().top
  window.scrollBy({ top: 90, behavior: 'instant' })
  await wait(500)
  assert(before === '1.00000' && root.dataset.progress === before, 'Ending scene stays stopped')
  assert(sections[4].querySelector('article').getBoundingClientRect().top < panelTop, 'Ending content continues scrolling')
  assert(document.documentElement.scrollWidth <= innerWidth, 'No horizontal overflow')
  root.querySelector('.insight-actions .secondary').click()
  for (let attempt = 0; attempt < 40 && scrollY !== 0; attempt++) await wait(100)
  assert(scrollY === 0 && document.activeElement.id === 'insight-heading-1', 'Replay returns scroll and keyboard focus to start')
  return { passed: checks.length, checks }
})()
