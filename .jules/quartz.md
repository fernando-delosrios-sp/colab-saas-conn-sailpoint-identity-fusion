## 2026-05-15 - Consolidating ISC Object Attribute Extraction
**Learning:** When parsing raw ISC entitlement representations (often arrays of `{id}`, `{value}`, or `{name}` objects), logic to extract the actual identifier string is often duplicated across different mapping functions.
**Action:** Extract this `readUnknown(item, 'id') ?? readUnknown(item, 'value') ?? readUnknown(item, 'name')` fallback chain into a dedicated `extractObjectValue` helper to ensure consistency, improve readability, and keep extraction loops DRY.
