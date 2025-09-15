export function validate(rules) {
  // ACC ID = 6. Expect +8 includes 27; +16 starts at 36.
  const map = new Map()
  for (const r of rules) {
    const lvl = Number(r.LVLForCheck)
    const subs = Array.isArray(r.Substats) ? r.Substats : []
    for (const s of subs) if (Number(s?.ID) === 6) {
      const arr = map.get(lvl) || []
      arr.push(Number(s.Value))
      map.set(lvl, arr)
    }
  }
  const at8 = Array.from(new Set(map.get(8) || [])).sort((a,b)=>a-b)
  if (!(at8.length && at8[0] === 27)) throw new Error(`+8 should include 27; got ${at8}`)
  const at16 = Array.from(new Set(map.get(16) || [])).sort((a,b)=>a-b)
  if (!(at16.length && at16[0] === 36)) throw new Error(`+16 should start at 36; got ${at16}`)
}

