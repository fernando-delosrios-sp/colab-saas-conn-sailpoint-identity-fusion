# Configuration guides

Topic guides for Identity Fusion NG connector settings. Each guide covers **one configuration concern**. For field keys, types, defaults, and constraints, use the [Configuration reference](../../configuration/index.md).

---

## Choose your path

| Your goal | Start here | Also read |
| --- | --- | --- |
| **Wire sources and scope** | [Configuring sources and scope](configuring-sources-and-scope.md) | [Source types](source-types.md) |
| **Pick per-source processing mode** | [Source types](source-types.md) | [Configuring sources and scope](configuring-sources-and-scope.md) |
| **Merge multi-source attributes** | [Mapping attributes](mapping-attributes.md) | [Defining attributes](defining-attributes.md) |
| **Generate unique IDs or computed fields** | [Defining attributes](defining-attributes.md) | [Mapping attributes](mapping-attributes.md) |
| **Configure Match rules and thresholds** | [Matching identities](matching-identities.md) | [Tuning matching algorithms](tuning-matching-algorithms.md) |
| **Set up review forms** | [Review forms and reviewers](review-forms-and-reviewers.md) | [Managing reviewers](managing-reviewers.md) |
| **Assign reviewers** | [Managing reviewers](managing-reviewers.md) | [Review forms and reviewers](review-forms-and-reviewers.md) |
| **Tune correlation after Match** | [Managing correlation](managing-correlation.md) | [Match flow reference](../../reference/match-flow.md) |
| **Pick algorithms and tune scores** | [Tuning matching algorithms](tuning-matching-algorithms.md) | [Match tuning cookbooks](match-tuning-cookbooks.md) |
| **Follow a worked deployment example** | [Match tuning cookbooks](match-tuning-cookbooks.md) | [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) |

---

## By topic

### Scope and sources

| Guide | Topic |
| --- | --- |
| [Configuring sources and scope](configuring-sources-and-scope.md) | Umbrella vs side-car, identity scope, managed sources, aggregation |
| [Source types](source-types.md) | Authoritative, Records, Orphan |

### Map and Define

| Guide | Topic |
| --- | --- |
| [Mapping attributes](mapping-attributes.md) | Merge strategies and per-attribute mapping |
| [Defining attributes](defining-attributes.md) | Velocity, unique IDs, UUIDs, counters |

### Match

| Guide | Topic |
| --- | --- |
| [Matching identities](matching-identities.md) | Match rules, combined score, automatic merge |
| [Managing correlation](managing-correlation.md) | Correlation modes, reverse correlation, enforced roles |
| [Managing reviewers](managing-reviewers.md) | Reviewer assignment, localization, workload |
| [Review forms and reviewers](review-forms-and-reviewers.md) | Review form fields, reports, expiration |
| [Tuning matching algorithms](tuning-matching-algorithms.md) | Algorithm selection and threshold tuning |
| [Match tuning cookbooks](match-tuning-cookbooks.md) | HR+AD, Records pool, Orphan worked examples |

**Runtime behavior:** [Match flow reference](../../reference/match-flow.md)

---

## First-time setup

See [Getting started — Setup checklist](../../getting-started/index.md#setup-checklist). After connection is configured, start with [Configuring sources and scope](configuring-sources-and-scope.md).

**Operations:** [Operation guides overview](../operation/index.md) · **Issues:** [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md)

Contributors: each guide = one topic; link instead of copying workflows from other guides. Verify with `npm run lint:docs-guides`.
