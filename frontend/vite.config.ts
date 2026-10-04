import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSource = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'cesium-static'
const cesiumSourceRootSegments = cesiumSource.split('/').length
const cesiumStaticDirectories = [
  'Assets',
  'ThirdParty',
  'Widgets',
  'Workers',
] as const

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    define: {
      CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}/`),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: cesiumStaticDirectories.map((directory) => ({
          src: `${cesiumSource}/${directory}/**/*`,
          dest: cesiumBaseUrl,
          rename: { stripBase: cesiumSourceRootSegments },
        })),
      }),
    ],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
