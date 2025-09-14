/**
 * main.tsx
 *
 * React entrypoint: bootstraps ThemeProvider and renders the App.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { makeTheme } from './theme'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AppStateProvider, makeInitialAppState } from './state/appState'
import { defaultMinima } from './lib/hsfBuilder'
import { defaultMetasets } from './lib/metasets'
import './styles.css'
import { useEffect, useMemo, useState } from 'react'
import { COLOR_BLIND_MODE_KEY, type ColorBlindMode } from './lib/constants'

function AppShell() {
  const [cbMode, setCbMode] = useState<ColorBlindMode>(() => {
    try {
      const raw = localStorage.getItem(COLOR_BLIND_MODE_KEY)
      if (raw === 'colorblind') return 'okabeIto' // legacy value from initial CB release
      return (raw === 'normal' || raw === 'okabeIto' || raw === 'tritan') ? (raw as ColorBlindMode) : 'normal'
    } catch { return 'normal' }
  })
  const theme = useMemo(() => makeTheme(cbMode), [cbMode])
  // Persist changes
  useEffect(() => { try { localStorage.setItem(COLOR_BLIND_MODE_KEY, cbMode) } catch {} }, [cbMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppStateProvider initial={makeInitialAppState({ minima: defaultMinima(), metasets: defaultMetasets() })}>
        <App colorBlindMode={cbMode} setColorBlindMode={setCbMode} />
      </AppStateProvider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
)
