export function migrateConfigKey(raw: Record<string, unknown>, oldKey: string, newKey: string): void {
    if (oldKey in raw) {
        if (!(newKey in raw)) {
            raw[newKey] = raw[oldKey]
        }
        delete raw[oldKey]
    }
}
