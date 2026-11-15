import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function offlineAssetManifest() {
  return {
    name: 'fieldshift-offline-asset-manifest',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((file) => /\.(?:m?js|css)$/.test(file))
      files.push('index.html', 'sw.js', 'fieldshift.svg', 'data/global-crop-calendar-v1.json', 'data/global-crop-calendar-v1.bin')
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify([...new Set(files)]) })
    },
  }
}

export default defineConfig({
  plugins: [react(), offlineAssetManifest()],
  base: './',
  test: { environment: 'node' },
})
