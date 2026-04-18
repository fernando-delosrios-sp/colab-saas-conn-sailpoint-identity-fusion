/**
 * Friendly algorithm names (aligned with connector-spec.json)
 */
export const ALGORITHM_LABELS: Record<string, string> = {
    'name-matcher': 'Enhanced Name Matcher',
    'jaro-winkler': 'Jaro-Winkler',
    lig3: 'LIG3',
    dice: 'Dice',
    'double-metaphone': 'Double Metaphone',
    custom: 'Custom Algorithm (from SaaS customizer)',
    average: 'Combined match score (legacy)',
    'weighted-mean': 'Combined score',
}

/** Minimum configurable match candidates shown on a single fusion review form. */
export const FUSION_MAX_CANDIDATES_FOR_FORM_MIN = 1
/** Maximum configurable match candidates shown on a single fusion review form (platform/UI limit). */
export const FUSION_MAX_CANDIDATES_FOR_FORM_MAX = 15
/** Default cap when `fusionMaxCandidatesForForm` is omitted from source config. */
export const FUSION_MAX_CANDIDATES_FOR_FORM_DEFAULT = 10
