/**
 * main.tsx
 *
 * React entrypoint: bootstraps ThemeProvider (CSS-variables mode) and renders App.
 *
 * AppShell creates the ThemeProvider. AppShellInner sits inside it so it can call
 * useColorScheme() — that hook requires being inside a CSS-variables ThemeProvider.
 *
 * Scheme switching is done via setMode() from useColorScheme() which only toggles the
 * data-mui-color-scheme DOM attribute — no React re-render, no emotion CSS regeneration.
 */
import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { makeTheme } from './theme'
import { CssBaseline, GlobalStyles, ThemeProvider } from '@mui/material'
import { AppStateProvider, makeInitialAppState } from './state/appState'
import { DisplayPreferencesProvider } from './state/preferencesState'
import { defaultSubstatTargets } from './lib/hsfBuilder'
import { defaultMetasets } from './lib/metasets'
import { warmupWasmRuleEngine } from './lib/wasm/wasmRuleEngine'
import './styles.css'
import { I18nProvider } from './lib/i18n'
import { useColorBlindPreference } from './state/colorBlindPreference'
import { useThemeCustomization } from './state/themeCustomization'
import { SCHEME_ALPHA_STYLES } from './lib/themeCustomTokens'
import type { ColorBlindMode } from './lib/constants'


// Renders the App tree; lives inside ThemeProvider so useColorScheme() works here.
// Components that need the current scheme call useColorScheme() directly.
function AppShellInner({ cbMode, setCbMode }: { cbMode: ColorBlindMode; setCbMode: (m: ColorBlindMode) => void }) {
  return <App colorBlindMode={cbMode} setColorBlindMode={setCbMode} />
}

function AppShell() {
  const [cbMode, setCbMode]    = useColorBlindPreference()
  const [themeCustom]          = useThemeCustomization()

  // Rebuild theme only when color-blind mode or manual palette customization changes.
  // Scheme switching (dark ↔ light) no longer re-creates the theme — it only toggles
  // the data-mui-color-scheme attribute via useColorScheme().setColorScheme().
  const theme = useMemo(
    () => makeTheme(cbMode, themeCustom),
    [cbMode, themeCustom],
  )
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="dark"
      modeStorageKey="sellfileCreator.themeMode.v1"
      disableTransitionOnChange
      // noSsr: skip the isClient=false first render that would otherwise show the light scheme.
      // This is a CSR-only app (no SSR/hydration), so the safety guard is unnecessary.
      noSsr
    >
      <CssBaseline />
      {/* Inject per-scheme alpha CSS variables once; no JS re-evaluation on scheme switch. */}
      <GlobalStyles styles={SCHEME_ALPHA_STYLES} />
      <I18nProvider>
        <AppStateProvider initial={makeInitialAppState({ substatTargets: defaultSubstatTargets(), metasets: defaultMetasets() })}>
          <DisplayPreferencesProvider>
            <AppShellInner cbMode={cbMode} setCbMode={setCbMode} />
          </DisplayPreferencesProvider>
        </AppStateProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

const bootstrap = async (): Promise<void> => {
  await warmupWasmRuleEngine()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppShell />
    </React.StrictMode>
  )
}

void bootstrap().catch((error) => {
  console.error('Failed to initialize WASM rule engine during app bootstrap.', error)
  throw error
})
