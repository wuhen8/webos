import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

export default defineConfig({
  plugins: [
    vue(),
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
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'style.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
