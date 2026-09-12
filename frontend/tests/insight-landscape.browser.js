/* Execute in agent-browser on the local Vite page. Tests physical geometry,
 * sight lines and the shared reading boundary, not screenshot-only labels. */
(async () => {
  const L = await import('/src/components/insight/landscape.ts')
  const T = await import('/node_modules/three/build/three.module.js')
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const report = { length: L.routeLength, minimumClearance: Infinity, maximumCameraStep: 0, maximumHeadingStep: 0, hidden: 0, occluded: 0, routeStepRange: [Infinity, 0], elevations: [] }
  assert(L.routeLength > 800, 'Path must extend well beyond the former five-chapter route')
  for (const mobile of [false, true]) {
    const camera = new T.PerspectiveCamera(52, mobile ? 390 / 844 : 1440 / 900, .2, 600)
    let previous
    for (let i = 0; i <= 1200; i++) {
      const point = L.routePosition(i / 1200), pose = L.cameraPose(i / 1200, mobile)
      camera.position.set(pose.x, pose.y, pose.z)
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z); camera.updateMatrixWorld()
      const projected = new T.Vector3(point.x, point.y + .6, point.z).project(camera)
      report.minimumClearance = Math.min(report.minimumClearance, pose.y - L.terrainHeight(pose.x, pose.z))
      if (Math.abs(projected.x) >= .95 || Math.abs(projected.y) >= .95) report.hidden++
      if (L.terrainOccludes(pose, { ...point, y: point.y + .6 })) report.occluded++
      const heading = Math.atan2(pose.target.x - pose.x, pose.target.z - pose.z)
      if (previous) {
        report.maximumCameraStep = Math.max(report.maximumCameraStep, Math.abs(pose.y - previous.y))
        report.maximumHeadingStep = Math.max(report.maximumHeadingStep, Math.abs(heading - previous.heading) * 180 / Math.PI)
        const distance = Math.hypot(point.x - previous.point.x, point.y - previous.point.y, point.z - previous.point.z)
        report.routeStepRange[0] = Math.min(report.routeStepRange[0], distance)
        report.routeStepRange[1] = Math.max(report.routeStepRange[1], distance)
      }
      previous = { y: pose.y, heading, point }
    }
  }
  report.elevations = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1].map(p => L.routePosition(p).y)
  assert(report.minimumClearance >= 13, 'Camera must clear the terrain throughout both rails')
  assert(report.hidden === 0 && report.occluded === 0, 'Moving light must stay in frame and clear of terrain')
  assert(report.maximumCameraStep < .7 && report.maximumHeadingStep < 1.2, 'No abrupt rail height or heading changes')
  assert(report.routeStepRange[1] / report.routeStepRange[0] < 1.02, 'Arc-length motion must remain uniform along bends')
  assert(report.elevations[2] - report.elevations[0] > 50 && report.elevations[2] - report.elevations[4] > 50, 'The route must climb and descend across the ridge')
  const root = document.querySelector('.insight-page')
  const sections = [...root.querySelectorAll('.insight-chapter')]
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  for (const i of [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]) {
    const anchor = Number(sections[i].dataset.arrival)
    window.scrollTo({ top: anchor - 20, behavior: 'instant' }); await wait(100)
    assert(root.dataset.chapter === String(i), 'Previous chapter remains active before the reading line')
    window.scrollTo({ top: anchor + 1, behavior: 'instant' }); await wait(100)
    assert(root.dataset.chapter === String(i + 1), 'Chapter changes as its panel enters the reading line')
    assert(Math.abs(sections[i].querySelector('article').getBoundingClientRect().top - Number(root.dataset.readingLine)) < 3, 'Measured boundary must match actual content position')
    assert(root.dataset.progress === (i / 6).toFixed(5), 'Moving light arrives at the same chapter station')
  }
  return report
})()
