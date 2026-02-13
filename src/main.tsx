/**
 * main.tsx
 *
 * React entrypoint: bootstraps ThemeProvider and renders the App.
 */
import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { makeTheme } from './theme'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AppStateProvider, makeInitialAppState } from './state/appState'
import { DisplayPreferencesProvider } from './state/preferencesState'
import { defaultSubstatTargets } from './lib/hsfBuilder'
import { defaultMetasets } from './lib/metasets'
import { warmupWasmRuleEngine } from './lib/wasm/wasmRuleEngine'
import './styles.css'
import { I18nProvider } from './lib/i18n'
import { useColorBlindPreference } from './state/colorBlindPreference'

function AppShell() {
  const [cbMode, setCbMode] = useColorBlindPreference()
  const theme = useMemo(() => makeTheme(cbMode), [cbMode])
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider>
        <AppStateProvider initial={makeInitialAppState({ substatTargets: defaultSubstatTargets(), metasets: defaultMetasets() })}>
          <DisplayPreferencesProvider>
            <App colorBlindMode={cbMode} setColorBlindMode={setCbMode} />
          </DisplayPreferencesProvider>
        </AppStateProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

const bootstrap = async (): Promise<void> => {
  // Main-thread generation/counting paths now rely on sync WASM helpers.
  await warmupWasmRuleEngine()
  // Render only after warmup so no JS duplicate fallback is needed.
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>
  )
}

// Surface startup failures loudly; this branch should never silently continue.
void bootstrap().catch((error) => {
  console.error('Failed to initialize WASM rule engine during app bootstrap.', error)
  throw error
})
