import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

let app = null

export function mount(ctx) {
  const { container } = ctx

  const root = document.createElement('div')
  root.id = 'office-app'
  root.style.width = '100%'
  root.style.height = '100%'
  container.appendChild(root)

  app = createApp(App, { ctx })
  app.mount(root)
}

export function unmount(ctx) {
  if (app) {
    app.unmount()
    app = null
  }
  ctx.container.innerHTML = ''
}
