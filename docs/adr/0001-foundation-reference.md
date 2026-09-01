# ADR-0001 — Modular local foundation with replaceable adapters

Status: implemented reference decision; production deployment decisions remain open.

## Context

The owner approved J0 as the first engineering generation and explicitly requires
independence from AI provider, database implementation, device, and user interface.
No authenticated private repository connection or selected deployment service is
available in this session. The next useful artifact must be runnable and testable.

## Decision

Use Python 3.12 with one distribution and thirteen module boundaries. Define
Protocol interfaces and versioned data shapes. Use SQLite with authenticated
record encryption for the local reference and an in-memory adapter for contract
and portability tests. Use two deterministic local model adapters and one
harmless echo tool. Provide a CLI, not a visual application. Run no external
connectors or autonomous agents.

Keep the master key outside the database directory. Derive separate keys for
record encryption and audit authentication. Use versioned portable data export
plus passphrase-encrypted backup to test recovery independently of model and
database choice. Enforce safe defaults and require exact owner approval in
Copilot Mode. Add a host-owner stop path independent of Core/model execution.

## Alternatives and consequences

- A large multi-service deployment would add authentication and operations
  boundaries before the domain contracts have been validated. Defer it.
- A model-provider-managed agent database would make canonical identity and data
  depend on that service. Keep provider state non-authoritative.
- A graph or vector database is not required to prove J0. Define interfaces now;
  select those stores when retrieval and relationship requirements justify them.
- A dedicated hardware or mobile app is unnecessary for the foundation proof.
  Devices authenticate through the future Identity boundary; clients call Core.

This reduces initial infrastructure, but the runtime is not process-isolated,
distributed, independently audit-immutable, or ready for powerful tools. Device
attestation, key rotation, provider adapters, a durable queue, remote identity,
immutable audit, and complete disaster recovery remain explicit follow-up gates.

## Validation

See tests/test_foundation.py, the CLI demo, and docs/STATUS.md. Evidence includes
swapping model adapters without losing stored data and restoring canonical data
into a different RecordStore implementation with the same owner/data UUIDs.
