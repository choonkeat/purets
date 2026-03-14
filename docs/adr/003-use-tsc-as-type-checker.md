# ADR-003: Use tsc as the type checker

**Status:** Accepted (approach evolved but core decision stands)

**Date:** 2026-03-14

## Context

If the type syntax is TypeScript-compatible, we could potentially leverage `tsc` itself rather than building a custom type checker. Three options were on the table:

1. **TypeScript as the type engine** — generate `.ts`, run `tsc`
2. **TS-inspired syntax, custom checker** — looks like TS but we parse and check ourselves
3. **Generate Zod schemas** — type block → Zod → validate at runtime

## Decision

Use `tsc` directly. The mechanism:

1. Parse the `.tjson` file (extract type block from `/* ... */` and tagged values)
2. Generate a temporary `.ts` file: types + `const _v0: TypeName = { ... }` for each value
3. Run `tsc --noEmit --strict` on the temp file
4. Map errors back to original `.tjson` line numbers
5. Clean up temp file

This was validated with a working prototype in ~130 lines of code. TypeScript catches missing fields, wrong types, extra fields, invalid union values — all for free.

## Evolution

This approach was later simplified when the file format changed to `.pure.ts` (see ADR-004). Since `.pure.ts` files are valid TypeScript, the temp file generation step was eliminated — `tsc` runs directly on the source file.

Later still (ADR-005), we switched from shelling out to `tsc` to using the TypeScript compiler API programmatically (`ts.createProgram`), which enabled inferred return type checking.

## Consequences

- TypeScript is a runtime dependency
- We get the entire TS type system for free: generics, unions, tuples, mapped types, utility types
- Error messages come from `tsc` — familiar to TS developers
- No need to build or maintain our own type checker
