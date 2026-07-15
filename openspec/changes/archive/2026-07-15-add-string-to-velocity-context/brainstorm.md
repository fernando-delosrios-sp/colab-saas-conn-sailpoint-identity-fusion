# Brainstorming: Add String class to Velocity context

## Context
Currently, the Velocity context provides helpers like `Datefns`, `Math`, `AddressParse`, `Normalize`, and `JSON`. In standard SailPoint IdentityNow, users often have access to Java's `String` class (or its methods) in Velocity templates for various string manipulation tasks. In this Node.js/TypeScript environment, we should consider providing the Javascript `String` class in the context so templates can perform similar string operations natively.

## Goals
- Add the `String` class to the `contextHelpers` so that Velocity templates can use `$String`.
- Ensure parity (or closer parity) with the Java-based Velocity engine used in IDN where `$String` or similar string manipulation capabilities are often needed.

## Approaches
**Option 1: Add JS `String` object to context**
Simply export `String: String` in `src/services/attributeService/contextHelpers/index.ts`.
- *Pros*: Very easy to implement. Gives access to static String methods like `$String.fromCharCode()`, `$String.raw()`, and allows casting `$String($val)`.
- *Cons*: JS `String` methods are slightly different from Java `java.lang.String` methods. For instance, `$String.valueOf()` in Java does different things than in JS.

**Option 2: Create a custom `StringHelper` class**
Create a wrapper that provides exact Java-like `java.lang.String` static methods.
- *Pros*: Closer compatibility with IDN rules.
- *Cons*: More effort to maintain.

## Decision
Since `velocityjs` operates in a JS context, users already expect some JS-like behavior or basic static String access. We will go with **Option 1** initially (simply exporting JS `String`), as it matches what was likely done for `Math`.

## Next Steps
- Add `String` to `contextHelpers`.
- Update tests if necessary to verify `$String(...)` works.
