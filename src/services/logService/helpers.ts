/**
 * Known operation function names (connector entrypoints).
 */
const OPERATION_NAMES = new Set([
    'accountList',
    'accountCreate',
    'accountRead',
    'accountUpdate',
    'accountDelete',
    'accountEnable',
    'accountDisable',
    'entitlementList',
    'accountDiscoverSchema',
    'testConnection',
])

const INFRASTRUCTURE_CLASSES = new Set(['Object', 'Module', 'Promise', 'InMemoryLockService', 'ApiQueue'])
const RUNTIME_INTERNALS = new Set(['process', 'internal', 'node', 'AsyncLocalStorage', 'AsyncResource'])

function parseClassMethodFrame(line: string): { className: string; methodName: string } | undefined {
    const classMethodMatch = line.match(/at\s+(\w+)\.(\w+)\s*\(/)
    if (!classMethodMatch) return undefined
    return { className: classMethodMatch[1], methodName: classMethodMatch[2] }
}

function parseFunctionFrame(line: string): string | undefined {
    const functionMatch = line.match(/at\s+(?:new\s+)?(\w+)\s*\(/)
    return functionMatch?.[1]
}

function parseFileNameFrame(line: string): string | undefined {
    const fileMatch = line.match(/[/\\]([^/\\]+)\.(?:ts|js|tsx|jsx)/)
    return fileMatch?.[1]
}

function classifyClassMethodOrigin(
    className: string,
    methodName: string,
    firstInfraOrigin: { value?: string }
): { origin: string; isOperation: boolean } | 'skip' | 'infra' {
    if (RUNTIME_INTERNALS.has(className)) {
        return 'skip'
    }
    if (INFRASTRUCTURE_CLASSES.has(className)) {
        if (!firstInfraOrigin.value) {
            firstInfraOrigin.value = `${className}>${methodName}`
        }
        return 'infra'
    }
    return { origin: `${className}>${methodName}`, isOperation: false }
}

function classifyFunctionOrigin(functionName: string, isOperationByPath: boolean): { origin: string; isOperation: boolean } {
    const isOperation = OPERATION_NAMES.has(functionName) || isOperationByPath
    if (isOperation) {
        return { origin: `[${functionName}]`, isOperation: true }
    }
    return { origin: functionName, isOperation: isOperationByPath }
}

function classifyFileOrigin(fileName: string, isOperationByPath: boolean): { origin: string; isOperation: boolean } {
    const isOperation = OPERATION_NAMES.has(fileName) || isOperationByPath
    if (isOperation) {
        return { origin: `[${fileName}]`, isOperation: true }
    }
    return { origin: fileName, isOperation: false }
}

/**
 * Extracts the caller service and method name from the stack trace
 * @param skipFrames Number of stack frames to skip (default: 2 to skip this function and the logging method)
 * @returns An object with origin (formatted string) and isOperation (boolean)
 */
export function getCallerInfo(skipFrames: number = 2): { origin: string; isOperation: boolean } {
    try {
        const stack = new Error().stack
        if (!stack) return { origin: 'unknown', isOperation: false }

        const lines = stack.split('\n')
        const isOperationByPath = stack.includes('/operations/')
        const startIdx = skipFrames + 1
        const maxIdx = Math.min(lines.length - 1, startIdx + 8)
        const firstInfraOrigin: { value?: string } = {}

        for (let i = startIdx; i <= maxIdx; i++) {
            const line = lines[i]
            if (!line) continue

            const parsed = parseClassMethodFrame(line)
            if (!parsed) continue

            const classification = classifyClassMethodOrigin(parsed.className, parsed.methodName, firstInfraOrigin)
            if (classification === 'skip' || classification === 'infra') continue
            return classification
        }

        for (let i = startIdx; i <= maxIdx; i++) {
            const line = lines[i]
            if (!line) continue

            const functionName = parseFunctionFrame(line)
            if (functionName) {
                return classifyFunctionOrigin(functionName, isOperationByPath)
            }
        }

        if (firstInfraOrigin.value) {
            return { origin: firstInfraOrigin.value, isOperation: false }
        }

        const callerLine = lines[startIdx]
        if (callerLine) {
            const fileName = parseFileNameFrame(callerLine)
            if (fileName) {
                return classifyFileOrigin(fileName, isOperationByPath)
            }
        }

        return { origin: 'unknown', isOperation: false }
    } catch {
        return { origin: 'unknown', isOperation: false }
    }
}
