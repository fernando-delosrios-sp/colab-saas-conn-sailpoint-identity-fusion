# Test Connection Operation

## Description

The Test Connection operation verifies that the connector is correctly configured and can communicate with required services (ISC API).

## Process Flow

```mermaid
flowchart TD
    Start([Test connection invoked]) --> Init[Initialize connector services]
    Init --> Sources[Verify managed sources exist]
    Sources --> JMES[Validate JMESPath filters]
    JMES --> Delay{Delayed aggregation configured?}
    Delay -- Yes --> WF[Validate delayed-aggregation workflow]
    Delay -- No --> Rev{Reverse correlation configured?}
    WF --> Rev
    Rev -- Yes --> Schema[Validate reverse-correlation schema attributes]
    Rev -- No --> OK[Return success]
    Schema --> OK
    Init -- Failure --> Err([Throw error])
    Sources -- Missing source --> Err
    JMES -- Invalid expression --> Err
    WF -- Missing workflow --> Err
    Schema -- Missing attribute --> Err
```

1.  **Execution**:
    - The operation is invoked by ISC.
    - It verifies access to the Fusion source and ensures that all configured managed sources exist.
    - It validates configured `Accounts JMESPath filter` expressions.
    - If any source is configured for delayed aggregation, it validates delayed-aggregation workflow/sender availability.
    - If any sources are configured for reverse correlation, it validates that the specified reverse correlation attributes exist in those managed sources' schemas.
    - If the service registry, basic initialization, and these connectivity checks succeed, the connection is considered healthy.

2.  **Output**:
    - Returns an empty success response `{}`.
    - If any initialization step or connectivity check failed (e.g., missing API permissions, missing managed source), an error is thrown, signaling failure.

