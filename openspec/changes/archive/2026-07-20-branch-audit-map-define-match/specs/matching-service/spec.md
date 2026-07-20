## ADDED Requirements

### Requirement: Matching iterations SHALL avoid array allocations

When iterating over multiple Set collections of account IDs during the identity matching evaluation, MatchingService SHALL iterate them sequentially using direct `for...of` loops rather than combining them via array spread syntax (`[...setA, ...setB]`), to avoid O(N) memory allocations per invocation on hot paths.

#### Scenario: Identity matching iterates candidate sets directly
- **WHEN** MatchingService evaluates identity candidates for a managed account
- **THEN** the matching loop iterates directly over `accountIdsSet` and `missingAccountIdsSet` without allocating an intermediate array
