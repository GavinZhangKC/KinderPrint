// Component state checks without a browser: node --test tests/simulation-selection.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/components/SimulationPage.tsx'), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function harness() {
  const hooks = []
  const requests = []
  let cursor = 0
  let selectArea
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { current: initial }
      return hooks[index]
    },
    useEffect() {},
    useCallback(callback) { return callback },
  }
  const jsx = (type, props) => ({ type, props })
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, console,
    window: { localStorage: { getItem: () => null }, cancelAnimationFrame() {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
      if (name === 'framer-motion') return { motion: { div: 'motion-div', section: 'motion-section' }, useReducedMotion: () => false }
      if (name === './BrandHeader') return { default: 'brand-header' }
      if (name === '../services/api') return { api: {
        getNeighbourhoodIndicators: () => new Promise(resolve => requests.push(resolve)),
      } }
      if (name === '../hooks/useNeighbourhoodSearch') return { useNeighbourhoodSearch({ onSelectResult }) {
        selectArea = onSelectResult
        const [search, setSearch] = react.useState('')
        return { search, setSearch, setShowSearchResults() {}, showSearchResults: false,
          searchResults: [], searchLoading: false, handleSearchResultSelect: onSelectResult, submitSearch() {} }
      } }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  function render() {
    cursor = 0
    const tree = module.exports.default({})
    const nodes = []
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object' || !node.props) return
      nodes.push(node)
      walk(node.props.children)
    }
    walk(tree)
    return nodes
  }
  return { render, requests, select: item => selectArea(item) }
}

function indicators(id, name) {
  const values = { env_vegetation_cover: 25, env_urban_heat: 2, env_open_space_access: 15,
    env_declared_road_traffic_intensity: 5000, env_bushfire_prone_share_pct: 3 }
  return { status: 'available', data: { neighbourhoods: [{ id, name, geographic_unit: 'SA2',
    indicators: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, status: 'available' }])) }] } }
}
const area = { id: '206041122', name: 'Test area' }
const controls = nodes => nodes.find(node => node.props.className === 'simulation-controls-reveal')
const removeButton = nodes => nodes.find(node => node.props['aria-label'] === `Remove ${area.name}`)

test('Controls expand only after selection loads, tabs switch pages, and clearing the search collapses controls', async () => {
  const app = harness()
  assert.equal(controls(app.render()).props.animate.height, 0)
  const loading = app.select(area)
  assert.equal(controls(app.render()).props.inert, true)
  app.requests[0](indicators(area.id, area.name))
  await loading
  let nodes = app.render()
  assert.equal(controls(nodes).props.animate.height, 'auto')
  assert.equal(controls(nodes).props.inert, false)
  const navigation = nodes.find(node => node.props.className === 'simulation-results-tabs')
  assert.deepEqual(Array.from(navigation.props.children, button => button.props.children),
    ['Environment map', 'Outcomes', 'Comparison', 'Drivers'])
  navigation.props.children[2].props.onClick()
  nodes = app.render()
  assert.equal(nodes.find(node => node.props.className === 'simulation-results-tabs').props.children[2].props['aria-current'], 'page')
  assert.ok(nodes.some(node => node.props.className === 'simulation-scenario-comparison'))
  assert.ok(!nodes.some(node => node.props.className === 'simulation-results-pager'))
  nodes.find(node => node.props.id === 'simulation-neighbourhood').props.onChange({ target: { value: '' } })
  nodes = app.render()
  assert.equal(controls(nodes).props.animate.height, 0)
  assert.equal(controls(nodes).props.inert, true)
  assert.equal(nodes.find(node => node.type === 'fieldset').props.disabled, true)
  assert.ok(!nodes.some(node => node.props.className === 'simulation-panel simulation-results-panel'))
})

test('Removing an area during loading prevents a late response from reopening controls', async () => {
  const app = harness()
  app.render()
  const loading = app.select(area)
  removeButton(app.render()).props.onClick()
  app.requests[0](indicators(area.id, area.name))
  await loading
  const nodes = app.render()
  assert.equal(controls(nodes).props.animate.height, 0)
  assert.equal(removeButton(nodes), undefined)
})

test('The newest selected area wins when two responses arrive out of order', async () => {
  const app = harness()
  app.render()
  const first = app.select(area)
  app.render()
  const secondArea = { id: '206041123', name: 'Second test area' }
  const second = app.select(secondArea)
  app.requests[1](indicators(secondArea.id, secondArea.name))
  await second
  app.requests[0](indicators(area.id, area.name))
  await first
  const nodes = app.render()
  assert.equal(controls(nodes).props.animate.height, 'auto')
  assert.ok(nodes.some(node => node.props['aria-label'] === `Remove ${secondArea.name}`))
  assert.equal(removeButton(nodes), undefined)
})
