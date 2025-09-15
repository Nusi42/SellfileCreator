export function validate(rules) {
  const msAll = new Set(rules.map(r=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
  const ok = ['6/1','5/1','1/1'].some(m => msAll.has(m))
  if (!ok) throw new Error(`expected at least one of ACC(6/1), RES(5/1), HP(1/1) as main; got ${Array.from(msAll)}`)
}

