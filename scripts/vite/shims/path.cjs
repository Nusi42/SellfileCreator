const normalize = (value) => (typeof value === 'string' ? value : '')
const join = (...parts) => parts.filter((part) => typeof part === 'string' && part.length > 0).join('/')
const dirname = (value) => {
  if (typeof value !== 'string') return '.'
  const trimmed = value.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? '.' : trimmed.slice(0, idx)
}
const basename = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  return idx === -1 ? trimmed : trimmed.slice(idx + 1)
}

const pathShim = {
  normalize,
  join,
  dirname,
  basename,
  resolve: join,
  sep: '/',
}

module.exports = pathShim
module.exports.default = pathShim
