import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveRecipeOverridesTags, collectRecipeOverridesDiagnostics } from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, collectSafeguardOverridesDiagnostics } from '../../src/lib/noteSafeguardOverrides.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// A behavioural snapshot ("golden digest") of the FULL parse+resolve output for the
// shipped lategame.sfc note. It is the tripwire for any refactor of the override
// parser/tokenizer: if a change alters how a marker parses — option group types,
// defaults, which fields each selector block touches, the constraint cascade
// (set/unset/excl/needs), slider params, or the cross-question references — the
// digest changes and this test fails with a readable diff.
//
// What it deliberately does NOT pin: exact selector values / operation operands
// (covered by note-recipe-overrides.test.ts and lategame-preset-overrides.test.ts),
// and the volatile hashed option ids (normalised to stable token / #position refs).
//
// Updating the golden: only when an intentional behaviour change lands. Re-derive by
// temporarily logging `buildDigest(...)` and paste the new EXPECTED block verbatim.

// ── Deterministic digest ──────────────────────────────────────────────────────

type AnyOption = {
  id: string
  token: string
  positionalIndex: number
  groupType: string
  isDefault: boolean
  blocks?: { operations?: { kind: string }[] }[]
  elseBlocks?: { operations?: { kind: string }[] }[]
  fallbackBlocks?: { operations?: { kind: string }[] }[]
  safeguardBlocks?: { operations?: { kind: string }[] }[]
  recipeBlocks?: { operations?: { kind: string }[] }[]
  setOptionIds?: string[]
  unsetOptionIds?: string[]
  excludedOptionIds?: string[]
  requiresOptionIds?: string[]
  setValueDirectives?: { token: string; value: number }[]
  sliderMin?: number
  sliderMax?: number
  sliderDefault?: number
  sliderMarks?: { value: number; label: string; subtext?: string }[]
  sliderToggle?: { label: string; side: string; default: string }
  sliderUnit?: string
}
type AnyQuestion = { prompt: string; layoutColumns: number; isSpacer?: boolean; options: AnyOption[] }

// Stable reference for an option: its explicit token, else `#<1-based position>`.
const refOf = (o: AnyOption): string => (o.token && !/^\d+$/.test(o.token) ? o.token : `#${o.positionalIndex}`)

// Sorted, de-duplicated set of operation-kind names across a block list (the
// behavioural fingerprint of "what this block changes").
const blockFields = (blocks: AnyOption['blocks']): string => {
  const f = new Set<string>()
  for (const b of blocks ?? []) for (const op of b.operations ?? []) f.add(op.kind)
  return [...f].sort().join('+') || '-'
}

