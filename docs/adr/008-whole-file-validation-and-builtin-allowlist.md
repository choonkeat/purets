# ADR-008: Whole-file validation and approved built-in operations

## Status

Accepted. Supersedes ADR-007's traversal and name-only operation policy.

## Context

Review of commit `1f6c4b7` found five gaps: default expressions were skipped,
object methods escaped statement rules, bracket access bypassed method bans,
function constructors remained reachable through properties, and unlisted
standard operations such as `Object.freeze` and `RegExp.test` changed caller
state. All nine original reproductions passed the CLI while its 48 tests passed.

Adding individual forbidden names cannot establish a purity guarantee.

## Decision

1. Walk the complete source tree once for subset rules. Check every runtime
   function form, including methods and accessors. Defaults and binding patterns
   participate in the same walk. Infer return types for nested functions too.
2. Reject known unsafe member access before invocation, including literal bracket
   access and destructuring. Preserve the existing conservative name-based
   mutator diagnostics. Reject constructor/prototype access.
3. Resolve callable types using TypeScript and admit standard-library callable
   declarations only through an explicit owner/member allowlist. Check references
   as well as calls, so extracting a forbidden function or passing it to an array
   callback does not bypass the policy. Unapproved built-in methods, including
   RegExp state changes, are refused. Calls through `any` and dynamic Function
   values are refused. Ordinary local functions and typed callback parameters
   continue to be supported under the input contract below.
4. Use the same operation analysis in CLI validation and the editor's
   `validateContent`. The editor's compiler host substitutes unsaved contents;
   files are not written to disk for validation. Monaco still supplies normal
   TypeScript diagnostics in the editor.
5. Add tests for all nine reproductions, alternative syntax, aliases, callbacks,
   inferred return types, and safe operations that must remain accepted.

## Consequences and remaining limits

This is a stricter checker, not a formal effect system or a security boundary.
The allowlist governs **standard-library callable declarations**; it does not
prove the behavior of arbitrary functions described by user-written types.

- Imported dependencies are still not recursively validated. A filename suffix
  is not evidence of purity; re-exports also need a future module-boundary audit.
- Functions and objects supplied by unchecked callers must be pure. Getters,
  proxies, changed built-ins and side-effecting callbacks violate that contract.
- Structural type annotations can hide where object methods originated. A future
  platform guarantee needs verified call provenance across assignments, object
  shapes, imports and callbacks, not only signature declarations.
- Approved operations may throw (for example JSON parsing), and recursion may
  fail to terminate. Totality is not established.
- Unlisted standard-library operations are rejected even when some uses are pure.
  Add an operation only after reviewing its state changes, callback behavior,
  coercions and dependence on ambient state. Include safe and unsafe tests.
- Name-based mutator and prototype checks remain conservative: a pure custom
  method with one of these names can still be refused.
- Editor validation now creates a TypeScript program for operation analysis,
  which adds work per validation request. Caching can be considered separately.

A stronger design should first define the accepted data and function boundary,
validate the complete module graph, and reject calls whose effects cannot be
established. Until then, documentation must describe checks and assumptions
instead of claiming a platform purity guarantee.
