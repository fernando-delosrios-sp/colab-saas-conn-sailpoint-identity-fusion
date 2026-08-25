## Scope

In: index only mandatory matching attributes whose effective threshold is above zero; return empty candidate set (not `undefined`) when the managed account lacks all indexed mandatory values; new `mandatoryMissingBlockCount` on FusionRun; dispatcher uses empty set without full corpus scan; regression test for threshold-0 mandatory rules; observability counter in process epilogue.

Out: numeric scorers; name-matcher caches; changing mandatory skip-on-missing semantics; skip-on-missing for mandatory rules.

## Language

**Mandatory missing block** (`draft`): When trigram blocking is active but the managed account has no value for any indexed mandatory attribute, `getCandidates` returns an empty set and increments `mandatoryMissingBlockCount` — scoring runs zero identity comparisons instead of a full corpus scan.

_Avoid_: calling this a "full scan fallback" (that term remains for `undefined` when no blocking index exists).

## Decisions

**D1: Threshold-0 mandatory attributes are not indexed**
- Such rules pass with score 0 (`isMatch = score >= 0`); excluding identities without the attribute drops true matches. Do not index them.

**D2: Empty set vs undefined**
- `undefined`: index not built or no usable mandatory rules → caller full-scans.
- Empty `Set`: account lacks all indexed mandatory values → zero comparisons (mandatory rules fail for every identity).

**D3: Separate counter**
- `mandatoryMissingBlockCount` for empty-set blocks; stop incrementing `fullScanFallbackCount` for this case (behavior change).

## Open Questions

None.
