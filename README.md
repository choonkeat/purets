# purets

**TypeScript minus minus** — a pure subset of TypeScript for typed data and functions.

`.pure.ts` files are valid TypeScript with one constraint: everything must be pure. No side effects, no IO, no mutation — just types, data, and functions.

## Why?

Large TypeScript codebases mix everything: API calls, DOM manipulation, state mutation, and business logic all in the same files. `purets` lets you carve out **pure islands** in your codebase — modules where the rules are strict and the guarantees are strong.

Think of it as `"use strict"` for purity. Your `.pure.ts` files are guaranteed to:
- Have no side effects
- Import only from other `.pure.ts` files (transitive purity)
- Contain no IO (`fetch`, `console`, `process`, etc.)
- Use only `const` (no `let`/`var`)
- Return concrete types (no `void`, `any`, `never`)

## The Rules

### Allowed

```ts
// Types — full TypeScript type system
type User = { name: string; age: number }
type Status = "active" | "inactive"
type Result<T> = { ok: boolean; data: T; error: string | null }

// Data values
const alice: User = { name: "Alice", age: 30 }

// Pure functions (both styles)
function greet(user: User): string {
  return "Hello " + user.name
}
const adults = (users: User[]): User[] => users.filter(u => u.age >= 18)

// Imports from other .pure.ts files
import { User } from "./models.pure.ts"

// Named exports
export type { User }
export { greet, adults }
```

### Banned

| Construct | Why |
|-----------|-----|
| `class` | Encapsulates mutable state |
| `interface` | Use `type` instead |
| `enum` | Use union types instead |
| `let` / `var` | Mutation |
| `this` | Stateful, impure |
| `async` / `await` | IO |
| `console`, `fetch`, `process`, `window` | Side effects |
| `import` from non-`.pure.ts` | Breaks purity chain |
| `export default` | Use named exports |
| Control flow at top level | `if`/`for`/`while`/`try` |
| Return type `void`/`any`/`never`/`Promise` | Must return concrete data |

## Quick Start

```bash
# Install
npm install purets

# Check a file
purets check data.pure.ts

# Check with extra tsc flags
purets check data.pure.ts -- --noUnusedLocals

# Launch web editor
purets edit
purets edit ./data --port 8080
```

## Web Editor

`purets edit` launches a browser-based editor with:
- Monaco editor (same as VS Code) with live type checking
- Collapsible file tree
- Real-time error detection for both type errors and purity violations
- Mobile responsive (single-panel on small screens)

## Pure Islands in a Larger Codebase

You don't have to convert your whole project. Use `.pure.ts` for the parts that benefit from purity:

```
src/
  api/
    routes.ts          # regular TS — Express handlers, IO
    middleware.ts       # regular TS — side effects
  domain/
    models.pure.ts     # types + data constructors
    validators.pure.ts # pure validation functions
    transforms.pure.ts # pure data transformations
  utils/
    math.pure.ts       # pure utility functions
    format.pure.ts     # pure string formatting
  index.ts             # regular TS — wires everything together
```

Your regular `.ts` files can import from `.pure.ts` files freely. The purity guarantee flows one way: pure code can't depend on impure code, but impure code can use pure modules.

## How It Works

`purets` uses the TypeScript compiler API directly:

1. **AST validation** — walks the syntax tree to enforce the subset rules
2. **Type checking** — runs `tsc` with `--strict` for full type safety
3. **Return type analysis** — checks inferred return types of functions

No custom parser, no transpilation, no runtime. Just TypeScript with guardrails.

## License

MIT
