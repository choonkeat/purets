# ADR-007: Enforcing purity inside function bodies

**Status:** Accepted; traversal and operation policy superseded by [ADR-008](008-whole-file-validation-and-builtin-allowlist.md).

**Date:** 2026-09-20

## Context

ADR-005 described a two-pass validator and listed what is banned. The
implementation only applied the statement-kind rules to `sourceFile.statements`
— the *top level* of the file. Inside a function body nothing walked the
statements; the only deep scan was `checkForBannedGlobals`, which looked for
exactly three things: banned global identifiers, `this`, and type assertions.

So every rule ADR-005 claimed was enforced could be sidestepped by putting the
code one level down, inside a function. All of these passed `purets check`:

```ts
export function addItem(xs: number[]): number[] {
  xs.push(1)          // mutates the caller's array
  return xs
}

export function bump(b: { n: number }): number {
  b.n = b.n + 1       // assignment
  return b.n
}

export function total(xs: number[]): number {
  let sum = 0         // `let`
  for (let i = 0; i < xs.length; i++) { sum += xs[i] ?? 0 }
  return sum
}

export function positive(n: number): number {
  if (n < 0) { throw new Error("neg") }   // control flow + throw
  return n
}

export const now = (): number => Date.now()       // non-deterministic
export const roll = (): number => Math.random()   // non-deterministic
export const eight = (): number => eval("4 + 4")  // arbitrary code
```

A purity checker that accepts `xs.push(1)` inside a function cannot be the basis
of a platform guarantee, so the checks needed strengthening before anything is
built on top of them.

## Decision

### 1. The statement rules recurse into every function body

`validateFunctionBody` walks the statements of every function body — top-level
`function` declarations, arrow functions, function expressions, and functions
nested inside callbacks. A body may contain only:

- `const` declarations (`let`/`var` rejected as at the top level)
- `return`
- `if` / `switch` / blocks (branching is pure; their branches are walked too)

Everything else is rejected. In particular:

- **Expression statements** — a statement whose result is discarded exists only
  for its side effect.
- **Loops** — without `let` a loop cannot accumulate anything. `map`/`filter`/
  `reduce` cover the useful cases.
- **`throw` / `try`** — a function that throws is partial, not a total function
  from input to output. Return a union (`T | null`, `Result<T>`) instead.

Branching had to be allowed: the existing `valid-json-parse-narrowed.pure.ts`
fixture uses `if` for type narrowing, which is exactly the pattern ADR-005's
"JSON.parse returns unknown" rule pushes people toward. ADR-005's banned list
said `if` was banned; in practice it was only ever banned at the top level, and
that is the rule we keep.

### 2. Mutation is rejected as an expression, at any depth

The deep scan now also rejects:

- assignment operators (`=`, `+=`, `??=`, …) and `++` / `--`
- the `delete` operator
- calls to in-place methods: `push`, `pop`, `shift`, `unshift`, `splice`,
  `sort`, `reverse`, `fill`, `copyWithin`, `set`, `add`, `delete`, `clear`
- `Object.assign`, `Object.defineProperty`, `Object.defineProperties`,
  `Object.setPrototypeOf`

This is deliberately a *name-based* check on the method, not a type-directed
one. It runs in pass 1, which has no type checker, and it errs toward rejecting:
a user-defined method called `.set()` is refused even if it is pure. The
alternative — resolving every call through the checker in pass 2 — costs more
than it buys for a subset with no classes.

To keep the pure alternatives available, the compiler target moved from ES2020
to ES2023 so `toSorted`, `toReversed`, `toSpliced` and `with` exist.

### 3. Determinism and escape hatches

`BANNED_GLOBALS` gained `Date`, `crypto`, `performance`, `navigator`,
`location`, `history`, `globalThis`, `queueMicrotask`,
`requestAnimationFrame`, `eval`, `Function`, `Reflect`, `Proxy`, and
`Math.random` is rejected as a member access. `new` and `class` expressions are
rejected anywhere, as are `await`, `yield` and `super`.

Because the global list now contains common words (`Date`, `history`,
`location`), identifier matching is restricted to reference positions —
`{ Date: 1 }`, `x.Date` and `const Date = ...` no longer false-positive.

### 4. Errors are deduplicated and sorted

One violation can now be reached by both the statement walk and the deep scan
(`xs.push(1)` is both an expression statement and a mutating call). Both
messages are useful, but identical `line + message` pairs are collapsed, and
errors are sorted by line.

## Consequences

- `validateContent` is the single source of truth and is what the web editor
  imports, so the editor's Monaco markers get all of this for free.
- The subset is meaningfully smaller: no loops, no `throw`, no `new`, no
  `Date`. Code that needs those belongs in a regular `.ts` file.
- Some pure code is now rejected (a user-defined `.set()`, a pure
  `new`-construction). This is the intended trade: a purity guarantee is only
  worth having if it fails closed.
- 12 regression fixtures cover the holes listed above.

## Still open

These remain unenforced and would need a type-directed pass:

- Shadowing a banned name (`const Date = 0` is rejected as a declaration name,
  but a parameter named `history` used purely is also rejected — conservative,
  not unsound).
- Mutation through an aliased binding that the name-based method list misses.
- Purity of a `.pure.ts` module's *dependencies* beyond the `.pure.ts` filename
  check.
