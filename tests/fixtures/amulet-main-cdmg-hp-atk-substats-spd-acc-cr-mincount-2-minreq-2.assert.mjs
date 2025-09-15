export function validate(rules) {
  // Expect ArtifactType [8] (Amulet) and presence of main variants CDMG(8/0), HP(1/1), ATK(2/1)
  const typesAll = new Set(rules.map(r=>JSON.stringify((r.ArtifactType||[]).map(Number))))
  if (!typesAll.has(JSON.stringify([8]))) throw new Error(`expected ArtifactType [8], got ${Array.from(typesAll)}`)
  const msAll = new Set(rules.map(r=>`${Number(r.MainStatID)}/${Number(r.MainStatF)}`))
  if (!(msAll.has('8/0') && msAll.has('1/1') && msAll.has('2/1'))) throw new Error(`expected mains CDMG(8/0), HP(1/1), ATK(2/1); got ${Array.from(msAll)}`)
}

