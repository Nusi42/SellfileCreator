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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
)
