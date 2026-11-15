import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

// Keep the deployed app shell available for field visits with weak or no signal.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const appBase = new URL('./', document.baseURI)
    navigator.serviceWorker.register(new URL('sw.js', appBase), { scope: appBase.pathname }).catch(() => {
      // The online app remains usable when service workers are unavailable.
    })
  }, { once: true })
}
