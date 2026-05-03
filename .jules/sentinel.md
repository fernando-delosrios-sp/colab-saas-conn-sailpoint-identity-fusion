## 2024-05-03 - Stack Trace Exposure in FormService
**Vulnerability:** Explicit logging of error stack traces (`error.stack`) during form definition creation in `FormService`, which could leak internal implementation details if logs are inadvertently exposed.
**Learning:** While stack traces should not be globally suppressed in core logging services as this ruins observability, explicit statements that write `.stack` to the logs in specific services handling external/API failures can needlessly risk exposing internals.
**Prevention:** Avoid manually appending `.stack` to log messages in service-level catch blocks. Let the global logger decide how to serialize Error objects securely.
