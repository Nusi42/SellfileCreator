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
import { APP_CSS_VAR, APP_SCHEME_ALPHAS } from './lib/themeCustomTokens'
import type { ColorBlindMode } from './lib/constants'

// Build per-scheme GlobalStyles rules for each custom alpha CSS variable.
// Applied once; all components read the variables with no JS mode check.
const schemeAlphaStyles = (() => {
  const dark  = APP_SCHEME_ALPHAS.dark
  const light = APP_SCHEME_ALPHAS.light
  const v     = APP_CSS_VAR
  return {
    '[data-mui-color-scheme="dark"]': {
      [v.hoverBgAlpha]:           dark.hoverBgAlpha,
      [v.selectedHoverBgAlpha]:   dark.selectedHoverBgAlpha,
      [v.multiEditBorderAlpha]:   dark.multiEditBorderAlpha,
      [v.multiEditBgAlpha]:       dark.multiEditBgAlpha,
      [v.multiEditTextAlpha]:     dark.multiEditTextAlpha,
      [v.dangerTintAlpha]:        dark.dangerTintAlpha,
      [v.successBorderAlpha]:     dark.successBorderAlpha,
      [v.successBgAlpha]:         dark.successBgAlpha,
      [v.successHoverBgAlpha]:    dark.successHoverBgAlpha,
      [v.successActiveBgAlpha]:   dark.successActiveBgAlpha,
      [v.neutralBorderAlpha]:     dark.neutralBorderAlpha,
      [v.weakBorderAlpha]:        dark.weakBorderAlpha,
      [v.paperOverlayAlpha]:      dark.paperOverlayAlpha,
      [v.keepOverrideHoverAlpha]: dark.keepOverrideHoverAlpha,
      [v.matchBorderDimAlpha]:    dark.matchBorderDimAlpha,
      [v.matchSurfaceAlpha]:      dark.matchSurfaceAlpha,
      [v.matchHoverAlpha]:        dark.matchHoverAlpha,
      [v.matchSurfaceDimAlpha]:   dark.matchSurfaceDimAlpha,
      [v.matchHoverDimAlpha]:     dark.matchHoverDimAlpha,
      [v.sourceChipSurfaceAlpha]: dark.sourceChipSurfaceAlpha,
      [v.sourceChipHoverAlpha]:   dark.sourceChipHoverAlpha,
      [v.cardOutcomeTintAlpha]:   dark.cardOutcomeTintAlpha,
      [v.cardStatsDimAlpha]:      dark.cardStatsDimAlpha,
      [v.substatFallbackAlpha]:   dark.substatFallbackAlpha,
    },
    '[data-mui-color-scheme="light"]': {
      [v.hoverBgAlpha]:           light.hoverBgAlpha,
      [v.selectedHoverBgAlpha]:   light.selectedHoverBgAlpha,
      [v.multiEditBorderAlpha]:   light.multiEditBorderAlpha,
      [v.multiEditBgAlpha]:       light.multiEditBgAlpha,
      [v.multiEditTextAlpha]:     light.multiEditTextAlpha,
      [v.dangerTintAlpha]:        light.dangerTintAlpha,
      [v.successBorderAlpha]:     light.successBorderAlpha,
      [v.successBgAlpha]:         light.successBgAlpha,
      [v.successHoverBgAlpha]:    light.successHoverBgAlpha,
      [v.successActiveBgAlpha]:   light.successActiveBgAlpha,
      [v.neutralBorderAlpha]:     light.neutralBorderAlpha,
      [v.weakBorderAlpha]:        light.weakBorderAlpha,
      [v.paperOverlayAlpha]:      light.paperOverlayAlpha,
      [v.keepOverrideHoverAlpha]: light.keepOverrideHoverAlpha,
      [v.matchBorderDimAlpha]:    light.matchBorderDimAlpha,
      [v.matchSurfaceAlpha]:      light.matchSurfaceAlpha,
      [v.matchHoverAlpha]:        light.matchHoverAlpha,
      [v.matchSurfaceDimAlpha]:   light.matchSurfaceDimAlpha,
      [v.matchHoverDimAlpha]:     light.matchHoverDimAlpha,
      [v.sourceChipSurfaceAlpha]: light.sourceChipSurfaceAlpha,
      [v.sourceChipHoverAlpha]:   light.sourceChipHoverAlpha,
      [v.cardOutcomeTintAlpha]:   light.cardOutcomeTintAlpha,
      [v.cardStatsDimAlpha]:      light.cardStatsDimAlpha,
      [v.substatFallbackAlpha]:   light.substatFallbackAlpha,
    },
  }
})()

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
      <GlobalStyles styles={schemeAlphaStyles} />
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
