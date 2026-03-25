import { useWindowStore } from '@/stores'
import { useProcessStore } from '@/stores/processStore'
// Debug: __stores.windowStore / __stores.processStore are available in the browser console
;(window as any).__stores = { windowStore: useWindowStore, processStore: useProcessStore }

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import './index.css'
import App from './App.tsx'
import { Toaster } from '@/components/ui/toaster'
import i18n from '@/i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
      <Toaster />
    </I18nextProvider>
  </StrictMode>,
)
