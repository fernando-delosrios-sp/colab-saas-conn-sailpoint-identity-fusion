## 2026-07-14 - URL Hostname Validation
**Vulnerability:** Weak URL validation using string matching (`startsWith`)
**Learning:** Checking URL properties like `startsWith('http://localhost')` allows malicious domains such as `http://localhost.malicious.com` to bypass restrictions, a classic security flaw.
**Prevention:** Always use the built-in `new URL()` class to reliably parse and validate the exact `hostname` property for any access-control decisions.
