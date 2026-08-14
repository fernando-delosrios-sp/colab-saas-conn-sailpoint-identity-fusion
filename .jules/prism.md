## YYYY-MM-DD - [Prism Readability]
**Learning:** Extract redundant, complex property resolution chains (e.g., repeated optional chaining and type casts like `a?.b || (a as any)?.c || a?.d`) into a dedicated helper function to enforce DRY principles, improve type safety, and enhance code clarity.
**Action:** Identify and replace repeated chains like `(selectedIdentity as any)?.attributes?.displayName` or `readUnknown(attrs, 'email') ?? readUnknown(attrs, 'mail')` with a variadic helper or a clearer resolution.
