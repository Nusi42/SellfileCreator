import { useMemo, useState } from 'react'
import type { SellRuleSet, SellFileItem, GearItem } from './lib/types'
import { defaultRuleSet } from './lib/defaultRuleSet'
import { generateSellList } from './lib/sellFile'
import { parseHsfFile } from './lib/hsf'
import { formatArtifactTypes, rarityMaskToNames, statNameFromId, formatRank, formatLevel, formatArtifactSets } from './lib/domain'
import type { HsfFile, HsfRule } from './lib/hsfTypes'

export default function App() {
  const [rules, setRules] = useState<SellRuleSet>(defaultRuleSet)
  const [gear, setGear] = useState<GearItem[]>([])
  const [output, setOutput] = useState<SellFileItem[] | null>(null)
  const [hsf, setHsf] = useState<HsfFile | null>(null)

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
        <h1>RSL Sellfile Optimizer</h1>
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
  const cols: Array<{ key: keyof HsfRule | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'; label: string }>
    = [
      { key: 'Keep', label: 'Keep' },
      { key: 'Use', label: 'Use' },
      { key: 'IsRuleTypeAND', label: 'AND' },
      { key: 'ArtifactSetNames', label: 'Sets' },
      { key: 'ArtifactTypeNames', label: 'Types' },
      { key: 'RankLabel', label: 'Rank' },
      { key: 'RarityNames', label: 'Rarities' },
      { key: 'MainStatName', label: 'Main Stat' },
      { key: 'LevelLabel', label: 'Level' },
      { key: 'Faction', label: 'Faction' },
      { key: 'SubstatsSummary', label: 'Substats' },
    ]

  const summarizeSubstats = (s: HsfRule['Substats']) =>
    s
      ?.filter(Boolean)
      .map((x) => `${statNameFromId(x.ID, x.IsFlat)} ${x.Condition || ''} ${x.Value}`.trim())
      .join(' | ')

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
                else if (c.key === 'ArtifactTypeNames') value = formatArtifactTypes(r.ArtifactType)
                else if (c.key === 'ArtifactSetNames') value = formatArtifactSets(r.ArtifactSet)
                else if (c.key === 'RankLabel') value = formatRank(r.Rank)
                else if (c.key === 'RarityNames') value = rarityMaskToNames(r.Rarity)
                else if (c.key === 'MainStatName') value = statNameFromId(r.MainStatID, r.MainStatF ? r.MainStatF === 0 : undefined)
                else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
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
