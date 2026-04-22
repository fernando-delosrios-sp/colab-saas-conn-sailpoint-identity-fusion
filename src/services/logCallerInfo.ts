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

        const INFRASTRUCTURE_CLASSES = new Set(['Object', 'Module', 'Promise', 'InMemoryLockService', 'LimiterService'])

        const RUNTIME_INTERNALS = new Set(['process', 'internal', 'node', 'AsyncLocalStorage', 'AsyncResource'])

        let firstInfraOrigin: string | undefined
        for (let i = startIdx; i <= maxIdx; i++) {
            const line = lines[i]
            if (!line) continue

            const classMethodMatch = line.match(/at\s+(\w+)\.(\w+)\s*\(/)
            if (classMethodMatch) {
                const className = classMethodMatch[1]
                const methodName = classMethodMatch[2]

                if (RUNTIME_INTERNALS.has(className)) {
                    continue
                }
                if (INFRASTRUCTURE_CLASSES.has(className)) {
                    if (!firstInfraOrigin) {
                        firstInfraOrigin = `${className}>${methodName}`
                    }
                    continue
                }

                return {
                    origin: `${className}>${methodName}`,
                    isOperation: false,
                }
            }
        }

        for (let i = startIdx; i <= maxIdx; i++) {
            const line = lines[i]
            if (!line) continue

            const functionMatch = line.match(/at\s+(?:new\s+)?(\w+)\s*\(/)
            if (functionMatch) {
                const functionName = functionMatch[1]
                const isOperation = OPERATION_NAMES.has(functionName) || isOperationByPath
                if (isOperation) {
                    return { origin: `[${functionName}]`, isOperation: true }
                }
                return { origin: functionName, isOperation: isOperationByPath }
            }
        }

        if (firstInfraOrigin) {
            return { origin: firstInfraOrigin, isOperation: false }
        }

        const callerLine = lines[startIdx]
        if (callerLine) {
            const fileMatch = callerLine.match(/[/\\]([^/\\]+)\.(?:ts|js|tsx|jsx)/)
            if (fileMatch) {
                const fileName = fileMatch[1]
                const isOperation = OPERATION_NAMES.has(fileName) || isOperationByPath
                if (isOperation) {
                    return { origin: `[${fileName}]`, isOperation: true }
                }
                return { origin: fileName, isOperation: false }
            }
        }

        return { origin: 'unknown', isOperation: false }
    } catch {
        return { origin: 'unknown', isOperation: false }
    }
}

/**
 * Legacy function for backwards compatibility
 */
export function getCallerFunctionName(skipFrames: number = 2): string | undefined {
    return getCallerInfo(skipFrames).origin
}
