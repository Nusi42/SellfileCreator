import { expect, test, type Locator, type Page } from '@playwright/test'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { prepareApp } from './app-init'

const BASE_HSFC_PATH = path.resolve(process.cwd(), 'examples', 'NusiWithKeepUniques.hsfc')
const BASE_HSF_PATH = path.resolve(process.cwd(), 'examples', 'example.hsf')
const GEAR_DB_PATH = path.resolve(process.cwd(), 'examples', '251112_042110.db')
const BUILDER_NAME_SELECTOR = 'input[data-tour-id="builder.name"]'
const RULE_CHIP_SELECTOR = '[data-testid="builder-rule-count-chip"] .MuiChip-label'

type Measurement = {
  fromIdx: number
  toIdx: number
  fromName: string
  toName: string
  builderReadyMs: number
  ruleChipSettledMs: number
  longTasks: { duration: number; scriptUrl: string | null; name: string }[]
}

type KeepUniqueEntry = {
  id?: string
  requiredCount?: number
  enabled?: boolean
  tuple?: {
    slots?: number[]
    sets?: number[]
    metaSetIds?: string[]
    ranks?: number[]
    rarities?: number[]
    mainStats?: number[]
    mainStat?: number
    factions?: number[]
  }
}

test.describe('builder config switching performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurement currently tracks Chromium only.')

  test('measures config switch latency for heavy datasets', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await prepareApp(page)
    await page.addInitScript(() => {
      const globalScope = window as unknown as { __builderLongTasks?: Array<{ name: string; startTime: number; duration: number; scriptUrl: string | null }> }
      globalScope.__builderLongTasks = []
      if (typeof PerformanceObserver === 'function') {
        try {
          const observer = new PerformanceObserver((list) => {
            const target = globalScope.__builderLongTasks!
            for (const entry of list.getEntries()) {
              const attribution = (entry as PerformanceEntry & { attribution?: PerformanceEntry[] }).attribution
              const scriptUrl = attribution && attribution.length > 0
                ? ((attribution[0] as unknown as { scriptUrl?: string | null }).scriptUrl ?? null)
                : null
              target.push({
                name: entry.name,
                startTime: entry.startTime,
                duration: entry.duration,
                scriptUrl,
              })
            }
          })
          observer.observe({ entryTypes: ['longtask'] })
        } catch {
          /* ignore observer failures */
        }
      }
    })

    const { hsfcPath, configNames } = await prepareHeavyHsfcFixture(testInfo.outputDir)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-tour-id="preview.paper"]').waitFor({ timeout: 120_000 })

    await dismissAutosaveDialog(page)

    await loadHsfcFile(page, hsfcPath)
    await dismissNoteDialog(page)
    await ensurePreviewRows(page)

    await loadSellfileAsset(page, BASE_HSF_PATH)
    await ensurePreviewRows(page)

    await loadSellfileAsset(page, GEAR_DB_PATH)
    await waitForTesterMode(page)
    await switchToRulesPreview(page)

    const builderInput = page.locator(BUILDER_NAME_SELECTOR)
    await builderInput.waitFor({ timeout: 60_000 })

    const chips = page.locator('[data-config-chip="true"]')
    await expect(chips.first()).toBeVisible()

    const measurementPairs = deriveMeasurementPairs(configNames, 4)
    if (measurementPairs.length < 2) {
      test.skip(true, 'Not enough named configs to measure switching latency.')
    }

    // Ensure the first config in the sequence is selected before collecting metrics.
    const initial = measurementPairs[0]!
    await selectConfigAndWait(page, chips, initial.fromIdx, initial.fromName)

    let longTaskCursor = 0
    const measurements: Measurement[] = []
    for (const pair of measurementPairs) {
      const result = await measureConfigSwitch(page, chips, pair.toIdx, pair.toName)
      const taskDelta = await collectLongTasks(page, longTaskCursor, result.startTime, result.endTime)
      longTaskCursor = taskDelta.nextCursor
      measurements.push({
        fromIdx: pair.fromIdx,
        toIdx: pair.toIdx,
        fromName: pair.fromName,
        toName: pair.toName,
        builderReadyMs: result.builderReadyMs,
        ruleChipSettledMs: result.ruleChipSettledMs,
        longTasks: taskDelta.entries,
      })
    }

    for (const entry of measurements) {
      const label = `${formatConfigLabel(entry.fromIdx, entry.fromName)} → ${formatConfigLabel(entry.toIdx, entry.toName)}`
      const summary = `${label} | builder ready=${entry.builderReadyMs.toFixed(1)} ms | rule chip settled=${entry.ruleChipSettledMs.toFixed(1)} ms`
      testInfo.annotations.push({ type: 'perf', description: summary })
      console.log(`[builder-config-switch] ${summary}`)
      if (entry.longTasks.length > 0) {
        for (const task of entry.longTasks) {
          const location = task.scriptUrl ? task.scriptUrl : task.name
          console.log(`  ↳ long task ${task.duration.toFixed(1)} ms @ ${location}`)
        }
      }
    }
  })
})

