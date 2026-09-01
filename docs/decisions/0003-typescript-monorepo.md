# ADR-0003 — TypeScript modular monorepo

Date: 2026-09-01
Status: accepted for J0.1 implementation; Foundation v1 GO not issued

## Decision

Use npm workspaces, strict TypeScript, project references, Node services and a Next.js interface. This supersedes ADR-0001’s language/package choice for the active application. Preserve the Python 0.2 reference and its history.

## Why

The owner explicitly revised J0.1 to a TypeScript-first modular monorepo with replaceable interfaces.

## Alternatives considered

Continue Python only; independent repositories; introduce a task orchestration framework immediately. npm workspaces and tsc project references meet the current dependency graph without another build system.

## Consequences

Core is independent of UI, provider SDKs and storage. No Python data is automatically migrated. Auth/device/recovery work must be ported behind the new contracts before later gates pass.
