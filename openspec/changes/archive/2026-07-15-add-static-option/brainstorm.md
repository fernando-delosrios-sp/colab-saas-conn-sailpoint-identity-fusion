<!--
Raw capture of superpowers:brainstorming output.
-->
# Brainstorm: Add Static Option to Normal Attributes

## Background
The user wants to add a "Static" option to normal attribute definitions. This option will be mutually exclusive with "Refresh on each aggregation?". When "Static" is enabled, the attribute definition will only be considered when no previous value is found. Once a value is found and set, it will be kept forever unless a reset is explicitly requested.

## Decision Chain
- **Q1:** How does this relate to the `refresh` toggle?
  - **A1:** They are mutually exclusive. We should probably represent this either as a third state in a dropdown (e.g., Refresh Policy: Always, On Change, Never/Static), or as two mutually exclusive toggles.
- **Q2:** How does "Static" behave regarding `needsRefresh`?
  - **A2:** Currently, if `needsRefresh` is true, normal attributes are recalculated even if `refresh` is false. If "Static" is enabled, it should ignore `needsRefresh` entirely *if* a value already exists, ONLY recalculating if `fusionAccount.needsReset` is true.

## Design Trade-offs
- We can introduce a `static: boolean` property to `NormalAttributeDefinition`.
- In `processNormalDefinition`, if `definition.static` is true, and `isValidAttributeValue(fusionAccount.attributes[name])` is true, we simply return, ignoring `needsRefresh` (unless `needsReset` is true).