async function prepareHeavyHsfcFixture(outputDir: string): Promise<{ hsfcPath: string; configNames: string[] }> {
  await fs.mkdir(outputDir, { recursive: true })
  const raw = await fs.readFile(BASE_HSFC_PATH, 'utf8')
  const parsed = JSON.parse(raw) as {
    Configs?: Array<{ name?: string }>
    Metasets?: Array<{ id?: string; sets?: number[] }>
    KeepUniques?: Array<{
      id?: string
      tuple?: {
        metaSetIds?: string[]
      }
    }>
    KeepUniquesEnabled?: boolean
  }
  if (!Array.isArray(parsed.Configs)) {
    throw new Error('HSFC missing Configs array')
  }
  parsed.KeepUniquesEnabled = true
  const keepUniqueEntries: KeepUniqueEntry[] = Array.isArray(parsed.KeepUniques) ? [...parsed.KeepUniques] : []
  parsed.KeepUniques = keepUniqueEntries

  const metasetIds = Array.isArray(parsed.Metasets)
    ? parsed.Metasets.map((meta) => (typeof meta?.id === 'string' ? meta.id : null)).filter((id): id is string => Boolean(id))
    : []
  const existingMetaIds = new Set<string>()
  for (const entry of keepUniqueEntries) {
    const ids = entry?.tuple?.metaSetIds ?? []
    for (const metaId of ids) {
      if (typeof metaId === 'string') existingMetaIds.add(metaId)
    }
  }

  let seed = 0
  for (const metaId of metasetIds) {
    if (keepUniqueEntries.length >= 10) break
    if (existingMetaIds.has(metaId)) continue
    keepUniqueEntries.push({
      id: `ku_perf_meta_${seed}_${metaId}`,
      requiredCount: 1,
      enabled: true,
      tuple: {
        slots: [],
        sets: [],
        metaSetIds: [metaId],
        ranks: [],
        rarities: [],
        mainStats: [],
        mainStat: -1,
        factions: [],
      },
    })
    seed += 1
  }
  if (keepUniqueEntries.length < 10) {
    const setGroups = gatherSetGroups(parsed)
    for (const group of setGroups) {
      if (keepUniqueEntries.length >= 10) break
      keepUniqueEntries.push({
        id: `ku_perf_sets_${seed}_${keepUniqueEntries.length}`,
        requiredCount: 1,
        enabled: true,
        tuple: {
          slots: [7, 8, 9],
          sets: group,
          metaSetIds: [],
          ranks: [],
          rarities: [],
          mainStats: [],
          mainStat: -1,
          factions: [],
        },
      })
      seed += 1
    }
  }

  const hsfcPath = path.join(outputDir, 'heavy-keep-uniques.hsfc')
  await fs.writeFile(hsfcPath, JSON.stringify(parsed, null, 2), 'utf8')
  return {
    hsfcPath,
    configNames: parsed.Configs.map((cfg) => (typeof cfg?.name === 'string' ? cfg.name : '')),
  }
}

function gatherSetGroups(data: { Metasets?: Array<{ sets?: number[] }> }): number[][] {
  const setPool = new Set<number>()
  for (const meta of data.Metasets ?? []) {
    for (const setId of meta?.sets ?? []) {
      if (typeof setId === 'number' && Number.isFinite(setId)) {
        setPool.add(setId)
      }
    }
  }
  const setArray = [...setPool]
  if (setArray.length === 0) {
    return [[1000, 1001, 1002]]
  }
  const groups: number[][] = []
  for (let i = 0; i < setArray.length; i += 3) {
    const group = setArray.slice(i, i + 3)
    if (group.length > 0) groups.push(group)
  }
  return groups
}

async function dismissAutosaveDialog(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first()
  try {
    if (await dismiss.isVisible({ timeout: 1_000 })) {
      await dismiss.click()
    }
  } catch {
    /* dialog not shown */
  }
}

async function dismissNoteDialog(page: Page): Promise<void> {
  const noteDialog = page.getByRole('dialog', { name: 'Note' })
  try {
    await noteDialog.waitFor({ state: 'visible', timeout: 3_000 })
    const close = noteDialog.getByRole('button', { name: 'Close' }).first()
    await close.click()
  } catch {
    /* no note dialog */
  }
}

async function loadHsfcFile(page: Page, filePath: string): Promise<void> {
  const loadButton = page.getByRole('button', { name: /Load Configs/i })
  await loadButton.locator('input[type="file"]').setInputFiles(filePath)
}

