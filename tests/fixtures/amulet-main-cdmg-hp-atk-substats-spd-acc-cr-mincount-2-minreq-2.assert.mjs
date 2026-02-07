export function validate(rules) {
  if (rules.length !== 0) {
    throw new Error(`expected no rules after slot/main pruning, got ${rules.length}`)
  }
}
