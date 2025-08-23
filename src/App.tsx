import { useMemo, useState } from 'react'
import type { SellRuleSet, SellFileItem, GearItem } from './lib/types'
import { defaultRuleSet } from './lib/defaultRuleSet'
import { generateSellList } from './lib/sellFile'

export default function App() {
  const [rules, setRules] = useState<SellRuleSet>(defaultRuleSet)
  const [gear, setGear] = useState<GearItem[]>([])
  const [output, setOutput] = useState<SellFileItem[] | null>(null)

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