function buildDigest(label: string, questions: AnyQuestion[]): string {
  // Map every hashed option id to its stable ref so cross-question constraints are readable.
  const idToRef = new Map<string, string>()
  for (const q of questions) for (const o of q.options) idToRef.set(o.id, refOf(o))
  const refList = (ids?: string[]): string => (ids ?? []).map((i) => idToRef.get(i) ?? i).join(',')

  const lines: string[] = [`== ${label} ==`]
  for (const q of questions) {
    const prompt = (q.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    lines.push(`Q "${prompt}" cols=${q.layoutColumns}${q.isSpacer ? ' SPACER' : ''}`)
    for (const o of q.options) {
      const parts: string[] = [`  ${refOf(o)}`, o.groupType[0]!]
      if (o.isDefault) parts.push('*')
      const blk = blockFields(o.blocks); if (blk !== '-') parts.push(`blk:${blk}`)
      // recipe options expose elseBlocks; safeguard options expose fallbackBlocks.
      const els = blockFields(o.elseBlocks ?? o.fallbackBlocks); if (els !== '-') parts.push(`else:${els}`)
      // cross-domain: recipe→safeguard (safeguardBlocks) or safeguard→recipe (recipeBlocks).
      const cross = blockFields(o.safeguardBlocks ?? o.recipeBlocks); if (cross !== '-') parts.push(`x:${cross}`)
      if (o.setOptionIds?.length) parts.push(`+[${refList(o.setOptionIds)}]`)
      if (o.unsetOptionIds?.length) parts.push(`-[${refList(o.unsetOptionIds)}]`)
      if (o.excludedOptionIds?.length) parts.push(`![${refList(o.excludedOptionIds)}]`)
      if (o.requiresOptionIds?.length) parts.push(`needs[${refList(o.requiresOptionIds)}]`)
      // setval: cross-domain slider value forces (token=value), e.g. Endgame+ → impr_art=50.
      if (o.setValueDirectives?.length) parts.push(`setval[${o.setValueDirectives.map((d) => `${d.token}=${d.value}`).join(',')}]`)
      if (o.groupType === 'slider') {
        parts.push(`sld:${o.sliderMin}-${o.sliderMax}/${o.sliderDefault}`)
        if (o.sliderToggle) parts.push(`tgl:${o.sliderToggle.side}/${o.sliderToggle.default}`)
        if (o.sliderMarks?.length) parts.push(`marks:${o.sliderMarks.length}`)
        if (o.sliderUnit) parts.push(`unit:${o.sliderUnit}`)
      }
      lines.push(parts.join(' '))
    }
  }
  return lines.join('\n')
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

// ── Golden ────────────────────────────────────────────────────────────────────
// Captured from the current parser. Regenerate ONLY for an intentional behaviour change.
const EXPECTED = `== RECIPE ==
Q "Which account level do you think you hav" cols=4
  midgame m +[keep_general,keep_limited,keep_acc,keep_spd,keep_safeguards,rolls_22,acc_rolls_22,marius_open,fwh_no,la_no,eg_no,acc_early_no,ore5_epic,ore5_legendary,ore5_mythical,ore5_lvlcap,ore5_nbr,ore6_epic,ore6_legendary,ore6_mythical,ore6_lvlcap,ore6_nbr,ore6as_legendary,ore6as_mythical,ore6as_lvlcap,ore6as_nbr] -[ore6as_epic] ![lategame,endgame,endgameplus] setval[min_spdbanner_pieces=8,min_spd_pieces=8,min_debuffer_pieces=16,min_dmgsurv_pieces=16,impr_art=25,impr_acc=50]
  lategame m * +[keep_limited,keep_acc,keep_spd,keep_safeguards,rolls_33,acc_rolls_32,marius_finished,fwh_no,la_no,eg_no,acc_early_no,ore5_epic,ore5_legendary,ore5_mythical,ore5_lvlcap,ore5_nbr,ore6_epic,ore6_legendary,ore6_mythical,ore6_nbr,ore6as_legendary,ore6as_mythical,ore6as_nbr] -[keep_general,ore6_lvlcap,ore6as_epic,ore6as_lvlcap] ![midgame,endgame,endgameplus] setval[min_spdbanner_pieces=12,min_spd_pieces=12,min_debuffer_pieces=24,min_dmgsurv_pieces=24,impr_art=33,impr_acc=50]
  endgame m +[keep_limited,keep_acc,keep_spd,rolls_43,acc_rolls_33,marius_finished,fwh_yes16,la_yes16,eg_early,acc_early_yesspider,ore5_epic,ore5_legendary,ore5_mythical,ore5_lvlcap,ore6_epic,ore6_legendary,ore6_mythical,ore6_lvlcap,ore6_nbr,ore6as_mythical,ore6as_lvlcap,ore6as_nbr] -[keep_general,keep_safeguards,ore5_nbr,ore6as_epic,ore6as_legendary] ![midgame,lategame,endgameplus] setval[min_spdbanner_pieces=16,min_spd_pieces=16,min_debuffer_pieces=32,min_dmgsurv_pieces=32,impr_art=50,impr_acc=50]
  endgameplus m +[marius_finished,rolls_43,acc_rolls_43,fwh_yes,la_yes,eg_yes,acc_early_yes] -[keep_safeguards,keep_general,keep_limited,keep_acc,keep_spd,ore5_epic,ore5_legendary,ore5_mythical,ore5_lvlcap,ore5_nbr,ore6_epic,ore6_legendary,ore6_mythical,ore6_lvlcap,ore6_nbr,ore6as_epic,ore6as_legendary,ore6as_mythical,ore6as_lvlcap,ore6as_nbr] ![midgame,lategame,endgame] setval[min_spdbanner_pieces=4,min_spd_pieces=4,min_debuffer_pieces=4,min_dmgsurv_pieces=4,impr_art=60,impr_acc=60]
Q "" cols=1 SPACER
Q "How strict should keeping \`5★\` gear be? " cols=1
  keep_general m blk:exportMode+minimaAnyRank+rank +[keep_limited,keep_acc,keep_spd,keep_safeguards]
  keep_limited m else:rank
  keep_acc m else:rank
  keep_spd m else:rank
  keep_safeguards m
Q "Are you done with all progressive missio" cols=1
  marius_open s blk:exportMode
  marius_finished s blk:exportMode
Q "How many good substats does an artifact " cols=1
  rolls_22 s blk:autoLate+lockedMinRequiredRolls+minRequiredRolls+minSubstats
  rolls_32 s blk:autoLate+lockedMinRequiredRolls+minRequiredRolls+minSubstats
  rolls_33 s blk:lockedMinRequiredRolls+minRequiredRolls
  rolls_43 s
Q "How many good substats does an accessory" cols=1
  acc_rolls_22 s blk:autoLate+lockedMinRequiredRolls+minRequiredRolls+minSubstats+substatMinAll
  acc_rolls_32 s
  acc_rolls_33 s blk:lockedMinRequiredRolls+minRequiredRolls+substatMinAll+substatMinVariant
  acc_rolls_43 s blk:lockedMinRequiredRolls+minRequiredRolls+substatMinAll
Q "Did you finish Faction Wars in Hard mode" cols=1
  fwh_no s blk:exportMode+level
  fwh_yes16 s blk:artifactSets+exportMode+level x:ranks+rarities
  fwh_yes s blk:exportMode x:activation
Q "Do you play and win Live Arena and Siege" cols=1
  la_no s blk:exportMode+level
  la_yes16 s blk:exportMode+level
  la_yes s blk:exportMode
Q "Can you consistently clear all hard dung" cols=1
  eg_no s blk:exportMode+level
  eg_early s blk:keep
  eg_yes16 s blk:exportMode+level
  eg_yes s blk:exportMode
Q "Do you generally have too many accessori" cols=1
  acc_early_no s
  acc_early_yesspider s blk:keep+rollTarget
  acc_early_yes s blk:keep+rollTarget
  acc_early_veryyes s blk:exportMode+keep+rollTarget
Q "Keep weak \`5★\` pieces to rework with \`Ch" cols=0
  ore5_epic m blk:exportMode+keep else:exportMode
  ore5_legendary m blk:exportMode+keep else:exportMode
  ore5_mythical m blk:exportMode+keep else:exportMode
  ore5_lvlcap m blk:level needs[ore5_epic,ore5_legendary,ore5_mythical]
  ore5_nbr m blk:artifactTypes needs[ore5_epic,ore5_legendary,ore5_mythical]
Q "Keep weak \`6★\` pieces to rework with \`Ch" cols=0
  ore6_epic m blk:exportMode+keep else:exportMode
  ore6_legendary m blk:exportMode+keep else:exportMode
  ore6_mythical m blk:exportMode+keep else:exportMode
  ore6_lvlcap m blk:level needs[ore6_epic,ore6_legendary,ore6_mythical]
  ore6_nbr m blk:artifactTypes needs[ore6_epic,ore6_legendary,ore6_mythical]
Q "Keep weak \`6★\` pieces from any gear set " cols=0
  ore6as_epic m blk:substatMinAll +[ore6as_legendary,ore6as_mythical]
  ore6as_legendary m else:substatMinAll +[ore6as_mythical]
  ore6as_mythical m blk:exportMode+level else:exportMode
  ore6as_lvlcap m blk:level needs[ore6as_epic,ore6as_legendary,ore6as_mythical]
  ore6as_nbr m blk:artifactTypes+exportMode needs[ore6as_epic,ore6as_legendary,ore6as_mythical]
Q "Actually, just **sell** all weak \`Chaos " cols=1
  ore_chaos_master_keep s * needs[ore5_epic,ore5_legendary,ore5_mythical,ore6_epic,ore6_legendary,ore6_mythical,ore6as_epic,ore6as_legendary,ore6as_mythical]
  ore_chaos_master_sell s blk:keepAction
== SAFEGUARD ==
Q "How many of the best SPD banners **per f" cols=2
  #1 s blk:activation
  #2 s blk:activation
  #3 s * blk:activation
  #4 s blk:activation
  min_spdbanner_pieces s blk:count sld:1-64/16 unit: pieces
Q "How many speed-set pieces **per slot** s" cols=2
  #1 s blk:activation
  #2 s blk:activation
  #3 s * blk:activation
  #4 s blk:activation
  min_spd_pieces s blk:count sld:1-64/16 unit: pieces
Q "How many debuffer pieces **per slot** sh" cols=2
  #1 s blk:activation
  #2 s blk:activation
  #3 s * blk:activation
  #4 s blk:activation
  min_debuffer_pieces s blk:count sld:1-64/32 unit: pieces
Q "How many damage or survivability pieces " cols=2
  #1 s blk:activation
  #2 s blk:activation
  #3 s * blk:activation
  #4 s blk:activation
  min_dmgsurv_pieces s blk:count sld:1-64/32 unit: pieces
Q "How many damage/survivability/debuffer p" cols=2
  #1 s blk:activation
  #2 s blk:activation
  #3 s * blk:activation
  #4 s blk:activation
  #5 s blk:count sld:1-64/8 unit: pieces
Q "" cols=2 SPACER
Q "Do you want to protect **artifacts** (no" cols=2
  impr_art s blk:improvementChance else:improvementChance sld:0-90/25 tgl:left/on marks:4 unit:%
Q "Do you want to protect **accessories** (" cols=2
  impr_acc s blk:improvementChance else:improvementChance sld:0-90/25 tgl:left/on marks:4 unit:%`

test('lategame.sfc overrides parse to the golden behavioural digest', () => {
  const recipe = resolveRecipeOverridesTags(note)
  const safeguard = resolveNoteSafeguardOverridesTags(note)
  const actual = `${buildDigest('RECIPE', recipe.questions as unknown as AnyQuestion[])}\n${buildDigest('SAFEGUARD', safeguard.questions as unknown as AnyQuestion[])}`
  // assert.equal gives a line-level diff on mismatch, pinpointing the drift.
  assert.equal(actual, EXPECTED)
})

test('lategame.sfc overrides parse with zero syntax diagnostics', () => {
  // Recipe markers.
  let recipeDiags = 0
  for (const m of note.matchAll(/<!--\s*recipe-overrides[\s\S]*?-->/g)) {
    const ds: { from: number; to: number; message: string }[] = []
    collectRecipeOverridesDiagnostics(m[0], m.index ?? 0, ds)
    recipeDiags += ds.length
  }
  assert.equal(recipeDiags, 0, 'recipe-overrides markers must have no syntax diagnostics')
  // Safeguard markers.
  let sgDiags = 0
  for (const m of note.matchAll(/<!--\s*safeguard-overrides[\s\S]*?-->/g)) {
    const ds: { from: number; to: number; message: string }[] = []
    collectSafeguardOverridesDiagnostics(m[0], m.index ?? 0, ds)
    sgDiags += ds.length
  }
  assert.equal(sgDiags, 0, 'safeguard-overrides markers must have no syntax diagnostics')
})

test('every parsed option carries a usable source span (click-to-reveal contract)', () => {
  // The editor preview relies on sourceFrom/sourceTo to scroll to an option's DSL.
  const all = [
    ...resolveRecipeOverridesTags(note).questions,
    ...resolveNoteSafeguardOverridesTags(note).questions,
  ]
  for (const q of all) {
    if (q.isSpacer) continue
    for (const o of q.options as unknown as { sourceFrom?: number; sourceTo?: number; token: string }[]) {
      assert.ok(typeof o.sourceFrom === 'number' && typeof o.sourceTo === 'number' && o.sourceTo > o.sourceFrom,
        `option ${o.token || '(unnamed)'} must have a valid source span`)
      // The span must start at a quote — the option's opening label string.
      assert.ok(note.slice(o.sourceFrom).trimStart().startsWith('"'),
        `option ${o.token || '(unnamed)'} span must begin at its label string`)
    }
  }
})
