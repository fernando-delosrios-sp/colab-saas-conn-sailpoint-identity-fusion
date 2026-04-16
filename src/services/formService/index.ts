// Re-export main service class
export { FormService } from './formService'

// Re-export constants
export { ALGORITHM_LABELS } from './constants'

// Re-export types
export type {
    Candidate,
    PendingReviewFormContext,
    PendingReviewReviewerContext,
    PendingReviewAccountContext,
} from './types'

// Re-export helpers (for testing and external use if needed)
export { buildCandidateList, buildFormName, calculateExpirationDate, getFormOwner, resolveIdentitiesSelectLabel } from './helpers'

export { buildFormInput, buildFormFields, buildFormConditions, buildFormInputs } from './formBuilder'

export {
    createFusionDecision,
    getReviewerInfo,
    extractAccountInfoFromFormInput,
    extractCandidateIdsFromFormInput,
} from './formProcessor'
