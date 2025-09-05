// Build artifact set descriptions from saved AyumiLove HTML.
// Extracts set name, pieces, and a concise first-sentence summary.

import fs from 'node:fs/promises'
import path from 'node:path'

const HTML_PATH = path.join('setguides', 'Artifact and Accessory Guide _ Raid Shadow Legends - AyumiLove.html')
const TYPES_TS = path.join('src', 'lib', 'types.ts')
const OUT_TS = path.join('src', 'lib', 'setDescriptions.ts')

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(title) {
  // Examples: "Life Set (2-Pieces)" -> "Life"; "Regeneration (4-Pieces)" -> "Regeneration";
  // "Curing set (4-Pieces)" -> "Curing".
  const m = title.match(/^(.*?)(?:\s+(set|accessory))?\s*\(/i)
  let base = m ? m[1] : title
  base = base.replace(/\s+(set|accessory)$/i, '')
  return base.trim()
}

function parsePieces(title) {
  const m = title.match(/\(([^)]+)\)/)
  if (!m) return ''
  const raw = m[1].toLowerCase()
  if (raw.includes('2-piece')) return 2
  if (raw.includes('4-piece')) return 4
  const rng = raw.match(/(\d+\s*[-–]\s*\d+)/)
  if (rng) return rng[1].replace(/\s+/g, '').replace('-', '–')
  const n = raw.match(/(\d+)\s*pieces?/)
  if (n) return Number(n[1])
  return raw
}

async function listExpectedSetNames() {
  const src = await fs.readFile(TYPES_TS, 'utf8')
  const blockMatch = src.match(/export const artifactSetNames:[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  if (!blockMatch) return []
  const block = blockMatch[1]
  const names = []
  const re = /:\s*'([^']+)'\s*,?/g
  let m
  while ((m = re.exec(block))) names.push(m[1])
  return names
}

