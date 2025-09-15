export function validate(rules) {
  // SPD id=4 should include >=15; CR% id=7 includes >=10; RES id=5 capped at 9
  const coll = (id, lvl) => {
    const vals = []
    for (const r of rules) if (Number(r.LVLForCheck) === lvl) {
      const s = (r.Substats||[]).find(x=>Number(x?.ID)===id)
      if (s) vals.push(Number(s.Value))
    }
    return Array.from(new Set(vals)).sort((a,b)=>a-b)
  }
  const lvls = Array.from(new Set(rules.map(r=>Number(r.LVLForCheck))))
  const last = Math.max(...lvls)
  const spd = coll(4, last), cr = coll(7, last), res = coll(5, last)
  if (!spd.some(v=>v>=15)) throw new Error(`SPD @+${last} should include >=15; got ${spd}`)
  if (!cr.some(v=>v>=10)) throw new Error(`CR% @+${last} should include >=10; got ${cr}`)
  if (!res.every(v=>v===9)) throw new Error(`RES @+${last} should be capped at 9; got ${res}`)
}

