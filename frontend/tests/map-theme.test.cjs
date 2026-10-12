const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const state = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/mapTheme.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: state.exports, module: state })
const { createBasemapTheme } = state.exports

test('Custom basemap follows dark/light theme and restores original colour expressions', () => {
  const expression = ['match', ['get', 'class'], 'park', '#bada55', '#eeeeee']
  const style = { layers: [
    { id: 'land', type: 'background', paint: { 'background-color': '#ffffff' } },
    { id: 'water', type: 'fill', source: 'base', paint: { 'fill-color': '#aabbcc' } },
    { id: 'landuse', type: 'fill', source: 'base', paint: { 'fill-color': expression } },
    { id: 'road-label', type: 'symbol', source: 'base', paint: { 'text-color': '#333333', 'text-halo-color': '#ffffff' } },
    { id: 'indicators', type: 'fill', source: 'areas', paint: { 'fill-color': '#ff0000' } },
  ] }
  const calls = []
  const apply = createBasemapTheme({ getStyle: () => style, setPaintProperty: (...args) => calls.push(args) }, 'areas')
  apply('dark')
  assert.equal(calls.find(([id]) => id === 'land')[2], '#101b2b')
  assert.equal(calls.find(([id]) => id === 'water')[2], '#172f43')
  assert.equal(calls.some(([id]) => id === 'indicators'), false)
  calls.length = 0
  apply('light')
  assert.equal(calls.find(([id]) => id === 'land')[2], '#ffffff')
  assert.equal(calls.find(([id]) => id === 'landuse')[2], expression)
  calls.length = 0
  apply('dark')
  apply('light')
  assert.equal(calls.at(-2)[2], '#333333')
})

test('Standard basemap continues to use its supported lighting configuration', () => {
  const calls = []
  const apply = createBasemapTheme({ getStyle: () => ({ imports: [{ id: 'basemap' }] }),
    setConfigProperty: (...args) => calls.push(args), setPaintProperty: () => assert.fail('Do not recolour Standard layers') }, 'areas')
  apply('dark')
  apply('light')
  assert.deepEqual(calls, [['basemap', 'lightPreset', 'night'], ['basemap', 'lightPreset', 'day']])
})
