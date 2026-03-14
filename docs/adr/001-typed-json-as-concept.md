# ADR-001: Typed JSON as a concept

**Status:** Superseded by ADR-004

**Date:** 2026-03-14

## Context

Elm's type system provides a snappy authoring environment where data values are safely constrained by defined types. The question was: can we bring that experience to JSON?

Some languages (ReasonML, Gleam) take the pragmatic path of adding familiar syntax to FP to reduce adoption friction. The same principle applies here: if people already know JSON, don't force a new format — bring type safety to what they already use.

## Decision

Build a "typed JSON" authoring environment with a CLI type checker. The core idea:
1. Define types that constrain the shape of JSON data
2. Author JSON values within the safe bounds of those types
3. CLI checks values against type definitions

## Alternatives considered

- **JSON Schema** — too verbose, not ergonomic for authoring
- **Custom type language** — adoption friction, another thing to learn
- **Elm/Haskell for data** — too high a barrier for data authoring

## Consequences

- Need to decide on a type definition format
- Need to decide whether types live in the same file as data or separately
- The tool should feel "snappy" like Elm's compiler — fast feedback loop
