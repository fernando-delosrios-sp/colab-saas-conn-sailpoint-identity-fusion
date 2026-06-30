## ADDED Requirements

### Requirement: Operation Must Send Response
The connector operation handler SHALL guarantee that any custom or default operation concludes by explicitly calling `res.send()` or `res.error()`. If an operation completes its logic but fails to invoke either method, the system MUST immediately throw an explicit error to prevent a hanging request.

#### Scenario: Operation succeeds but fails to respond
- **WHEN** a custom operation handler finishes its asynchronous execution cleanly without throwing an exception
- **AND** it has not called `res.send()` or `res.error()` on the provided response object
- **THEN** the system throws a ConnectorError specifying that the operation finished without responding

#### Scenario: Operation responds correctly
- **WHEN** a custom operation handler finishes its asynchronous execution
- **AND** it has called `res.send()` or `res.error()` during its execution
- **THEN** the system completes normally and does not throw any additional errors

#### Scenario: Operation crashes before responding
- **WHEN** a custom operation handler throws an unhandled exception before calling `res.send()` or `res.error()`
- **THEN** the system catches the original exception and throws a ConnectorError wrapping the original failure, without being masked by the missing response check
