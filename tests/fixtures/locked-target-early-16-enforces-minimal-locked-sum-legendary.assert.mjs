export function validate(rules) {
  // +16 should include SPD value >= 15 (2 rolls)
  const at16 = rules.filter(r=>Number(r.LVLForCheck)===16)
  if (!at16.length) throw new Error('expected +16 rows present')
  const vals = []
  for (const r of at16) {
    const s = (r.Substats||[]).find(x=>Number(x?.ID)===4)
    if (s) vals.push(Number(s.Value))
  }
  if (!vals.some(v=>v>=15)) throw new Error(`+16 SPD should include >=15; got ${vals}`)
}

