// Ambient declaration for Vite's `?raw` import suffix, which yields a module's text.
//
// The main build picks this up from `vite/client`, but the tests tsconfig uses
// `types: ["node"]` and has no `vite/client`, so the bundled-preset `?raw` imports in
// sfcPresetMatch.ts would otherwise fail to resolve there. This MUST stay a global
// (script) declaration file — no top-level import/export — or the wildcard
// `declare module` becomes module-scoped and stops matching ambiently.
declare module '*?raw' {
  const content: string
  export default content
}
