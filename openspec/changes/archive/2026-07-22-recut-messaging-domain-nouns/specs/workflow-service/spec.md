# workflow-service Spec

## ADDED Requirements

### Requirement: Schedule delayed identity workflows
The `WorkflowService` SHALL schedule delayed identity processing workflows and aggregation tasks, encapsulating workflow execution parameters without exposing messaging or rendering details.

#### Scenario: Workflow scheduling request is accepted
- **GIVEN** valid workflow parameters and target execution time
- **WHEN** `WorkflowService.scheduleWorkflow` is invoked
- **THEN** the workflow execution task is registered with the platform scheduler
- **AND** a valid workflow execution handle is returned
