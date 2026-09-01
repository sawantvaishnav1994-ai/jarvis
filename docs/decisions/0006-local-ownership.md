# ADR-0006 — Local-first ownership and encrypted development secrets

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Use owner-controlled files/database, encrypted payloads, environment-scoped secret references and a master key outside the project vault. Keep external actions and cloud processing disabled in J0.1.

## Why

The Master Definition makes identity/data/key ownership independent of providers or hosted interfaces.

## Alternatives considered

Plaintext environment templates; credentials in ordinary SQL; provider-owned memory.

## Consequences

The development host account remains trusted. Hardware-backed key custody, encrypted backup/restore and authenticated owner export/delete are later gates. Developer metadata is not fully hidden by content encryption.
