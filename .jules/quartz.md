## 2024-05-14 - Simplification Pattern: readFirstUnknown
**Learning:** The `readUnknown` utility is frequently chained with nullish coalescing operators (`??`) to handle multiple potential keys in un-typed or unknown objects. E.g., `readUnknown(obj, 'a') ?? readUnknown(obj, 'b') ?? readUnknown(obj, 'c')`.
**Action:** Replace these chains with a new utility function `readFirstUnknown(source: unknown, keys: string[]): unknown` to improve readability and express intent more cleanly.
