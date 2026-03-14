# ADR-006: Web editor with Monaco

**Status:** Accepted

**Date:** 2026-03-14

## Context

The TS Playground (https://www.typescriptlang.org/play/) provides an excellent authoring experience. We wanted something similar: a local web-based editor with live type checking, launched from the CLI.

VS Code LSP integration is on the roadmap but the web editor provides immediate value without requiring editor-specific plugins.

## Decision

`datats serve .` launches a local HTTP server that serves a single-page web editor:

- **Left panel:** collapsible file tree (VS Code-style) listing `.pure.ts` files
- **Right panel:** Monaco editor (same editor as VS Code / TS Playground)
- **Toolbar:** filename, error status, save hint, close button

### How type checking works in the editor

Monaco has a built-in TypeScript language service (web worker). Since `.pure.ts` files are valid TypeScript, we load them directly into Monaco as TypeScript. This gives us for free:
- Real-time red squiggles on type errors
- Autocomplete for field names
- Hover for type info

### Two marker sources (parallel validation)

1. **`typescript` owner** (Monaco's built-in) — standard TS type errors
2. **`datats-validator` owner** (ours) — disallowed construct errors

Both show as red squiggles. Monaco merges them visually. The user sees one unified error experience.

If someone writes `function foo() {}`, they may see both our "function not allowed" error AND TS diagnostics about it. This is slightly noisy but not incorrect — both sources are telling you "this shouldn't be here."

### File operations

- Files load as-is (no format conversion)
- Ctrl+S saves the exact editor content back to disk via PUT `/api/file`
- File tree is populated from GET `/api/files`

### Port resolution

Priority order: `--port` CLI flag → `PORT` env variable → default `3000`

### Architecture

The HTML is inlined in `serve.mjs` as a template string. This means:
- Single file serves everything — no build step, no static assets to manage
- Monaco is loaded from CDN
- Server restart required to pick up HTML changes (no hot reload)

## Consequences

- Zero-install editor experience (just `datats serve .`)
- Full TS type checking in the browser, for free
- No build step or bundler needed
- Server must be restarted to pick up code changes in `serve.mjs`
- Monaco CDN dependency for the editor
