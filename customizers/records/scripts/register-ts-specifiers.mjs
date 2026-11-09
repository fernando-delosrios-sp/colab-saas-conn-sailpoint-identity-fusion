import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Node's type stripper does not add TypeScript extensions.
 * The connector sources use extensionless imports, which this hook resolves to `.ts`
 * for the Records Customizer pack and benchmark scripts.
 */
registerHooks({
    resolve(specifier, context, nextResolve) {
        if (
            (specifier.startsWith('./') || specifier.startsWith('../')) &&
            context.parentURL &&
            path.extname(specifier).length === 0
        ) {
            const parentPath = fileURLToPath(context.parentURL)
            const candidate = path.resolve(path.dirname(parentPath), `${specifier}.ts`)
            if (existsSync(candidate)) {
                return nextResolve(`${specifier}.ts`, context)
            }
        }
        return nextResolve(specifier, context)
    },
})
