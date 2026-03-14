# ADR-002: Types in block comments with GraphQL-like syntax

**Status:** Superseded by ADR-004

**Date:** 2026-03-14

## Context

JSDoc's adoption proved that developers are willing to write types in comment blocks. JSON5/JSONC normalized comments in JSON (VS Code uses JSONC everywhere).

We needed a type definition format that was familiar and didn't require learning something new.

## Decision

Types live in `/* ... */` block comments at the top of a `.tjson` file, using a GraphQL-inspired syntax to "pander" to the millions of devs who know it:

```jsonc
/*
  type User {
    name: string
    age: number
  }
*/

// User
{ "name": "Alice", "age": 30 }
```

Key choices:
- **Block comments** preferred over single-line `//` for multi-line type definitions
- **GraphQL-like syntax** for type bodies (`type Name { field: Type }`)
- **TypeScript scalar types** (`string`, `number`, `boolean`) over GraphQL's (`String`, `Int`, `Float`) because JSON doesn't distinguish int vs float
- **TS-style unions** (`"admin" | "user"`) over GraphQL enums
- **`// TypeName` comments** tag each JSON value with its type
- **Multiple types and values in one file** — like an Elm module, not scattered files

## Alternatives considered

- **Types in separate file** — decided against because co-location is better for authoring ergonomics
- **Types inline with values** (like JSDoc on each field) — too noisy
- **Pure JSON for types** (like JSON Schema) — too verbose

## Consequences

- File format is JSONC-compatible
- Types and values live together in one file
- CLI parses block comment for types, extracts tagged values
- Need to convert to something a type checker can process
