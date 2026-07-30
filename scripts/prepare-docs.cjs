const { spawnSync } = require('child_process')
const path = require('path')

const rootDir = path.resolve(__dirname, '..')

function runNode(scriptName) {
    const scriptPath = path.join(__dirname, scriptName)
    const result = spawnSync(process.execPath, [scriptPath], { stdio: 'inherit', cwd: rootDir })
    if (result.error) {
        throw result.error
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status)
    }
}

runNode('generate-config-docs.cjs')
runNode('copy-license-for-docs.cjs')
runNode('copy-changelog-for-docs.cjs')
runNode('check-lean-ctx-docs.cjs')


