## 2024-05-02 - [Authentication Bypass via console.assert]
**Vulnerability:** The proxy authentication check (`assert(serverPassword === clientPassword, ...)`) in `ProxyService` was using `console.assert` instead of a custom error-throwing assertion utility. `console.assert` in Node.js only prints to stderr and does NOT throw an error or halt execution, allowing requests to proceed even with incorrect passwords.
**Learning:** Node.js `console.assert` behavior differs from browser `console.assert` or assertion libraries, leading to silent authentication bypass if used for critical security logic. Always verify that assertion functions actually throw errors in the runtime environment.
**Prevention:** Use a dedicated assertion library or a custom utility (`src/utils/assert.ts` in this project) that explicitly throws errors. Search for and eliminate any direct imports of `assert` from `console` for control flow or security checks.

## 2024-05-03 - [Timing Attack in Proxy Password Comparison]
**Vulnerability:** The proxy authentication check in `ProxyService` compared the user-provided password and the configured password using the standard `===` operator.
**Learning:** String comparison with `===` fails fast (it returns false as soon as it encounters the first non-matching character). An attacker could exploit this by making multiple requests and analyzing the time it takes for the server to reject them, deducing the password character by character.
**Prevention:** Always use constant-time comparison methods, such as `crypto.timingSafeEqual`, when comparing sensitive strings like passwords or tokens. Convert the strings to `Buffer`s first, ensure they have the same length (to avoid `crypto.timingSafeEqual` throwing an error), and then perform the comparison.
