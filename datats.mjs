#!/usr/bin/env node

import ts from "typescript";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// IO-related globals that indicate impurity
const BANNED_GLOBALS = new Set([
  "console", "fetch", "require", "process", "window", "document",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "XMLHttpRequest", "WebSocket", "alert", "prompt", "confirm",
  "localStorage", "sessionStorage", "indexedDB",
]);

// Banned return type names
const BANNED_RETURN_TYPES = new Set([
  "void", "any", "never", "unknown",
]);

function validateAST(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2020, true);

  const errors = [];

  function getLineNumber(node) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1;
  }

  function visitNode(node) {
    const line = getLineNumber(node);

    // Top-level statements only — we check what kind of statement each is
    switch (node.kind) {
      case ts.SyntaxKind.TypeAliasDeclaration:
        // type Foo = { ... } — ALLOWED
        break;

      case ts.SyntaxKind.VariableStatement: {
        // const x: T = value — check each declaration
        const declList = node.declarationList;

        // Must be const, not let/var
        if (!(declList.flags & ts.NodeFlags.Const)) {
          const keyword = declList.flags & ts.NodeFlags.Let ? "let" : "var";
          errors.push({ line, message: `'${keyword}' is not allowed. Use 'const' for all declarations.` });
          break;
        }

        for (const decl of declList.declarations) {
          if (decl.initializer) {
            // Check for arrow functions
            if (ts.isArrowFunction(decl.initializer)) {
              validateArrowFunction(decl, line);
            }
            // Scan the initializer for banned globals
            checkForBannedGlobals(decl.initializer, line);
          }
        }
        break;
      }

      case ts.SyntaxKind.FunctionDeclaration:
        errors.push({ line, message: "'function' declarations are not allowed. Use arrow functions: const f = (x: T) => ..." });
        break;

      case ts.SyntaxKind.ClassDeclaration:
        errors.push({ line, message: "'class' is not allowed in .pure.ts files." });
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        errors.push({ line, message: "'interface' is not allowed. Use 'type' instead." });
        break;

      case ts.SyntaxKind.EnumDeclaration:
        errors.push({ line, message: "'enum' is not allowed. Use union types instead: type Status = 'active' | 'inactive'" });
        break;

      case ts.SyntaxKind.ImportDeclaration:
        validateImport(node, line);
        break;

      case ts.SyntaxKind.ImportEqualsDeclaration:
        errors.push({ line, message: "'import =' syntax is not allowed. Use 'import { x } from \"./file.pure.ts\"'." });
        break;

      case ts.SyntaxKind.ExportDeclaration:
        // Named exports allowed: export { x }, export type { T }
        // But not: export default
        break;

      case ts.SyntaxKind.ExportAssignment:
        errors.push({ line, message: "'export default' is not allowed. Use named exports: export { x }." });
        break;

      case ts.SyntaxKind.ModuleDeclaration:
        errors.push({ line, message: "'namespace'/'module' is not allowed in .pure.ts files." });
        break;

      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.SwitchStatement:
      case ts.SyntaxKind.TryStatement:
      case ts.SyntaxKind.ThrowStatement:
        errors.push({ line, message: "Control flow statements are not allowed in .pure.ts files." });
        break;

      case ts.SyntaxKind.ExpressionStatement:
        errors.push({ line, message: "Expression statements are not allowed. Only type declarations and const assignments are permitted." });
        break;

      // Handle modifiers on unrecognized declarations
      default:
        if (ts.canHaveModifiers(node)) {
          const modifiers = ts.getModifiers(node);
          if (modifiers) {
            for (const mod of modifiers) {
              if (mod.kind === ts.SyntaxKind.DeclareKeyword) {
                errors.push({ line, message: "'declare' is not allowed in .pure.ts files." });
              }
              if (mod.kind === ts.SyntaxKind.AsyncKeyword) {
                errors.push({ line, message: "'async' is not allowed. .pure.ts functions must be synchronous and pure." });
              }
            }
          }
        }
        break;
    }

    // Check for declare/default export modifiers on recognized nodes
    if (node.kind !== ts.SyntaxKind.EndOfFileToken && ts.canHaveModifiers(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers) {
        for (const mod of modifiers) {
          if (mod.kind === ts.SyntaxKind.DeclareKeyword) {
            errors.push({ line, message: "'declare' is not allowed in .pure.ts files." });
          }
          if (mod.kind === ts.SyntaxKind.DefaultKeyword) {
            errors.push({ line, message: "'export default' is not allowed. Use named exports." });
          }
        }
      }
    }
  }

  function validateImport(node, line) {
    const moduleSpecifier = node.moduleSpecifier;
    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      const path = moduleSpecifier.text;

      // Must import from a .pure.ts file
      if (!path.endsWith(".pure.ts") && !path.endsWith(".pure")) {
        errors.push({ line, message: `Can only import from .pure.ts files. '${path}' is not a .pure.ts module.` });
      }
    }

    // No default imports
    if (node.importClause) {
      if (node.importClause.name) {
        errors.push({ line, message: "Default imports are not allowed. Use named imports: import { x } from '...'." });
      }
    }
  }

  function validateArrowFunction(decl, line) {
    const arrowFn = decl.initializer;

    // Check for async modifier
    if (arrowFn.modifiers) {
      for (const mod of arrowFn.modifiers) {
        if (mod.kind === ts.SyntaxKind.AsyncKeyword) {
          errors.push({ line, message: "'async' arrow functions are not allowed. .pure.ts functions must be pure." });
        }
      }
    }

    // Check explicit return type if present
    if (arrowFn.type) {
      const returnTypeText = arrowFn.type.getText(sourceFile);
      checkReturnTypeText(returnTypeText, line);
    }
  }

  function checkReturnTypeText(typeText, line) {
    const normalized = typeText.trim();
    if (BANNED_RETURN_TYPES.has(normalized)) {
      errors.push({ line, message: `Return type '${normalized}' is not allowed. Functions must return a concrete data type.` });
    }
    if (normalized.startsWith("Promise")) {
      errors.push({ line, message: `Return type 'Promise' is not allowed. .pure.ts functions must be synchronous.` });
    }
  }

  function checkForBannedGlobals(node, declLine) {
    function walk(n) {
      if (ts.isIdentifier(n) && BANNED_GLOBALS.has(n.text)) {
        const line = getLineNumber(n);
        errors.push({ line, message: `'${n.text}' is not allowed. .pure.ts files must be free of IO and side effects.` });
      }
      ts.forEachChild(n, walk);
    }
    walk(node);
  }

  // Visit top-level statements
  for (const statement of sourceFile.statements) {
    visitNode(statement);
  }

  return errors;
}

