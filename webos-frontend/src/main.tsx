import { useWindowStore } from '@/stores'
import { useProcessStore } from '@/stores/processStore'
// Debug: 浏览器控制台可用 __stores.windowStore / __stores.processStore
;(window as any).__stores = { windowStore: useWindowStore, processStore: useProcessStore }

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/toaster'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
)
