import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        ws: true,
        rewrite: (path) => path
      },
      '/download': {
        target: 'http://localhost:8080',
        rewrite: (path) => path
      },
      '/webapps': {
        target: 'http://localhost:8080',
        rewrite: (path) => path
      },
      '/webos-sdk.js': {
        target: 'http://localhost:8080',
        rewrite: (path) => path
      }
    },
    host: '0.0.0.0',
    allowedHosts: true
  }
})
