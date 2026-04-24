# Account Update Operation

## Description

The Account Update operation applies changes to a fusion account. Currently, it primarily supports **entitlement-based actions** (like "report", "fusion", "correlate") which are modeled as entitlement adds/removes in ISC.

## Process Flow

1.  **Input Validation**:
    - Verifies that the `identity` (ID) and `changes` list are provided.
    - Loads sources and schema.

2.  **Fusion Account Rebuild**:
    - Fetches the current fusion account, identity, and linked source accounts without recomputing any attribute values.
    - **Attribute operations** (`ATTR_OPS_NONE`):
        - `refreshMapping`: False — preserves existing mapped attribute values.
        - `refreshDefinition`: False — preserves existing Velocity-defined attribute values.
        - `resetDefinition`: False — unique values are not touched.

3.  **Change Processing**:
    - Iterates through the list of requested changes.
    - Checks if the change is for the `actions` attribute.
    - **Action Execution**:
        - **Report**: Generates a fusion report.
        - **Fusion**: Adds or removes the fusion tag.
        - **Correlated**: Manually triggers correlation logic.
    - Unsupported attributes or actions result in an error.

4.  **Output Generation**:
    - Returns the updated ISC account state.

## Behavior Notes

- **No attribute refresh on update**: The account is rebuilt with `ATTR_OPS_NONE` (`refreshMapping: false`, `refreshDefinition: false`), preserving all existing attribute values including `nativeIdentity` and account `name`. The update operation only processes entitlement changes (actions) and does not regenerate attributes.
