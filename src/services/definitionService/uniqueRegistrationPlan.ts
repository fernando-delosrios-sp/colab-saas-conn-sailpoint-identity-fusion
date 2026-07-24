import { FusionConfig } from '../../model/config'

export interface UniqueRegistrationPlan {
    uniqueNames: ReadonlySet<string>
    mapTargets: ReadonlySet<string>
    passthroughNames: ReadonlySet<string>
}

export function buildUniqueRegistrationPlan(
    config: Pick<FusionConfig, 'uniqueAttributeDefinitions' | 'attributeMaps'>
): UniqueRegistrationPlan {
    const uniqueNames = new Set((config.uniqueAttributeDefinitions ?? []).map((definition) => definition.name))
    const mapTargets = new Set<string>()

    for (const attributeMap of config.attributeMaps ?? []) {
        const target = attributeMap.newAttribute
        if (target && uniqueNames.has(target)) {
            mapTargets.add(target)
        }
    }

    const passthroughNames = new Set<string>()
    for (const name of uniqueNames) {
        if (!mapTargets.has(name)) {
            passthroughNames.add(name)
        }
    }

    return { uniqueNames, mapTargets, passthroughNames }
}
