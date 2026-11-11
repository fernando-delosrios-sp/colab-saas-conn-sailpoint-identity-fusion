# Verify a deployed connector build

Use this guide when you need to **confirm which exact build of the connector a tenant runs** — before reporting an issue, after uploading a preview package, or when two tenants behave differently under the same version number.

**Configuration reference:** [Advanced Settings — Developer Settings](../../configuration/advanced.md#developer-settings) · **Terms:** [Connector build stamp](../../glossary.md) · [Installed connector version](../../glossary.md)

!!! note "Didactic guide"
    This page explains **how to read and compare** the connector build stamp. The connector does not decide whether a tenant is current or behind; you compare two lines yourself.

---

## When you need this

| Scenario | Why the version alone is not enough |
| --- | --- |
| Uploading a preview package and checking it landed | Every preview build under `2.2.0` shows the same **installed connector version** |
| Reporting a defect | Maintainers need the commit, not just the release label |
| Two tenants disagree | Same version, possibly different commits |

The **installed connector version** is a release label from `package.json`. The **connector build stamp** identifies the exact tree that was packed.

---

## Where the stamp appears

Open the source configuration in ISC, go to **Advanced Settings**, and expand **Developer Settings**. The section help shows two lines of identity:

```text
Installed connector version: 2.2.0
Build: def5678 2026-11-11 2.2.0/preview
```

| Field | Meaning |
| --- | --- |
| `def5678` | Short commit SHA of `HEAD` when the package was built |
| `2026-11-11` | Commit date, not the day the package was built |
| `2.2.0/preview` | Branch name (a detached checkout reads `detached`) |

A `-dirty` suffix on the SHA (`def5678-dirty`) means the package was built from a working tree with uncommitted changes.

![Developer Settings - Configuration](../../assets/images/advanced-settings-developer.png)

---

## Workflow: compare a tenant with your checkout

1. Check out the branch that produces your packages.
2. Run the command that prints the stamp the checkout would pack:

    ```bash
    npm run build:stamp
    ```

    Example output:

    ```text
    Build: def5678 2026-11-11 2.2.0/preview
    ```

3. Open **Developer Settings** in the tenant source and read its `Build:` line.
4. Compare the two lines.

| Result | Meaning |
| --- | --- |
| **Equal** | The tenant runs the same tree as your checkout |
| **Different** | The tenant was packed from another commit — upload a fresh package if you expected it to match |
| **`-dirty`** | The package came from uncommitted changes and cannot be matched to a commit |
| **`Build: unknown`** | The package was built where git facts were unavailable |
| **No `Build:` line** | The package was uploaded before this feature, so only the version is shown |

!!! note "Packing a fresh build"
    `npm run pack-zip` writes the stamp into the packaged copy of `connector-spec.json` only while it packages, then restores the committed file. Your working tree stays clean.

---

## Limits

- The stamp identifies the packed tree. It does not prove the tenant configuration is correct.
- A `-dirty` stamp cannot be matched to a commit; rebuild from a clean checkout.
- Packages uploaded before this feature show the installed connector version only.
- Released zips of one version, such as `v2.2.0`, still carry a stamp because the tag moves to the newest commit on `main`.

If a stamped `connector-spec.json` is ever left behind after an aborted pack, restore it with `git checkout -- connector-spec.json`.

---

## Troubleshooting

| Issue | Possible cause | Solution |
| --- | --- | --- |
| **No `Build:` line in the tenant** | Package built before this feature | Upload a package built from a current checkout |
| **Stamp always `-dirty`** | Uncommitted or untracked source changes at pack time | Commit or stash, then pack again |
| **`Build: unknown`** | Packed outside a git checkout, or git failed | Pack from a normal clone |
| **Stamp differs between machines** | Different commit or branch label | Compare SHA first, then branch |

---

## Related guides

| Topic | Guide |
| --- | --- |
| Reset Fusion state | [Reset Fusion state](reset-fusion-state.md) |
| Collect evidence before escalating | [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md) |
| Monitor aggregation progress | [Monitor aggregation progress](monitor-aggregation-progress.md) |
