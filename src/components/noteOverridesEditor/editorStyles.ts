/**
 * editorStyles — shared sx snippets for the visual override-block editor.
 *
 * SSOT for styling reused across the editor's dialog + cards, so token-ish inputs
 * (option `id=`, question `id=`) look identical without duplicating the sx literal.
 */

// Monospace input styling for token-ish fields (id=, tokens) — one definition, imported everywhere.
export const MONO_INPUT_SX = { '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.8rem' } } as const
