const message = 'crypto shim invoked – sql.js should not access Node crypto APIs in the browser bundle.'

const thrower = () => {
  throw new Error(message)
}

const cryptoShim = {
  randomFillSync: thrower,
  randomBytes: (length) => {
    thrower()
    return new Uint8Array(length ?? 0)
  },
}

module.exports = cryptoShim
module.exports.default = cryptoShim