async function loadSellfileAsset(page: Page, filePath: string): Promise<void> {
  const button = page.getByRole('button', { name: 'Load RSL Helper Sellfile' })
  await button.locator('input[type="file"]').setInputFiles(filePath)
}

async function ensurePreviewRows(page: Page): Promise<void> {
  const firstRow = page.locator('[data-cfg-idx]').first()
  await firstRow.waitFor({ timeout: 120_000 })
}

async function waitForTesterMode(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const chip = document.querySelector('[data-tour-id="preview.paper"] .MuiChip-label')
    if (!chip) return false
    const text = chip.textContent ?? ''
    return text.includes('items')
  }, undefined, { timeout: 120_000 })
}

async function switchToRulesPreview(page: Page): Promise<void> {
  const rulesButton = page.getByRole('button', { name: 'Sellfile preview' })
  try {
    await rulesButton.click({ timeout: 5_000 })
  } catch {
    /* already in rules mode */
  }
}

function deriveMeasurementPairs(configNames: string[], desired: number): Array<{ fromIdx: number; toIdx: number; fromName: string; toName: string }> {
  const named = configNames
    .map((name, idx) => ({ name: (name ?? '').trim(), idx }))
    .filter((entry) => entry.name.length > 0)
  const usable = named.slice(0, desired)
  const pairs: Array<{ fromIdx: number; toIdx: number; fromName: string; toName: string }> = []
  for (let i = 0; i < usable.length - 1; i += 1) {
    const current = usable[i]!
    const next = usable[i + 1]!
    pairs.push({ fromIdx: current.idx, toIdx: next.idx, fromName: current.name, toName: next.name })
  }
  if (usable.length >= 2) {
    const last = usable[usable.length - 1]!
    const first = usable[0]!
    pairs.push({ fromIdx: last.idx, toIdx: first.idx, fromName: last.name, toName: first.name })
  }
  return pairs
}

async function selectConfigAndWait(page: Page, chips: Locator, index: number, expectedName: string): Promise<void> {
  const targetChip = chips.nth(index)
  await targetChip.scrollIntoViewIfNeeded()
  await targetChip.click()
  await waitForBuilderName(page, expectedName)
  await waitForRuleChipStable(page)
}

async function measureConfigSwitch(page: Page, chips: Locator, toIdx: number, toName: string): Promise<{ builderReadyMs: number; ruleChipSettledMs: number; startTime: number; endTime: number }> {
  const target = chips.nth(toIdx)
  await expect(target).toBeVisible()
  const start = await page.evaluate(() => performance.now())
  await target.scrollIntoViewIfNeeded()
  await target.click()
  await waitForBuilderName(page, toName)
  const builderReady = await page.evaluate(() => performance.now())
  await waitForRuleChipStable(page)
  const ruleChipReady = await page.evaluate(() => performance.now())
  return {
    builderReadyMs: builderReady - start,
    ruleChipSettledMs: ruleChipReady - start,
    startTime: start,
    endTime: ruleChipReady,
  }
}

async function collectLongTasks(page: Page, cursor: number, windowStart: number, windowEnd: number): Promise<{ entries: { duration: number; scriptUrl: string | null; name: string }[]; nextCursor: number }> {
  const result = await page.evaluate(({ cursorIndex }) => {
    const scope = window as unknown as { __builderLongTasks?: Array<{ name: string; startTime: number; duration: number; scriptUrl: string | null }> }
    const entries = scope.__builderLongTasks ?? []
    return { slice: entries.slice(cursorIndex), total: entries.length }
  }, { cursorIndex: cursor })
  const entries = result.slice
    .filter((entry) => entry.startTime >= windowStart && entry.startTime <= windowEnd + 5)
    .map((entry) => ({
      duration: entry.duration,
      scriptUrl: entry.scriptUrl,
      name: entry.name,
    }))
  return { entries, nextCursor: result.total }
}

async function waitForBuilderName(page: Page, expectedName: string): Promise<void> {
  await page.waitForFunction(
    ({ selector, expected }) => {
      const input = document.querySelector<HTMLInputElement>(selector)
      if (!input) return false
      return input.value.trim() === expected.trim()
    },
    { selector: BUILDER_NAME_SELECTOR, expected: expectedName },
    { timeout: 120_000 },
  )
}

async function waitForRuleChipStable(page: Page): Promise<void> {
  await page.waitForFunction(
    ({ selector }) => {
      const chip = document.querySelector(selector)
      if (!chip) return false
      const text = chip.textContent ?? ''
      if (!text.trim()) return false
      return !text.includes('Counting')
    },
    { selector: RULE_CHIP_SELECTOR },
    { timeout: 120_000 },
  )
}

function formatConfigLabel(index: number, name: string): string {
  const trimmed = name.trim()
  return trimmed ? `#${index + 1} – "${trimmed}"` : `#${index + 1}`
}
