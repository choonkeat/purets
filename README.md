# purets

**TypeScript minus minus** — a pure subset of TypeScript for typed data and functions.

`.pure.ts` files are valid TypeScript with one constraint: everything must be pure. No side effects, no IO, no mutation — just types, data, and functions.

## Why?

Large TypeScript codebases mix everything: API calls, DOM manipulation, state mutation, and business logic all in the same files. `purets` lets you carve out **pure islands** in your codebase — modules where the rules are strict and the guarantees are strong.

Think of it as `"use strict"` for purity. Your `.pure.ts` files are guaranteed to:
- Have no side effects
- Import only from other `.pure.ts` files (transitive purity)
- Contain no IO (`fetch`, `console`, `process`, etc.)
- Use only `const` (no `let`/`var`), and never mutate a value
- Be deterministic (no `Date`, `Math.random`, `crypto`)
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
| `class` / `new` | Encapsulates mutable state |
| `interface` | Use `type` instead |
| `enum` | Use union types instead |
| `let` / `var` | Mutation |
| `this` / `super` | Stateful, impure |
| `async` / `await` / `yield` | IO |
| `console`, `fetch`, `process`, `window` | Side effects |
| `Date`, `Math.random`, `crypto`, `performance` | Non-deterministic |
| `eval`, `Function`, `Reflect`, `Proxy`, `globalThis` | Escape hatches out of the subset |
| `x = y`, `x += y`, `x++`, `delete x.k` | Mutation |
| `.push()`, `.sort()`, `.splice()`, `.set()`, … | Mutate in place — use `[...xs, x]`, `xs.toSorted()` |
| `Object.assign`, `Object.defineProperty` | Mutate their argument — use object spread |
| `import` from non-`.pure.ts` | Breaks purity chain |
| `export default` | Use named exports |
| Statements at top level other than `type`/`const`/`function`/`import`/`export` | Nothing to execute at load time |
| Statements inside a function other than `const`, `return`, `if`, `switch` | Loops need mutation; `throw` makes the function partial; a discarded expression is a side effect |
| Return type `void`/`any`/`never`/`Promise` | Must return concrete data |

These rules apply at every depth — inside function bodies and inside callbacks passed to `.map()`, `.filter()` and friends, not just at the top level.

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

1. **AST validation** — walks the syntax tree (top level *and* every function body) to enforce the subset rules
2. **Type checking** — runs `tsc` with `--strict` for full type safety
3. **Return type analysis** — checks inferred return types of functions

No custom parser, no transpilation, no runtime. Just TypeScript with guardrails.

## License

MIT
