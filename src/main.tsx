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
// Side-effect import FIRST (before App and any store module): wires the rememberable-view
// persistence predicate into the store factory (setRememberableViewPersistGetter) before any
// rememberable-view store initializes. ES imports run in source order, so this MUST precede
// `import App` — otherwise App's filter/sort/mode stores would seed with the default
// predicate (persist=off) and boot ephemeral regardless of the "Remember last view" toggle.
import './state/rememberableViewPreference'
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
import { useRslhEnabled } from './state/themeModePreference'
import { SCHEME_ALPHA_STYLES, buildCustomValueVars } from './lib/themeCustomTokens'
import { RSLH_PRESET, mergeCustomization } from './lib/rslhPreset'
import { COLOR_SCHEME_STORAGE_KEY, THEME_MODE_KEY } from './lib/constants'
import type { ColorBlindMode } from './lib/constants'


// Renders the App tree; lives inside ThemeProvider so useColorScheme() works here.
// Components that need the current scheme call useColorScheme() directly.
function AppShellInner({ cbMode, setCbMode }: { cbMode: ColorBlindMode; setCbMode: (m: ColorBlindMode) => void }) {
  return <App colorBlindMode={cbMode} setColorBlindMode={setCbMode} />
}

function AppShell() {
  const [cbMode, setCbMode]    = useColorBlindPreference()
  const [themeCustom]          = useThemeCustomization()
  const rslhEnabled            = useRslhEnabled()

  // RSLH = the dark theme with the RSLH value-set merged into customization (user edits layer
  // on top, per-field). It does NOT touch MUI's mode below — MUI stays dark while the flag is on.
  const effectiveCustom = useMemo(
    () => (rslhEnabled ? mergeCustomization(RSLH_PRESET, themeCustom) : themeCustom),
    [rslhEnabled, themeCustom],
  )

  // Rebuild theme only when color-blind mode or the effective customization changes.
  // Scheme switching (dark ↔ light) does not re-create the theme — MUI toggles the
  // data-mui-color-scheme attribute via useColorScheme().setColorScheme().
  const theme = useMemo(
    () => makeTheme(cbMode, effectiveCustom),
    [cbMode, effectiveCustom],
  )
  // Scheme-agnostic custom-value CSS vars (scrollbar thumb / code font), emitted at :root.
  const customValueStyles = useMemo(
    () => buildCustomValueVars({ scrollbarThumbColor: effectiveCustom.scrollbarThumbColor, codeFontFamily: effectiveCustom.codeFontFamily }),
    [effectiveCustom.scrollbarThumbColor, effectiveCustom.codeFontFamily],
  )
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="dark"
      modeStorageKey={THEME_MODE_KEY}
      // Namespace MUI's resolved-scheme keys too (default would write `mui-color-scheme-*`).
      colorSchemeStorageKey={COLOR_SCHEME_STORAGE_KEY}
      disableTransitionOnChange
      // noSsr: skip the isClient=false first render that would otherwise show the light scheme.
      // This is a CSR-only app (no SSR/hydration), so the safety guard is unnecessary.
      noSsr
    >
      <CssBaseline />
      {/* Inject per-scheme alpha CSS variables once; no JS re-evaluation on scheme switch. */}
      <GlobalStyles styles={SCHEME_ALPHA_STYLES} />
      {/* Custom-value vars (scrollbar thumb / code font) — only present when the user sets them. */}
      <GlobalStyles styles={customValueStyles} />
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
  // Dev-only: when ?capturePackets is active, tee console output to the capture session's
  // console.log so a captured folder bundles its diagnostics with its frames. No-op when
  // capture is off; the whole call tree-shakes out of release/test via import.meta.env.DEV.
  if (import.meta.env.DEV) {
    const { installConsoleLogCapture } = await import('./lib/packetCapture')
    installConsoleLogCapture()
  }
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
