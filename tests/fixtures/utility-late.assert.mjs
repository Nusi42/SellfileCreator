export function validate(rules) {
  const LVLS = new Set([0,4,8,12,16])
  const gotLvls = new Set(rules.map(r=>Number(r.LVLForCheck)).filter(l=>LVLS.has(l)))
  for (const l of LVLS) if (!gotLvls.has(l)) throw new Error(`missing level +${l}`)
  const allowedTypes = new Set([5,1,6]) // Weapon, Helmet, Shield
  for (const r of rules) {
    const types = Array.isArray(r.ArtifactType) ? r.ArtifactType.map(Number) : []
    if (types.some(t=>!allowedTypes.has(t))) throw new Error('unexpected ArtifactType outside W/H/S')
  }
}

