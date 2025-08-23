import { useMemo, useState } from 'react'
import type { SellRuleSet, SellFileItem, GearItem } from './lib/types'
import { defaultRuleSet } from './lib/defaultRuleSet'
import { generateSellList } from './lib/sellFile'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityCodeToName, statNameFromId, statIsAny, statNameSort, formatRank, formatLevel, formatArtifactSets, formatMainStat } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { buildHsfRules, mainStatOptions, substatOptions, LEVELS, type BuilderConfig } from './lib/hsfBuilder'

export default function App() {
  const [rules, setRules] = useState<SellRuleSet>(defaultRuleSet)
  const [gear, setGear] = useState<GearItem[]>([])
  const [output, setOutput] = useState<SellFileItem[] | null>(null)
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  const [builder, setBuilder] = useState<BuilderConfig>({
    keep: true,
    rank: { kind: 'any' },
    rarityExact: 'Rare',
    mainStat: { any: true },
    startLevel: 0,
    generateRollPermutations: true,
    substats: [],
    minCount: 2,
  })
  const [builtRules, setBuiltRules] = useState<HsfRule[] | null>(null)

  const prettyOutput = useMemo(() =>
    output ? JSON.stringify(output, null, 2) : '',
  [output])

  function onRulesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    try {
      const parsed = JSON.parse(e.target.value)
      setRules(parsed)
    } catch {
      // ignore parse errors to allow editing
    }
  }

  function onGearUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        const items: GearItem[] = Array.isArray(parsed) ? parsed : parsed.items ?? []
        setGear(items)
      } catch (err) {
        console.error('Failed to parse gear file', err)
      }
    }
    reader.readAsText(file)
  }

  function onGenerate() {
    const list = generateSellList(gear, rules)
    setOutput(list)
  }

  function onHsfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const parsed = parseHsfFile(text)
        setHsf(parsed)
      } catch (err) {
        console.error('Failed to parse .hsf file', err)
        setHsf(null)
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="app">
      <header>
        <h1>RSL Sellfile Creator</h1>
        <p>Create and validate sell files for RSL Helper.</p>
      </header>

      <section className="panel">
        <h2>1) Load Gear Export</h2>
        <input type="file" accept="application/json" onChange={onGearUpload} />
        <p className="hint">Supported: JSON export from your tooling. Shape is configurable.</p>
      </section>

      <section className="panel">
        <h2>Preview RSL Helper Sell File (.hsf)</h2>
        <input type="file" accept=".hsf,application/json" onChange={onHsfUpload} />
        {hsf ? (
          <div>
            <p className="hint">Loaded {hsf.Rules.length} rules</p>
            <HsfRulesTable rules={hsf.Rules} />
          </div>
        ) : (
          <p className="hint">Load a sample .hsf to inspect its rules</p>
        )}
      </section>

      <section className="panel">
        <h2>Build HSF Rules (Permutations)</h2>
        <BuilderPanel
          cfg={builder}
          onChange={setBuilder}
          onBuild={() => {
            const rules = buildHsfRules(builder)
            setBuiltRules(rules)
          }}
          onAppend={() => {
            const rules = buildHsfRules(builder)
            const existing = hsf ?? { Rules: [] as HsfRule[] }
            const merged: HsfFile = { Rules: [...existing.Rules, ...rules] }
            setHsf(merged)
            setBuiltRules(rules)
          }}
        />
        {builtRules && (
          <div style={{ marginTop: 8 }}>
            <p className="hint">Generated {builtRules.length} rule(s)</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => {
                const file: HsfFile = { Rules: builtRules }
                const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'rules.hsf'
                a.click()
                URL.revokeObjectURL(url)
              }}>Download .hsf</button>
              <span className="hint">Use Append to merge into current view</span>
            </div>
            <textarea readOnly value={JSON.stringify({ Rules: builtRules }, null, 2)} spellCheck={false} />
          </div>
        )}
      </section>

      <section className="panel">
        <h2>2) Edit Sell Rules</h2>
        <textarea
          defaultValue={JSON.stringify(rules, null, 2)}
          onChange={onRulesChange}
          spellCheck={false}
        />
      </section>

      <section className="panel actions">
        <button onClick={onGenerate} disabled={!gear.length}>Generate Sell List</button>
        <span className="hint">{gear.length ? `${gear.length} gear items loaded` : 'No gear loaded'}</span>
      </section>

      <section className="panel">
        <h2>3) Output Preview</h2>
        <textarea readOnly value={prettyOutput} placeholder="Generated sell file will appear here" />
      </section>

      <footer>
        <small>Draft prototype — rules and formats are placeholders pending your inputs.</small>
      </footer>
    </div>
  )
}

