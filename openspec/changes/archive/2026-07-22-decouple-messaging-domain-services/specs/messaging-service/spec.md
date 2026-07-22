## MODIFIED Requirements

### Requirement: MessagingService MUST be deprecated and removed in favor of pure domain services
The `messaging-service` capability SHALL be deprecated and completely removed. Messaging responsibilities MUST be handled directly by `email-service`, `workflow-service`, and `report-service`.

#### Scenario: MessagingService removal
- **GIVEN** the refactored connector codebase
- **WHEN** messaging operations are performed
- **THEN** callers invoke `EmailService`, `WorkflowService`, or `ReportService` directly
