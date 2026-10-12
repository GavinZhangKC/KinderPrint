// Run with: node tests/map-data.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const moduleState = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/mapStyles.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleState.exports, module: moduleState })
const { hasHeatmapData, choroplethFill, NO_DATA_FILL } = moduleState.exports
const layers = { development: 'development', heat: 'heat', social: 'social', vegetation: 'vegetation', 'green-space': 'green_space' }

function evaluate(expression, properties) {
  if (!Array.isArray(expression)) return expression
  const [operator, ...args] = expression
  const value = expr => evaluate(expr, properties)
  switch (operator) {
    case 'get': return properties[args[0]] ?? null
    case 'typeof': return typeof value(args[0])
    case '==': return value(args[0]) === value(args[1])
    case 'case': return value(args[0]) ? value(args[1]) : value(args[2])
    case 'coalesce': return args.map(value).find(item => item !== null && item !== undefined)
    case 'interpolate': {
      const input = value(args[1])
      // These checks use the low stop and mid stop, so colour interpolation is unnecessary.
      const stops = args.slice(2)
      for (let i = 0; i < stops.length; i += 2) if (input <= stops[i]) return stops[i + 1]
      return stops.at(-1)
    }
    default: throw new Error(`Unsupported expression: ${operator}`)
  }
}

test('Missing or nonnumeric values are grey and cannot open a locality in every heatmap layer', () => {
  for (const [layer, property] of Object.entries(layers)) {
    for (const missing of [null, undefined, '0', 'unknown']) {
      const properties = { [property]: missing }
      assert.equal(hasHeatmapData(properties, layer), false)
      assert.equal(evaluate(choroplethFill(layer), properties), NO_DATA_FILL)
    }
    assert.equal(hasHeatmapData(null, layer), false)
  }
})

test('Zero and negative observations remain available; missingness follows the current layer', () => {
  for (const [layer, property] of Object.entries(layers)) {
    for (const observation of [0, -1, 50]) {
      assert.equal(hasHeatmapData({ [property]: observation }, layer), true)
      assert.notEqual(evaluate(choroplethFill(layer), { [property]: observation }), NO_DATA_FILL)
    }
    for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(hasHeatmapData({ [property]: invalid }, layer), false)
  }
  assert.equal(hasHeatmapData({ heat: null, development: 0 }, 'heat'), false)
  assert.equal(hasHeatmapData({ heat: null, development: 0 }, 'development'), true)
})

test('Turning off the heatmap allows normal map exploration', () => {
  assert.equal(hasHeatmapData(null, null), true)
  assert.equal(choroplethFill(null), '#FFFFFF')
})
