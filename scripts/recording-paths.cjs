const path = require('path')

const RECORDINGS_ROOT = path.resolve('recordings')

function chainDir(chainName) {
    return path.join(RECORDINGS_ROOT, chainName)
}

module.exports = { RECORDINGS_ROOT, chainDir }
