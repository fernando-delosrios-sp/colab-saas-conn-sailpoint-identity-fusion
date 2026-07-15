## Why

Currently, Velocity templates in this mock environment only have access to a limited set of helper classes like `Datefns`, `Math`, `AddressParse`, `Normalize`, and `JSON`. However, real IdentityNow deployments extensively use Java's `java.lang.String` methods directly within Velocity templates for various data formatting and casting tasks. By not exposing the `String` class, our simulator creates a gap in capability and parity, preventing users from testing simple `$String` operations. Adding the Javascript `String` class provides a lightweight, immediately useful bridge to close this capability gap without significantly increasing complexity.

## What Changes

**Velocity Context Exposure**
- From: The Velocity context does not expose any `String` class.
- To: The Velocity context will export the global JS `String` object in `contextHelpers`.
- Reason: Parity with IDN capabilities where `$String` manipulations are frequently used in templates.
- Impact: Non-breaking. Any template already attempting to use `$String` will now have access to JS `String` static methods and casting functionality.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `attributeService`: Expose JS `String` object in the Velocity context helpers.

## Impact

The change will modify the `contextHelpers` export in `src/services/attributeService/contextHelpers/index.ts`. It will not break existing code, but it expands the functionality available to any Velocity template evaluated by the `attributeService`. Tests may need to be slightly updated if there are tests asserting exact property counts on context objects, though usually this is not an issue.
