const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const command = process.argv[2]
const rootDir = path.resolve(__dirname, '..')
const venvDir = path.join(rootDir, '.venv')
const isWindows = process.platform === 'win32'

function run(cmd, args) {
    const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: rootDir })
    if (result.error) {
        throw result.error
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status)
    }
}

function resolvePython() {
    const windowsPython = path.join(venvDir, 'Scripts', 'python.exe')
    const unixPython = path.join(venvDir, 'bin', 'python')
    return isWindows ? windowsPython : unixPython
}

if (command === 'install') {
    run(isWindows ? 'py' : 'python3', ['-m', 'venv', '.venv'])
    run(resolvePython(), ['-m', 'pip', 'install', '-r', 'requirements-docs.txt'])
    process.exit(0)
}

const pythonPath = resolvePython()
if (!fs.existsSync(pythonPath)) {
    console.error('Docs virtual environment not found. Run "npm run docs:install" first.')
    process.exit(1)
}

if (command === 'build') {
    run(pythonPath, ['-m', 'mkdocs', 'build'])
    process.exit(0)
}

if (command === 'serve') {
    run(pythonPath, ['-m', 'mkdocs', 'serve'])
    process.exit(0)
}

console.error('Unknown command. Use one of: install, build, serve.')
process.exit(1)
