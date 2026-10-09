// Run with: node --test tests/health-storage.test.cjs (no extra dependencies).
const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(entry, raw, blocked = false) {
  const code = buildSync({
    entryPoints: [path.resolve(__dirname, '..', entry)], bundle: true,
    platform: 'node', format: 'cjs', jsx: 'automatic', write: false, loader: { '.css': 'empty' },
    external: ['react', 'react-dom', 'framer-motion'],
  }).outputFiles[0].text
  const module = { exports: {} }
  const context = {
    module, exports: module.exports, require, console,
    window: { localStorage: { getItem() { if (blocked) throw new Error('blocked'); return raw } } },
  }
  vm.runInNewContext(code, context)
  return module.exports
}

const defaults = { bed: 21, wake: 7, active: 40, screens: 180, veg: 4.5, water: 3, sweet: true }

test('Healthy day renders defaults for invalid or unavailable stored input', () => {
  for (const raw of [null, 'not-json', 'null', '[]', '42', '{"1":{}}',
    JSON.stringify({ 1: { ...defaults, active: '40' } }),
    JSON.stringify({ 1: { ...defaults, water: -1 } }),
    JSON.stringify({ 1: { ...defaults, active: 999 } }),
    JSON.stringify({ 1: { ...defaults, sweet: 'false' } })]) {
    const HealthyDay = load('src/components/hub/HealthyDay.tsx', raw).default
    const html = renderToStaticMarkup(React.createElement(HealthyDay, { age: '5–9 years', ageControl: null }))
    assert.match(html, /40 min/)
    assert.doesNotMatch(html, /NaN|undefined/)
  }
  const HealthyDay = load('src/components/hub/HealthyDay.tsx', null, true).default
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(HealthyDay, { age: '5–9 years', ageControl: null })))
})

test('Healthy day retains valid saved values independently of other invalid age bands', () => {
  const HealthyDay = load('src/components/hub/HealthyDay.tsx', JSON.stringify({
    0: null, 1: { ...defaults, active: 65 }, 2: {},
  })).default
  const html = renderToStaticMarkup(React.createElement(HealthyDay, { age: '5–9 years', ageControl: null }))
  assert.match(html, /1 h 5 min/)
  assert.doesNotMatch(html, /NaN|undefined/)
})

test('Shared storage falls back on malformed JSON, null, wrong types and denied access', () => {
  for (const raw of ['null', '[]', '{}', '42', 'bad-json']) {
    assert.equal(load('src/components/health/healthPlanning.ts', raw).readStored('key', 'parent'), 'parent')
  }
  assert.equal(load('src/components/health/healthPlanning.ts', null, true).readStored('key', 'parent'), 'parent')
  assert.equal(load('src/components/health/healthPlanning.ts', '"practitioner"').readStored('key', 'parent'), 'practitioner')
  const guard = value => Array.isArray(value) && value.every(item => typeof item === 'string')
  assert.equal(load('src/components/health/healthPlanning.ts', '[null,1]').readStored('key', [], guard).length, 0)
  assert.equal(load('src/components/health/healthPlanning.ts', '["nip-birth"]').readStored('key', [], guard)[0], 'nip-birth')
})
