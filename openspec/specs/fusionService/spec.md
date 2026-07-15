# fusionService Spec

## Purpose

The fusion service (`src/services/fusionService/`) is the orchestrator for the Fusion account model: it builds `FusionAccount` instances from managed sources and identity data, blends new managed accounts into existing Fusion accounts, and produces the `FusionReportAccount` / `FusionReportBlend` report records used by the connector's account and report operations. This spec defines the contract for how a managed account becomes a Fusion account, the blending semantics, and the report-side vocabulary that downstream operations consume.

## Requirements



### Requirement: Account Blending Terminology
The system SHALL use the term "blending" to refer to the process of merging a managed account into a Fusion account.

#### Scenario: Blended managed account history log
- **WHEN** a managed account is absorbed into a Fusion account
- **THEN** the Fusion account history SHALL log "Blended managed account [Account Name] ([Source Name])"

### Requirement: Report Tracking of Account Blends
The system SHALL track blending events during processing to populate the aggregation report payload.

#### Scenario: Recording a blending event
- **WHEN** a managed account is successfully set/absorbed into a Fusion account
- **AND** history recording is not skipped for that account key
- **THEN** the system SHALL record a blending event containing the target Fusion account name, link, and the blended account's name and source
