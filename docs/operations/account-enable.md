# Account Enable Operation

## Description

The Account Enable operation re-enables a previously disabled fusion account. This process is more complex than a simple flag flip because re-enabling an account might require re-generating unique values (like email aliases) that were released when the account was disabled.

## Process Flow

1.  **Setup**:
    - Loads sources and schema.
    - Initializes attribute counters.

2.  **Global Pre-processing**:
    - **Crucial Step**: Fetches **ALL** fusion accounts.
    - Bulk-registers unique attribute values directly from raw account data to build the collision registry.
    - Pre-processes fusion accounts to populate the identity map.
    - _Why?_ To ensure that when we re-enable this account, we don't assign it a unique value (e.g., `john.doe@example.com`) that has been taken by another account while this one was disabled.

3.  **Fusion Account Rebuild and Unique Attribute Refresh**:
    - Rebuilds the target fusion account with `resetDefinition: True`, which unregisters existing unique attribute values and recalculates them.
    - After rebuild, explicitly refreshes unique attributes (`refreshUniqueAttributes`) to generate collision-free values against the pool registered in Step 2.
    - **Attribute operations** (`ATTR_OPS_RESET`):
        - `refreshMapping`: True — re-evaluates attribute mappings from source accounts.
        - `refreshDefinition`: True — re-evaluates Velocity template definitions.
        - `resetDefinition`: True — unregisters and regenerates unique attribute values.

4.  **Enable**:
    - Sets the account's status to enabled.

5.  **Output Generation**:
    - Returns the updated, enabled ISC account.

## Behavior Notes

- **Unique attribute reset**: Enabling a Fusion account uses `ATTR_OPS_RESET` (`resetDefinition: true`), which unregisters the account's existing unique attribute values and recalculates them. An explicit `refreshUniqueAttributes` pass follows the rebuild to resolve any collisions against the global registry collected in the pre-processing step. This guarantees the re-enabled account receives collision-free values even if its previous values were reassigned while it was disabled.
- **Changeable unique attributes**: Use regular unique attribute schemas (e.g. usernames, email aliases) to define attributes you want refreshed on enable/disable cycles. Disabling and then re-enabling a Fusion account is the mechanism that triggers this regeneration.
- **nativeIdentity and name are preserved**: Even though unique attributes are reset, the `nativeIdentity` and account `name` are never changed. The attribute definition engine skips them for identity-linked accounts to prevent disconnection and identity destruction.
