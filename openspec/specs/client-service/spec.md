# client-service Spec

## Purpose

The client service (`src/services/clientService/`) is the queued HTTP client used to talk to SailPoint IdentityIQ / ISC. It serializes outbound requests through a priority-aware `ApiQueue` so the connector can throttle, retry, and shed load without overwhelming the upstream. The same queue is used for both the SDK client and the ISC adapter, and exposes stats (`QueueStats`, `QueuedItemInfo`) for observability. This spec defines the contract for queue behavior, priority ordering, and how queued items are dequeued as upstream capacity becomes available.

## Requirements

### Requirement: The client service MUST serialize outbound HTTP requests through a priority-aware queue

The client service MUST funnel every outbound HTTP call to SailPoint (whether via the SDK client or the ISC adapter) through the shared `ApiQueue`. The queue MUST respect the per-item `QueuePriority`, MUST expose `QueueStats` and `QueuedItemInfo` for observability, and MUST dequeue items as upstream capacity becomes available rather than issuing unbounded parallel requests.

#### Scenario: A queued request is dispatched when capacity is available

- **GIVEN** the queue is empty and a new request is enqueued with `QueuePriority.NORMAL`
- **WHEN** upstream capacity is available
- **THEN** the request is dispatched without blocking the caller longer than the queue's settle time
- **AND** a `QueuedItemInfo` entry is observable via the queue stats

#### Scenario: A high-priority request is dispatched before lower-priority ones

- **GIVEN** the queue has two pending items, one with `QueuePriority.NORMAL` enqueued first
- **WHEN** a new item with `QueuePriority.HIGH` is enqueued
- **THEN** the high-priority item is dispatched before the pre-existing normal-priority item
- **AND** the queue stats reflect the new ordering
