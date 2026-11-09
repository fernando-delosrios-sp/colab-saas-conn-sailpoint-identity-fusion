## Context

Internal Record sources already stream packaged accounts and can follow the Record path, including Include record accounts in Match. The dump must contain a `nativeIdentity` header, and Source Settings selects the file at runtime. A second Records Customizer feature compiles `values/*.csv` into a Customizer Value Store that unique generation checks before registered account values.

Operators need the source name, schema, Match flag, and Accounts JMESPath filter settled while packaging, and they need unique reservation to come from those accounts.

## Architecture

[Container diagram](./diagrams/package-internal-record-sources.drawio)

The operator runs the Records Customizer pack locally. The pack writes an Internal Record configuration file and stream-readable account artifacts. The operator uploads that zip to Identity Security Cloud. During aggregation the connector reads the configuration, builds in-memory Record sources, and lists configured sources to detect a shared name.

## Goals / Non-Goals

**Goals:**

- Prompt for missing Internal Record configuration and reuse saved answers on the next pack.
- Infer an Internal Record schema, including multi-valued fields, and let the operator correct it before compile.
- Make each packaged source follow the existing Record path.
- Fail on a duplicate Internal Record source name and on a name that matches a configured source.
- Remove the reserved-value index and the Customizer Value Store.

**Non-Goals:**

- Changing Authoritative or Orphan processing.
- Applying an Accounts API filter to a dump.
- Re-inferring the schema while the connector runs.
- Keeping a bare list of strings as a way to reserve unique values.

## Decisions

### D1: Configuration file is an input and a packaged artifact

- **Choice**: Save `customizers/records/internal-record-configuration.json`. Packaging copies it into the customizer data directory next to the manifest. The connector reads only the packaged copy.
- **Reason**: A later pack must be silent when the answers are already saved, and Identity Security Cloud must not depend on the source CSV.
- **Considered alternatives**: Store the answers only inside the binary artifacts. Rejected because the operator needs a readable file to review Match, the filter, and the schema without unpacking shards.

### D2: Interactive only when a dump has no saved entry

- **Choice**: A TTY pack prompts for each `records/*.csv` missing from the configuration. A non-TTY pack fails and names the file. Saved entries are reused. The operator may edit the JSON between packs.
- **Reason**: CI cannot answer prompts, and a new dump must not ship with a silent default.
- **Considered alternatives**: Default Match off for an unconfigured dump. Rejected. Packaging is where that choice is confirmed.

### D3: Schema inference uses unquoted semicolons

- **Choice**: One field per header. A field starts multi-valued when any cell contains an unquoted semicolon. The prompt shows that decision. The operator flips the flag or edits the CSV and re-scans. The saved flag is authoritative.
- **Reason**: CSV has no standard multi-value marker. The scan gives a starting point the operator can override.
- **Considered alternatives**: Split every cell at runtime. Rejected because free-text fields contain semicolons.

### D4: CSV parsing

- **Choice**: Commas separate fields. Quotes bind a cell, including commas, doubled quotes, and embedded newlines (RFC 4180). The connector splits a cell on unquoted semicolons only when the saved schema marks that field multi-valued. A quoted semicolon stays in one value. A single-valued field keeps an unquoted semicolon inside the string.
- **Reason**: The dump compiler already parses RFC 4180. Multi-value is a schema decision, not a second parse of every cell.
- **Considered alternatives**: Require a `nativeIdentity` header and ignore other columns as identity. Rejected. Account ID and Account Name are chosen fields.

### D5: Account construction

- **Choice**: The Account ID field becomes `nativeIdentity`. The Account Name field becomes the account name, and an empty name falls back to the Account ID. Other fields become attributes. A multi-valued field becomes a list of strings. Packaging fails on a blank or duplicate Account ID and names the file and row.
- **Reason**: Record processing and managed account keys already use `nativeIdentity`.
- **Considered alternatives**: Keep the Identity Security Cloud account `id` column as the connector account id. Rejected. Internal Record sources keep a synthetic source id and internal provenance, so they do not link to Identity Security Cloud accounts.

### D6: Record path is unchanged once the source exists

- **Choice**: The connector builds an in-memory Record source from each configuration entry. Include record accounts in Match and the Accounts JMESPath filter come from that entry. The JMESPath expression is validated at pack time and applied while streaming. Match off uses record unique registration. Match on scores. A non-match does not create a Fusion account.
- **Reason**: Those controls already define a Record source.
- **Considered alternatives**: Bake the JMESPath filter into the shards. Rejected so the saved configuration remains the processing contract.

### D7: Name collision

- **Choice**: Packaging fails when two entries use the same source name. Connector setup fails when an Internal Record source name equals any configured source name. The error names both. A configured source with no packaged entry still uses its Identity Security Cloud feed.
- **Reason**: The package cannot see the tenant's Source Settings. The connector can.
- **Considered alternatives**: Let the dump override a configured source of the same name. Rejected. An override of a non-record source was explicitly excluded.

### D8: Retire the reserved-value index

- **Choice**: Remove `values/`, `build-indices`, `.bin` unique indexes, `customizerIndicesDir`, and Customizer Value Store checks in unique generation. Record registration remains the collision set.
- **Reason**: An Internal Record account that carries the unique attribute reserves that value. A second index duplicates the job and keeps a list format the operator no longer wants.
- **Considered alternatives**: Keep the hash index for large username lists. Rejected. A reserved username must be a field on an account.

## Risks / Trade-offs

- [Risk] A 300k-row dump registers unique values into an in-memory string set instead of a hash index. -> Mitigation: keep stream-readable shards and the existing bounded record-registration batching. Document that reservation happens through accounts, not a compact hash file.
- [Risk] Operators with a deployed `.bin` customizer lose reservation on upgrade. -> Mitigation: call out the break in the Records Customizer guide and require an Internal-record dump before the new package reserves values.
- [Trade-off] The Accounts API filter cannot run on a file. -> Reason for acceptance: the JMESPath filter is the client-side filter Record sources already use, and it is stored in the configuration.
- [Trade-off] Empty Account Name falls back to Account ID. -> Reason for acceptance: record processing needs a display name, and the operator already chose the name field.

## Migration Plan

1. Replace `values/*.csv` reserved lists with `records/*.csv` dumps that include the unique attribute as a field.
2. Run the interactive pack and commit `internal-record-configuration.json`.
3. Upload the new customizer zip and remove the Source Settings internal-record file value.
4. Rollback is the previous customizer zip plus the previous connector build. The configuration file is an input and can stay in git.

Acceptance: a dump with saved configuration packs without prompts, a dump without configuration fails in a non-TTY pack, a multi-valued flag is honored by the connector, a matching source name fails setup, and unique generation rejects a value registered from an Internal Record account.

## Open Questions

None.
