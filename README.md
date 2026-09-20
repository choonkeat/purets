# purets

**TypeScript minus minus** — a pure subset of TypeScript for typed data and functions.

`.pure.ts` files use a restricted TypeScript subset intended for pure functions and data. The checker rejects common sources of mutation, IO, and unpredictable results. It is not a proof of purity or a security boundary.

## Why?

Large TypeScript codebases mix everything: API calls, DOM manipulation, state mutation, and business logic all in the same files. `purets` lets you carve out **pure islands** in your codebase — modules with explicit restrictions on operations and function bodies.

The checker applies these restrictions to the file being checked:
- Reject known side-effecting syntax and unapproved standard-library functions
- Require import declarations to name `.pure.ts` modules (dependencies are not recursively validated)
- Contain no IO (`fetch`, `console`, `process`, etc.)
- Use only `const` (no `let`/`var`) and reject assignment and known mutation operations
- Reject known sources of nondeterminism (`Date`, `Math.random`, `crypto`)
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
| `Object.assign`, `Object.defineProperty`, `Object.freeze`, `Object.seal`, `Object.preventExtensions` | Mutate their argument — use object spread |
| `import` from non-`.pure.ts` | Breaks purity chain |
| Unapproved standard-library functions, including `RegExp.test` / `RegExp.exec` | May change hidden state; only reviewed operations are admitted |
| `constructor` / `prototype` / `__proto__` access; calling `any` | Can bypass the checked function rules |
| `export default` | Use named exports |
| Statements at top level other than `type`/`const`/`function`/`import`/`export` | Nothing to execute at load time |
| Statements inside a function other than `const`, `return`, `if`, `switch` | Loops need mutation; `throw` makes the function partial; a discarded expression is a side effect |
| Return type `void`/`any`/`never`/`Promise` | Must return concrete data |

These rules cover function bodies, callbacks, parameter defaults, destructuring defaults, object methods and accessors. Member checks cover direct and bracket access. Type-based checks also reject references to unapproved standard-library functions when renamed or passed as callbacks.

Built-in operations use an explicit allowlist in `purets.mjs` (`PURE_LIBRARY_MEMBERS` and `PURE_LIBRARY_GLOBALS`). Supported examples include array `map`/`filter`/`reduce`/`toSorted`, deterministic `Math` operations, `Object.keys`/`entries`, and basic string operations. Unlisted operations are rejected even when a particular use would be safe.

### Limits

The checker does not validate the entire dependency graph, prove that functions terminate or never throw, or establish that caller-supplied functions and objects are pure. TypeScript types describe value shapes, not effects: changing an object's declared type can lose information about where its methods came from. Approved operations assume ordinary data and pure callbacks, without caller-supplied getters, proxies or altered built-ins. Do not treat acceptance as a platform purity guarantee. See [ADR-008](docs/adr/008-whole-file-validation-and-builtin-allowlist.md).

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

Your regular `.ts` files can import from `.pure.ts` files freely. Inputs from unchecked code still need to satisfy the pure-data and pure-callback assumptions described above.

## How It Works

`purets` uses the TypeScript compiler API directly:

1. **AST validation** — walks the syntax tree (top level *and* every function body) to enforce the subset rules
2. **Type checking** — runs `tsc` with `--strict` for full type safety
3. **Operation and return type analysis** — admits reviewed standard-library callable declarations and checks inferred return types of all function forms

The web editor runs the same subset and operation checks against unsaved text; Monaco supplies its ordinary TypeScript diagnostics.

No custom parser, no transpilation, no runtime. Just TypeScript with guardrails.

## License

MIT
