import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          // Fixed name for CSS so we can load it predictably
          if (assetInfo.name?.endsWith('.css')) {
            return 'style.css'
          }
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
  plugins: [
    {
      name: 'copy-manifest',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist', 'manifest.json'),
        )
      },
    },
  ],
  worker: {
    format: 'es',
  },
})