function HsfRulesTable({ rules }: { rules: HsfRule[] }) {
  const cols: Array<{ key: keyof HsfRule | 'Idx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'; label: string }>
    = [
      { key: 'Idx', label: 'Idx' },
      { key: 'Keep', label: 'Keep' },
      { key: 'Use', label: 'Use' },
      // { key: 'IsRuleTypeAND', label: 'AND' }, // Not useful atm
      { key: 'ArtifactSetNames', label: 'Sets' },
      { key: 'ArtifactTypeNames', label: 'Slot' },
      { key: 'RankLabel', label: 'Rank' },
      { key: 'RarityNames', label: 'Rarity' },
      { key: 'MainStatName', label: 'Main Stat' },
      { key: 'LevelLabel', label: 'Level' },
      { key: 'Faction', label: 'Faction' },
      { key: 'SubstatsSummary', label: 'Substats' },
    ]

  const summarizeSubstats = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(statNameSort);
    return nonAny?.map((x) => `${ x.Condition === '¬' ? x.Condition : '' }${ statNameFromId(x.ID, x.IsFlat) } ${ (!x.Condition || x.Condition === '¬') ? '' : x.Condition } ${ (x.Condition === '>=' || x.Condition === '<=') ? x.Value : '' }`.trim()).join(' | ');
  }

  // Render first N rules to keep UI snappy for very large files
  const MAX_ROWS = 200
  const rows = rules.slice(0, MAX_ROWS)

  return (
    <div style={{ overflowX: 'auto' }}>
      {rules.length > MAX_ROWS && (
        <p className="hint">Showing first {MAX_ROWS} of {rules.length} rules</p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={String(c.key)} style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '6px' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                let value: any
                if (c.key === 'SubstatsSummary') value = summarizeSubstats(r.Substats)
                else if (c.key === 'Keep') value = r.Keep ? "Keep" : "Sell"
                else if (c.key === 'Use') value = r.Use ? "✓" : "-"
                else if (c.key === 'ArtifactTypeNames') value = formatArtifactTypes(r.ArtifactType)
                else if (c.key === 'ArtifactSetNames') value = formatArtifactSets(r.ArtifactSet)
                else if (c.key === 'RankLabel') value = formatRank(r.Rank)
                else if (c.key === 'RarityNames') value = rarityCodeToName(r.Rarity)
                else if (c.key === 'MainStatName') value = formatMainStat(r.MainStatID, r.MainStatF)
                else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
                else if (c.key === 'Idx') value = i + 1 // RSL helper is 1 based... Niklaus Wirth, RIP, but that one was bad
                else value = (r as any)[c.key]

                const text = Array.isArray(value) ? value.join(',') : String(value ?? '')
                return (
                  <td key={String(c.key)} style={{ padding: '6px', borderBottom: '1px solid var(--border)', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BuilderPanel({ cfg, onChange, onBuild, onAppend }: {
  cfg: BuilderConfig,
  onChange: (c: BuilderConfig) => void
  onBuild: () => void
  onAppend: () => void
}) {
  const update = <K extends keyof BuilderConfig>(k: K, v: BuilderConfig[K]) => onChange({ ...cfg, [k]: v })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 8 }}>
        <label>
          <div>Action</div>
          <select value={cfg.keep ? 'keep' : 'sell'} onChange={(e) => update('keep', e.target.value === 'keep')}>
            <option value="keep">Keep</option>
            <option value="sell">Sell</option>
          </select>
        </label>

        <label>
          <div>Min Rank</div>
          <select
            value={cfg.rank.kind === 'any' ? 'any' : cfg.rank.kind === 'min' ? `min-${cfg.rank.value}` : `exact-${cfg.rank.value}`}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'any') return update('rank', { kind: 'any' })
              const [mode, num] = v.split('-')
              const n = Number(num) as 1|2|3|4|5|6
              update('rank', mode === 'min' ? { kind: 'min', value: n } : { kind: 'exact', value: n })
            }}
          >
            <option value="any">Any</option>
            <option value="min-1">≥ 1-Star</option>
            <option value="min-2">≥ 2-Star</option>
            <option value="min-3">≥ 3-Star</option>
            <option value="min-4">≥ 4-Star</option>
            <option value="min-5">≥ 5-Star</option>
            <option value="exact-6">6-Star only</option>
          </select>
        </label>

        <label>
          <div>Rarity (exact)</div>
          <select
            value={cfg.rarityExact}
            onChange={(e) => update('rarityExact', e.target.value as any)}
          >
            <option value="Common">Common</option>
            <option value="Uncommon">Uncommon</option>
            <option value="Rare">Rare</option>
            <option value="Epic">Epic</option>
            <option value="Legendary">Legendary</option>
            <option value="Mythical">Mythical</option>
          </select>
        </label>

        <label>
          <div>Start level</div>
          <select value={cfg.startLevel} onChange={(e) => update('startLevel', Number(e.target.value) as any)}>
            {LEVELS.map(l => (
              <option key={l} value={l}>Level {l}</option>
            ))}
          </select>
        </label>

        <label>
          <div>Main Stat</div>
          <select
            value={cfg.mainStat.any ? 'any' : `${cfg.mainStat.id}:${cfg.mainStat.f ?? ''}`}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'any') return update('mainStat', { any: true })
              const [id, f] = v.split(':')
              update('mainStat', { any: false, id: Number(id), f: f ? Number(f) : undefined })
            }}
          >
            <option value="any">Any</option>
            {mainStatOptions.filter(o => o.id !== -1).map(o => (
              <option key={`${o.id}:${o.f ?? ''}`} value={`${o.id}:${o.f ?? ''}`}>{o.label}</option>
            ))}
          </select>
        </label>

        <label>
          <div>Min selected substats</div>
          <select value={cfg.minCount} onChange={(e) => update('minCount', Number(e.target.value) as any)}>
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={cfg.generateRollPermutations}
            onChange={(e) => update('generateRollPermutations', e.target.checked)}
          />
          Generate roll permutations at 4, 8, 12, 16
        </label>
        <div className="hint" style={{ marginTop: 4 }}>
          If you choose 2 substats at level 0, we presume minimum presence at 0 and generate rules for level 4/8/12/16 with permutations of which substat(s) could have rolled up to that point.
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ marginBottom: 4 }}>Choose substats:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {substatOptions.map(s => {
            const selIdx = cfg.substats.findIndex(x => x.id === s.id && Boolean(x.isFlat) === Boolean(s.isFlat))
            const checked = selIdx >= 0
            return (
              <label key={`${s.id}:${s.isFlat ? 1 : 0}`} style={{ border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const arr = [...cfg.substats]
                    if (e.target.checked) arr.push({ id: s.id, isFlat: s.isFlat })
                    else arr.splice(selIdx, 1)
                    update('substats', arr)
                  }}
                /> {s.label}
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onBuild}>Generate</button>
        <button onClick={onAppend}>Append to current HSF</button>
      </div>
      <div className="hint" style={{ marginTop: 4 }}>
        Note: roll counts are encoded as substat Value thresholds (&gt;= rolls) due to missing exact numeric mappings. Adjust thresholds as needed.
      </div>
    </div>
  )
}
