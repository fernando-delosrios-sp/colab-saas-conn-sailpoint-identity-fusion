## Context

Map evaluates every explicit attribute map from live snapshots only. Define already lets a later definition read an earlier definition's output in list order. Operators need the same order for explicit maps so a generated alias, such as `NHI Admin`, can feed a later map such as `Owner`.

The behavior change is inside MappingService. Snapshot indexing, implicit candidates, Define, and Match stay as they are.

## Goals / Non-Goals

**Goals:**

- Evaluate explicit attribute maps in configured `attributeMaps` order.
- Make a present earlier result available to later explicit maps in the same `mapAttributes` invocation as a prior mapped value.
- Keep today's snapshot rules when the earlier map produced no value.
- Leave implicit candidates, `onlyTargets` membership, and the `mainAccount` snapshot rewrite unchanged.

**Non-Goals:**

- Dependency sorting, cycle detection, or evaluating maps that `onlyTargets` did not request.
- Letting implicit candidates read prior mapped values.
- Changing Define or Match.
- Rebuilding or cloning snapshots per map.

## Decisions

### D1: Configured order

- **Choice**: Walk explicit targets in `attributeMaps` order. Duplicate `newAttribute` rows stay first-row-wins.
- **Reason**: This matches Define. The card list is already reorderable.
- **Considered alternatives**: A dependency graph. Rejected because it reorders operator intent and adds cycle handling for little gain.

### D2: Invocation-local prior mapped value

- **Choice**: A map local to one `mapAttributes` call, keyed by `newAttribute`. Record a result only when it has a value. Do not record an empty result or designated-snapshot-unavailable.
- **Reason**: Later maps need the value without copying snapshots or keeping state on MappingService.
- **Considered alternatives**: Inject the value onto every live snapshot. Rejected because it copies account bodies and confuses source filtering.

### D3: Prior value wins for that lookup name only

- **Choice**: Keep the current account-major snapshot walk. When a lookup name is considered, a present prior mapped value is used and that name is not read from snapshots. Later lookup names are still tried only if earlier names miss.
- **Reason**: Checking all names across all accounts before the next name would change First found results for raw attributes.
- **Considered alternatives**: Name-major lookup. Rejected because `mail` on an earlier account would lose to `email` on a later account.

### D4: Every merge strategy sees the prior value

- **Choice**: First found, Source name, list, concatenate, Main account, and Origin account all honor a prior mapped value. Source filtering applies to snapshots. If the pinned source has no accounts, the prior value is still used. For Main account and Origin account, a prior value is used even when the designated snapshot is missing or lacks the attribute. With no prior value, designated-snapshot-unavailable and empty-snapshot behavior stay as they are.
- **Reason**: `Owner` is a single generated value, not an attribute on the NHI snapshot.
- **Considered alternatives**: Limit prior values to First found. Rejected because the same alias would silently fail under the default Main account merge.

### D5: List and concatenate include the prior value once

- **Choice**: A name with a prior mapped value contributes that value once and contributes no snapshot values for that name. Other names keep the current source-order collection.
- **Reason**: Collecting both the alias and the raw attribute would double-count.

### D6: Selective maps do not pull predecessors

- **Choice**: `onlyTargets` still evaluates only requested explicit maps, in configured order. A requested map sees prior mapped values only from earlier maps evaluated in that invocation.
- **Reason**: Unique registration maps a small target set and must not grow a hidden walk.

### D7: One snapshot index

- **Choice**: Build the snapshot-key index once per invocation. Pass the prior-value map into lookup. Do not clone `sourceAttributeMap`.
- **Reason**: Map runs once per account, outside scoring. An extra lookup per name is enough.

## Risks / Trade-offs

- [Risk] A lookup name that collides with an earlier new attribute starts returning the prior mapped value instead of the snapshot. -> Mitigation: document the precedence in the mapping guide and Existing attributes help text.
- [Risk] A selective map of a later target still misses an unrequested predecessor. -> Mitigation: state that in the guide; callers that need the predecessor include it in `onlyTargets`.
- [Trade-off] Forward references fall through to snapshots. -> Reason for acceptance: same list-order rule as Define, with no cycle machinery.

## Migration Plan

No stored configuration migration and no tenant write. Ship the connector, then reorder or correct attribute maps that should read earlier new attributes. Rollback is the previous connector build; maps that named only raw snapshot attributes keep their results.

## Open Questions

None.