function checkTypes(filePath) {
  const program = ts.createProgram([filePath], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowImportingTsExtensions: true,
  });

  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  const errors = [];

  // Get standard TS diagnostics
  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];

  for (const diag of diagnostics) {
    if (diag.file && diag.start !== undefined) {
      const { line } = diag.file.getLineAndCharacterOfPosition(diag.start);
      const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      errors.push({ line: line + 1, code: `TS${diag.code}`, message });
    }
  }

  // Check inferred return types of arrow functions
  if (sourceFile) {
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
            const sig = checker.getSignatureFromDeclaration(decl.initializer);
            if (sig) {
              const returnType = checker.getReturnTypeOfSignature(sig);
              const typeName = checker.typeToString(returnType);
              const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());

              if (BANNED_RETURN_TYPES.has(typeName)) {
                errors.push({
                  line: line + 1,
                  code: "DATATS",
                  message: `Arrow function infers return type '${typeName}'. Functions must return a concrete data type.`,
                });
              }
              if (typeName.startsWith("Promise")) {
                errors.push({
                  line: line + 1,
                  code: "DATATS",
                  message: `Arrow function infers return type '${typeName}'. Async/Promise types are not allowed.`,
                });
              }
            }
          }
        }
      }
    }
  }

  return errors;
}

function check(filePath) {
  const absPath = resolve(filePath);

  // Step 1: AST-based validation of .pure.ts subset constraints
  const validationErrors = validateAST(absPath);
  if (validationErrors.length > 0) {
    console.log("✗ Invalid .pure.ts file:\n");
    for (const err of validationErrors) {
      console.log(`  Line ${err.line}: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Step 2: Type checking with inferred return type validation
  const typeErrors = checkTypes(absPath);
  if (typeErrors.length > 0) {
    console.log("✗ Type errors found:\n");
    for (const err of typeErrors) {
      const code = err.code ? ` [${err.code}]` : "";
      console.log(`  Line ${err.line}: ${err.message}${code}`);
    }
    process.exitCode = 1;
  } else {
    console.log("✓ All values type-check successfully!");
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help") {
  console.log("Usage:");
  console.log("  datats check <file.pure.ts>   Type-check a .pure.ts file");
  console.log("  datats serve [dir] [--port N]  Launch web editor");
  console.log("  datats <dir>                   Launch web editor (shorthand)");
  process.exit(0);
}

if (args[0] === "check" && args[1]) {
  check(args[1]);
} else if (args[0] === "serve" || (args.length >= 1 && !args[0].startsWith("-") && args[0] !== "check")) {
  const serveScript = resolve(__dirname, "serve.mjs");
  const portIdx = args.indexOf("--port");
  const portVal = portIdx >= 0 ? args[portIdx + 1] : null;
  const noOpen = args.includes("--no-open");
  const positional = args.filter((a, i) => a !== "serve" && a !== "--no-open" && a !== "--port" && (portIdx < 0 || i !== portIdx + 1));
  const dir = positional[0] || ".";
  const serveArgs = [resolve(dir)];
  if (portVal) serveArgs.push("--port", portVal);
  if (noOpen) serveArgs.push("--no-open");
  import("child_process").then(({ execSync: ex }) => {
    ex(`node ${serveScript} ${serveArgs.join(" ")}`, { stdio: "inherit" });
  });
} else {
  console.log("Usage:");
  console.log("  datats check <file.pure.ts>   Type-check a .pure.ts file");
  console.log("  datats serve [dir] [--port N]  Launch web editor");
  console.log("  datats <dir>                   Launch web editor (shorthand)");
  process.exit(1);
}
