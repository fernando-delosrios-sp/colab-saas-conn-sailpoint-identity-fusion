## Context

The Velocity template engine inside the IDN simulator/mock environment currently exposes several helper objects in its context (e.g., `Datefns`, `Math`, `AddressParse`, `Normalize`, `JSON`). Real IdentityNow Velocity templates often rely on Java's `String` class to perform string manipulations. By adding the Javascript `String` class to our Velocity context, we provide parity for templates that use `$String` to access static string utilities or to cast/manipulate string values.

## Goals / Non-Goals

**Goals:**
- Add Javascript `String` object to the Velocity context.
- Support basic `$String` usages in Velocity templates.
- Ensure existing context helpers continue to function correctly.

**Non-Goals:**
- Provide a perfect 1:1 mapping of Java's `java.lang.String` static methods. The JS `String` object has different methods, but it's sufficient for basic needs.
- Rewrite or polyfill all Java String methods.

## Decisions

### D1: Expose Native Javascript `String` directly
- **Choice**: Export the global `String` object in `contextHelpers`.
- **Reason**: It is lightweight and matches how `Math` is currently exposed. It immediately provides utility functions and constructor access without needing to maintain a custom wrapper.
- **Alternative considered**: Create a custom `StringHelper` class mimicking `java.lang.String`. *Rejected* because it's higher maintenance and JS `String` handles the majority of use-cases fine in a JS environment.

## Risks / Trade-offs

- **[Trade-off] Javascript String vs Java String** -> JS `String` methods differ slightly from Java's (e.g., `valueOf`, `format` vs template literals). We accept this because users typically use it for simple casting or native JS operations when running in this mock, rather than expecting deep JVM parity.

## Migration Plan

N/A — This change only adds a helper to the context; it doesn't break existing templates or involve deployment changes.

## Open Questions

None
