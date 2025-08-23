// Parser for RSL Helper .hsf files
import type { HsfFile } from './hsfTypes'

export function parseHsfFile(text: string): HsfFile {
  // Strip UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, '')
  const parsed = JSON.parse(clean)
  if (!parsed || !Array.isArray(parsed.Rules)) {
    throw new Error("Invalid .hsf file: missing 'Rules' array")
  }
  return parsed as HsfFile
}
