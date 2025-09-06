/**
 * main.tsx
 *
 * React entrypoint: bootstraps ThemeProvider and renders the App.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import theme from './theme'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AppStateProvider, makeInitialAppState } from './state/appState'
import { defaultMinima } from './lib/hsfBuilder'
import { defaultMetasets } from './lib/metasets'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/*
        Wrap the app with a small state provider. Why: reduce prop drilling and
        keep shared state consistent across features without changing behavior.
      */}
      <AppStateProvider initial={makeInitialAppState({ minima: defaultMinima(), metasets: defaultMetasets() })}>
        <App />
      </AppStateProvider>
    </ThemeProvider>
  </React.StrictMode>
)
