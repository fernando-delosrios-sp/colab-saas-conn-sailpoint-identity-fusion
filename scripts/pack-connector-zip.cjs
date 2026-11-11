#!/usr/bin/env node

/**
 * Packages the connector with a connector build stamp in the Developer Settings help.
 *
 * `spcx package` reads connector-spec.json from the repo root, so the stamped copy is on
 * disk only while the package command runs. The original bytes are always restored.
 */

const path = require('path')
const { spawnSync } = require('child_process')
const { stampConnectorSpecFile, restoreConnectorSpecFile } = require('./connector-build-stamp.cjs')

const SPCX_BIN = process.platform === 'win32' ? 'spcx.cmd' : 'spcx'

function defaultExec(command, args, options = {}) {
    return spawnSync(command, args, { cwd: options.cwd, stdio: 'inherit' })
}

/**
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, exec?: (command: string, args: string[], options?: object) => unknown, stamp?: string }} [options]
 * @returns {number} exit code of the package command
 */
function packConnectorZip({ cwd = process.cwd(), env = process.env, exec = defaultExec, stamp } = {}) {
    const stamped = stampConnectorSpecFile({ cwd, env, stamp })

    try {
        const command = path.join(cwd, 'node_modules', '.bin', SPCX_BIN)
        const result = exec(command, ['package'], { cwd })

        if (!result || result.error) {
            console.error(result && result.error ? result.error.message : 'Package command did not run.')
            return 1
        }

        return typeof result.status === 'number' ? result.status : 1
    } finally {
        restoreConnectorSpecFile(stamped)
    }
}

if (require.main === module) {
    process.exitCode = packConnectorZip()
}

module.exports = { packConnectorZip }
