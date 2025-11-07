const message = 'fs shim invoked – sql.js should not rely on Node fs APIs in the browser bundle.'

const thrower = () => {
  throw new Error(message)
}

const fsShim = new Proxy(
  {},
  {
    get: () => thrower,
    apply: () => thrower(),
  },
)

module.exports = fsShim
module.exports.default = fsShim
