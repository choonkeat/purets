# ADR-005: Restricting the TypeScript subset

**Status:** Accepted

**Date:** 2026-03-14

## Context

Since `.pure.ts` files are valid TypeScript, a user could write anything: functions, classes, imports, control flow. We needed to enforce that only a subset of TS is allowed.

The question evolved through several stages:
1. Initially: only `type` declarations and typed `const` values
2. Then: what about functions? They're useful alongside data
3. First resolution: allow pure arrow functions only, ban `function` keyword
4. Revised: allow both `function` declarations and arrow functions, ban `this` instead

## Decision

### Two-pass validation

**Pass 1: AST-based subset validation** (using TypeScript compiler API)

Walk the syntax tree and check that every top-level statement is one of:
- `type` declaration
- `const` declaration (with type annotation or arrow/function expression)
- `function` declaration (pure — no `this`, no `async`, no generators)

Everything else is rejected with a clear error message.

**Pass 2: Type checking** (using `ts.createProgram`)

Standard TypeScript type checking plus custom checks on inferred return types.

### What's allowed

- `type` declarations (aliases, unions, generics, tuples — full TS type syntax)
- `const` with type annotations (data values)
- `const` with arrow functions (pure functions)
- `function` declarations (pure functions — no `this`, no generators)
- `export` on types, const, and functions (named exports only)
- `import { x } from "./file.pure.ts"` (only from other `.pure.ts` files)

### What's banned

**Constructs:** `class`, `interface`, `enum`, `namespace`, `let`, `var`, `declare`

**Control flow:** `if`, `for`, `while`, `do`, `switch`, `try`, `throw`, `return`, `break`, `continue`

**Impurity signals:**
- `this` keyword (anywhere — functions must be stateless)
- `async` / `await` keywords
- Generator functions (`function*`)
- IO globals: `console`, `fetch`, `process`, `window`, `document`, `setTimeout`, `setInterval`, etc.
- Return types: `void`, `any`, `never`, `unknown`, `Promise` (both explicit and inferred)

**Import/export restrictions:**
- Can only import from `.pure.ts` files (transitive purity)
- Default imports banned
- `export default` banned
- Named exports allowed

### Why AST-based, not regex

Originally used regex line scanning. Switched to TypeScript's AST (`ts.createSourceFile` + tree walking) because:
- No false positives from string contents
- Can distinguish `const x: T = value` from `const f = () => ...`
- Can check inferred return types via `checker.getReturnTypeOfSignature()`
- More maintainable and precise

## Alternatives considered

- **Don't restrict at all** — defeats the purpose of purity
- **Regex-based validation** — used initially, replaced with AST for precision
- **Separate file types** (`.data.ts` for data, `.fn.pure.ts` for functions) — unnecessary complexity
- **Ban all functions** — too restrictive; derived data and smart constructors are valuable
- **Arrow functions only** — initially chosen, but `function` keyword isn't the problem, `this` is. Standard functions offer better stack traces, hoisting, and familiarity

## Note on Promise.resolve()

`Promise.resolve()` is technically pure, but we ban `Promise` return types anyway. The reasoning: if you need Promise, you're likely doing IO. The edge case isn't worth the complexity of distinguishing pure Promise usage.

## Consequences

- Validation is precise and gives good error messages
- Users get a clear "allowed subset" they can learn
- Purity is enforced at the language level, not just by convention
- The validator runs before type checking, so errors are reported in priority order
- In the web editor, the same rules apply via a parallel Monaco marker source
