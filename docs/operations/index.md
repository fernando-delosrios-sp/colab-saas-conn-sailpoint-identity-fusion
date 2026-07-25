# Connector operations (APIs ISC calls)

This section documents the connector operations that ISC invokes, including connectivity checks, schema and account reads, account lifecycle actions, and entitlement reads.

## Connectivity

- [Test connection](test-connection.md): Validates connector initialization and required service access.
- [Dry-run mode](dry-run.md): Non-persistent account-list analysis for tuning Map, Define, and Match without write side effects.

## Schema and reads

- [Account discover schema](account-discover-schema.md): Returns the account schema used by ISC.
- [Account list](account-list.md): Streams accounts to ISC aggregation.
- [Account read](account-read.md): Reads one account by native identity.

## Account lifecycle

- [Account create](account-create.md): Creates a managed account when provisioning is enabled.
- [Account update](account-update.md): Applies provisioning updates to an existing account.
- [Account enable](account-enable.md): Enables an existing account.
- [Account disable](account-disable.md): Disables an existing account.

## Entitlements

- [Entitlement list](entitlement-list.md): Returns entitlement objects for aggregation.

