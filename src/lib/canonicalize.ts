export const canonicalize = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(canonicalize)
  if (x && typeof x === 'object') {
    const keys = Object.keys(x).sort()
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = canonicalize((x as Record<string, unknown>)[k])
    return out
  }
  return x
}
