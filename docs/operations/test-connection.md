# Test Connection Operation

## Description

The Test Connection operation verifies that the connector is correctly configured and can communicate with required services (ISC API).

## Process Flow

```mermaid
flowchart TD
    Start([Test connection invoked]) --> Init[Initialize connector services]
    Init --> Sources[Verify managed sources exist]
    Sources --> JMES[Validate JMESPath filters]
    JMES --> Email{Email workflow configured?}
    Email -- Yes --> EmailWF[Validate email workflow sender]
    Email -- No --> Delay{Delayed aggregation configured?}
    EmailWF --> Delay
    Delay -- Yes --> WF[Validate delayed-aggregation workflow]
    Delay -- No --> Rev{Reverse correlation configured?}
    WF --> Rev
    Rev -- Yes --> Schema[Validate reverse-correlation setup per source]
    Rev -- No --> OK[Return success]
    Schema --> OK
    Init -- Failure --> Err([Throw error])
    Sources -- Missing source --> Err
    JMES -- Invalid expression --> Err
    EmailWF -- Missing sender --> Err
    WF -- Missing workflow --> Err
    Schema -- Setup validation failed --> Err
```


## Architecture diagram

![Test Connection architecture diagram](../assets/images/operations/testConnection.png)

1.  **Execution**:
    - The operation is invoked by ISC.
    - It verifies access to the Fusion source and ensures that all configured managed sources exist.
    - It validates configured `Accounts JMESPath filter` expressions.
    - When email workflow delivery is configured, it validates that the email workflow sender is reachable.
    - If any source is configured for delayed aggregation, it validates delayed-aggregation workflow/sender availability.
    - If any sources are configured for reverse correlation, it validates reverse-correlation setup for each such source. Failures name the source and correlation attribute.
    - If the service registry, basic initialization, and these connectivity checks succeed, the connection is considered healthy.

2.  **Output**:
    - Returns an empty success response `{}`.
    - If any initialization step or connectivity check failed (e.g., missing API permissions, missing managed source), an error is thrown, signaling failure.