async function main() {
  const html = await fs.readFile(HTML_PATH, 'utf8')
  const ACCESSORY_NAMES = new Set(['Refresh','Cleansing','Bloodshield','Reaction','Revenge'])
  // Split on <h3 ...> blocks as set sections.
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi
  const positions = []
  let m
  while ((m = h3Re.exec(html))) {
    positions.push({ index: m.index, endIndex: m.index + m[0].length, titleHtml: m[1] })
  }
  const sections = []
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]
    const end = positions[i + 1]?.index ?? html.length
    const bodyHtml = html.slice(start.endIndex, end)
    const titleText = stripTags(start.titleHtml)
    const name = normalizeName(titleText)
    let pieces = parsePieces(titleText)
    // Prefer the first paragraph after the heading for a concise summary.
    const pMatch = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const para = pMatch ? stripTags(pMatch[1]) : stripTags(bodyHtml)
    // Prefer the first sentence before any 'Obtain from:' section.
    const obtainIdx = para.toLowerCase().indexOf('obtain from:')
    const span = obtainIdx > 0 ? para.slice(0, obtainIdx) : para
    let firstSentence = (span.split(/\.(\s|$)/)[0] || '').trim()
    // Normalize summary to focus on effects, not meta phrasing.
    // Drop leading "<Name> Set/Accessory" and helper verbs like provides/grants/enables/applies/is/serves/offers.
    const leadRe = new RegExp(`^(?:the\\s+)?${name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}\\s+(?:set|accessory)\\s+`, 'i')
    firstSentence = firstSentence.replace(leadRe, '')
    firstSentence = firstSentence.replace(/^(?:this set\s+)?(provides|grants|enables|applies|is|serves|offers)\s+/i, '')
    // Light paraphrase for clarity
    firstSentence = firstSentence.replace(/applies a /ig, 'gain ')
    firstSentence = firstSentence.replace(/applies /ig, 'gain ')
    firstSentence = firstSentence.replace(/\benables to\b/ig, '')
    firstSentence = firstSentence.replace(/\benables to\s+/ig, '')
    firstSentence = firstSentence.replace(/^\s*a\s+champion\s+to\s+have\s+/i, '')
    firstSentence = firstSentence.replace(/the champion /ig, '')
    firstSentence = firstSentence.replace(/the wearer /ig, '')
    firstSentence = firstSentence.replace(/the target /ig, 'target ')
    // Spell out duration and round start
    firstSentence = firstSentence.replace(/ for (\d+) turns?/ig, (_, n) => ` for ${Number(n)} ${Number(n)===1?'turn':'turns'}`)
    firstSentence = firstSentence.replace(/ at the start of (each )?round/ig, ' at start of round')
    firstSentence = firstSentence.replace(/ when attacked by an enemy champion/ig, ' when hit (PvP)')
    firstSentence = firstSentence.replace(/ when attacked/ig, ' when hit')
    firstSentence = firstSentence.replace(/ by the wearer/ig, '')
    // Prefer separate lines for multiple effects instead of "and"; drop leading article before numeric/chance.
    firstSentence = firstSentence
      .replace(/\s+and\s+(?=[+\-[])/ig, '\n')
      .replace(/\s+and\s+(?=(ignores|enables|gain|applies|grants|places|increases|decreases|reduces|chance|counterattack|revived|start|team dmg|target)\b)/ig, '\n')
      .replace(/\s+and\s+(?=(HP|ATK|DEF|SPD|RES|ACC|C\.RATE|C\.DMG)\b)/ig, '\n')
      .replace(/^\s*a\s+(?=(\n|\d+%|chance\b))/i, '')
      .replace(/^\s*it\s+/i, '')
      .replace(/\bgrants a\s+/ig, '')
      .replace(/\bally champions\b/ig, 'allies')
      .replace(/(^|\n)enables to\s+/igm, '$1')
      .replace(/(^|\n)\s*it\s+/igm, '$1')
      .replace(/(^|\n)grants a\s+/igm, '$1')
    // Remove fluff like "a double purpose:" and "is a ... collection ..."
    firstSentence = firstSentence
      .replace(/\b[aA]\s+double\s+purpose:\s*/i, '')
      .replace(/\bis a [^,.;]+,\s*/i, '')
      .replace(/\ba [^,.;]*? (set|collection) [^,.;]*,\s*/i, '')
    // Extract per-piece bonuses for variable sets (1–9) when available.
    let byPieces = undefined
    const markerIdx = bodyHtml.toLowerCase().indexOf('set bonuses by pieces equipped')
    if (markerIdx >= 0) {
      const after = bodyHtml.slice(markerIdx)
      const lineRe = /(\d+)\s*pcs:\s*([\s\S]*?)(?:<br|<\/p>)/gi
      const map = {}
      let lm
      while ((lm = lineRe.exec(after))) {
        const n = Number(lm[1])
        let t = stripTags(lm[2])
        // Compact/paraphrase common phrases to avoid verbatim copy.
        t = t.replace(/Starts? the Round with/ig, 'starts with')
             .replace(/Stars the Round with/ig, 'starts with')
             .replace(/Places? a /ig, 'gain ')
             .replace(/at the start of (each )?round/ig, 'at start of round')
             .replace(/Revived allies gain/ig, 'revived: +')
             .replace(/Allies deal/ig, 'team dmg')
             .replace(/ of the wearer/ig, '')
             .replace(/ on the wearer/ig, '')
             .replace(/ when an ally is killed by an enemy;? occurs once per round/ig, '(on ally death, once/round)')
             .replace(/ when an ally is killed by an enemy/ig, '(on ally death)')
             .replace(/ for (\d+) turns?/ig, (_, n) => ` for ${Number(n)} ${Number(n)===1?'turn':'turns'}`)
             .replace(/\(start\)/ig, 'at start of round')
             .replace(/^\s*a\s+(?=(\d+%|chance\b))/i, '')
             .replace(/ more damage per debuff inflicted by the wearer/ig, ' per debuff (wearer)')
             .replace(/\s+/g, ' ')
             .trim()
        map[n] = t
      }
      if (Object.keys(map).length > 0) byPieces = map
    }

    if (name && firstSentence) {
      // Final cleanup of leading filler
      firstSentence = firstSentence.replace(/^\s*it\s+/i, '')
      // Accessory sets: treat as 1-piece effects that stack across Ring/Amulet/Banner.
      if (ACCESSORY_NAMES.has(name)) {
        pieces = 1
        if (!/stack/i.test(firstSentence)) {
          firstSentence = firstSentence.replace(/\.?$/, ' (stacks with multiple pieces)')
        }
      }
      sections.push({ name, pieces, text: firstSentence, byPieces })
    }
  }

  // Build map limited to known canonical set names
  const expected = new Set(await listExpectedSetNames())
  const map = new Map()
  for (const s of sections) {
    if (expected.has(s.name)) {
      map.set(s.name, s)
    }
  }

  const lines = []
  lines.push('// Descriptions for artifact sets used to provide tooltips in selects/menus.')
  lines.push('// Source: parsed from saved guide HTML in setguides/. Text summarizes current effects.')
  lines.push('')
  lines.push('export type ArtifactSetDescription = { pieces: number | string; text: string; byPieces?: Record<number, string> }')
  lines.push('')
  lines.push('export const artifactSetDescriptions: Record<string, ArtifactSetDescription> = {')
  for (const [k, v] of Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]))) {
    const piecesVal = typeof v.pieces === 'number' ? String(v.pieces) : JSON.stringify(String(v.pieces))
    const byp = v.byPieces ? '{ ' + Object.entries(v.byPieces).map(([n,t]) => `${n}: ${JSON.stringify(t)}`).join(', ') + ' }' : 'undefined'
    lines.push(`  ${JSON.stringify(k)}: { pieces: ${piecesVal}, text: ${JSON.stringify(v.text)}${v.byPieces ? `, byPieces: ${byp}` : ''} },`)
  }
  lines.push('}')
  lines.push('')
  lines.push('export function tooltipForSet(name: string): string | undefined {')
  lines.push('  const d = artifactSetDescriptions[name]')
  lines.push('  if (!d) return undefined')
  lines.push("  const pfx = typeof d.pieces === 'number' ? `${d.pieces}-piece` : String(d.pieces)")
  lines.push('  const main = `${pfx}: ${d.text}`')
  lines.push('  if (d.byPieces) {')
  lines.push('    const parts = Object.keys(d.byPieces).map(n => `${n}: ${d.byPieces![Number(n)]}`)')
  lines.push('    return `${main} | ${parts.join("; ")}`')
  lines.push('  }')
  lines.push('  return main')
  lines.push('}')

  await fs.writeFile(OUT_TS, lines.join('\n'))
  console.log(`Wrote ${map.size} set descriptions to ${OUT_TS}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
