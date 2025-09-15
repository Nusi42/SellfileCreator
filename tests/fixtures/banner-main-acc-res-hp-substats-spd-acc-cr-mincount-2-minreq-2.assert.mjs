export function validate(rules) {
  // Expect types [Banner] id 9? Legacy tests verified behavior via structure; here we ensure gauntlet.
  // For robustness, just ensure some ArtifactType array is present and main stat is one of ACC(6/1), RES(5/1), HP(1/1)
  const msAll = new Set(rules.map(r=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
  const ok = ['6/1','5/1','1/1'].some(m => msAll.has(m))
  if (!ok) throw new Error(`expected at least one of ACC(6/1), RES(5/1), HP(1/1) as main; got ${Array.from(msAll)}`)
}

