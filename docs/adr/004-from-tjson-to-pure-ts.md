# ADR-004: From .tjson to .data.ts to .pure.ts

**Status:** Accepted

**Date:** 2026-03-14

## Context

The original `.tjson` format used block comments for types and `// TypeName` tags for values with JSON syntax (`"name": "Alice"`). This worked but had friction:

- Required format conversion: `.tjson` → temp `.ts` → tsc → map errors back
- JSON required quoted keys (`"name"` not `name`)
- The block comment wrapper was custom syntax that no editor understood natively

The insight: since we're using TypeScript types and `tsc` as the checker, why not just make the file valid TypeScript?

## Decision

### Phase 1: .tjson → .data.ts

Drop the block comment wrapper. Files become valid TypeScript:

```ts
type User = {
  name: string
  age: number
}

const alice: User = { name: "Alice", age: 30 }
```

- Types are top-level `type` declarations
- Values are `const` with type annotations
- Unquoted keys (TS object literal syntax, not JSON)
- `tsc` runs directly on the file — no temp file needed
- Editors give free TS syntax highlighting and type checking

### Phase 2: .data.ts → .pure.ts

Renamed to `.pure.ts` when we added pure function support (ADR-005). "Pure" better describes the core constraint: everything in the file is pure (no side effects, no IO).

## Alternatives considered

- **Keep `.tjson`** — worked but required custom tooling at every level
- **`.tson`** (TypeScript Object Notation) — catchy but not a real TS file
- **`.ts` with conventions** — too easy to accidentally include in normal TS compilation

## Consequences

- Files are valid TypeScript — editors work out of the box
- No format conversion needed in the CLI
- Save in the web editor writes TS directly back to disk
- The tool becomes a "linter for a TS subset" rather than a "typed JSON checker"
- Need a validator to restrict what TS features are allowed (see ADR-005)
