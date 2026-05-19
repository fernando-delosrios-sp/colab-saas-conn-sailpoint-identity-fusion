## 2024-05-03 - Stack Trace Exposure in FormService

**Vulnerability:** Explicit logging of error stack traces (`error.stack`) during form definition creation in `FormService`, which could leak internal implementation details if logs are inadvertently exposed.
**Learning:** While stack traces should not be globally suppressed in core logging services as this ruins observability, explicit statements that write `.stack` to the logs in specific services handling external/API failures can needlessly risk exposing internals.
**Prevention:** Avoid manually appending `.stack` to log messages in service-level catch blocks. Let the global logger decide how to serialize Error objects securely.

## 2024-05-02 - [Authentication Bypass via console.assert]

**Vulnerability:** The proxy authentication check (`assert(serverPassword === clientPassword, ...)`) in `ProxyService` was using `console.assert` instead of a custom error-throwing assertion utility. `console.assert` in Node.js only prints to stderr and does NOT throw an error or halt execution, allowing requests to proceed even with incorrect passwords.
**Learning:** Node.js `console.assert` behavior differs from browser `console.assert` or assertion libraries, leading to silent authentication bypass if used for critical security logic. Always verify that assertion functions actually throw errors in the runtime environment.
**Prevention:** Use a dedicated assertion library or a custom utility (`src/utils/assert.ts` in this project) that explicitly throws errors. Search for and eliminate any direct imports of `assert` from `console` for control flow or security checks.

## 2024-05-03 - [Timing Attack in Proxy Password Comparison]

**Vulnerability:** The proxy authentication check in `ProxyService` compared the user-provided password and the configured password using the standard `===` operator.
**Learning:** String comparison with `===` fails fast (it returns false as soon as it encounters the first non-matching character). An attacker could exploit this by making multiple requests and analyzing the time it takes for the server to reject them, deducing the password character by character.
**Prevention:** Always use constant-time comparison methods, such as `crypto.timingSafeEqual`, when comparing sensitive strings like passwords or tokens. Convert the strings to `Buffer`s first, ensure they have the same length (to avoid `crypto.timingSafeEqual` throwing an error), and then perform the comparison.

## 2024-05-03 - [Timing Attack on Password Length Comparison]

**Vulnerability:** The proxy password verification logic first performed a short-circuiting length equality check (`serverBuffer.length === clientBuffer.length`) before calling `crypto.timingSafeEqual()`. This allowed an attacker to determine the exact length of the expected password through timing differences, as incorrect lengths would return faster.
**Learning:** Checking string lengths before using `crypto.timingSafeEqual` completely nullifies the security benefits of constant-time comparison. While `crypto.timingSafeEqual` throws an error on unequal length inputs, falling back to a short-circuit comparison is unsafe.
**Prevention:** Always convert both sensitive strings (passwords, tokens) to fixed-length representations (e.g., SHA-256 hashes) using `crypto.createHash` before comparing them with `crypto.timingSafeEqual`. This ensures the inputs always have identical lengths and the comparison occurs in constant time regardless of the original inputs.

## 2026-05-09 - Fix SSRF Vulnerability in ProxyService

**Vulnerability:** The ProxyService (`src/services/proxyService.ts`) fetched data directly from a user-configured `proxyUrl` without validating the scheme, making it vulnerable to Server-Side Request Forgery (SSRF) if a user supplied a malicious URL scheme like `file://` or an internal metadata endpoint.
**Learning:** External or user-provided URLs must always be validated prior to making network requests, especially in Node.js where `fetch` or HTTP clients might attempt to resolve arbitrary schemes or hostnames.
**Prevention:** Enforce strict URL scheme validation (e.g., checking for `http://` or `https://`) whenever initializing requests with configured URLs.

## 2026-05-17 - Log Injection via Control Characters

**Vulnerability:** The `sanitizeLog` function in `log-server.js` only stripped `\r` and `\n` characters to prevent Log Injection attacks. An attacker could bypass this by using other Unicode line terminators (like \u2028 or \u2029) or ASCII control characters (like \u0085 Next Line) to inject new log entries. Additionally, passing non-string data (e.g., an array or object without a `replace` method) would crash the server, causing Denial of Service.
**Learning:** Robust sanitization must handle type coercion explicitly before executing string methods. It must also account for a comprehensive range of ASCII control characters and Unicode line separators, not just `\r\n`.
**Prevention:** Convert unknown input explicitly to strings (e.g., using `String()`) before executing string prototype methods. Utilize comprehensive regular expressions (e.g., `/[\x00-\x08\x0A-\x1F\x7F\u0085\u2028\u2029]+/g`) to sanitize log injection attack vectors thoroughly.

## 2026-05-19 - Information Disclosure in log-server.js Endpoint

**Vulnerability:** The `/` health check endpoint in the `log-server.js` proxy inadvertently included the `logFile` property in its JSON response payload. This exposed the internal host file system directory structure (e.g., `logs/remote-logs.txt`) directly to unauthenticated clients over HTTP.
**Learning:** Returning debug information or configuration parameters (like file paths) in public-facing health check API endpoints constitutes an Information Disclosure vulnerability.
**Prevention:** Sanitize API responses by explicitly omitting sensitive internal configuration keys (like local file paths, connection strings, or system architectures) from outbound HTTP payloads.
