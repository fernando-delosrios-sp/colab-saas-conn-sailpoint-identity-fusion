# Test Connection Operation

## Description

The Test Connection operation verifies that the connector is correctly configured and can communicate with required services (ISC API).

## Process Flow

1.  **Execution**:
    - The operation is invoked by ISC.
    - It verifies access to the Fusion source and ensures that all configured managed sources exist.
    - If any sources are configured for reverse correlation, it validates that the specified reverse correlation attributes exist in those managed sources' schemas.
    - If the service registry, basic initialization, and these connectivity checks succeed, the connection is considered healthy.

2.  **Output**:
    - Returns an empty success response `{}`.
    - If any initialization step or connectivity check failed (e.g., missing API permissions, missing managed source), an error is thrown, signaling failure.
