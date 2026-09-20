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
  // Ambient state / non-determinism — same input must give same output
  "Date", "crypto", "performance", "navigator", "location", "history",
  "globalThis", "queueMicrotask", "requestAnimationFrame",
  // Dynamic code / reflection escape hatches
  "eval", "Function", "Reflect", "Proxy",
]);

// Methods that mutate their receiver in place
const MUTATING_METHODS = new Set([
  "push", "pop", "shift", "unshift", "splice", "sort", "reverse",
  "fill", "copyWithin", "set", "add", "delete", "clear",
]);

// Object.* helpers that mutate or reach around the type system
const MUTATING_OBJECT_STATICS = new Set([
  "assign", "defineProperty", "defineProperties", "setPrototypeOf",
  "freeze", "seal", "preventExtensions",
]);

// Property accesses that are impure even though the object itself is fine
const BANNED_MEMBERS = new Set(["Math.random"]);

// Statement kinds permitted inside a function body. Branching is pure;
// loops are not (without `let` they cannot do anything), and `throw`
// makes a function partial, so both stay banned.
const ALLOWED_BODY_STATEMENTS = new Set([
  ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.Block,
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.BreakStatement,
  ts.SyntaxKind.EmptyStatement,
]);

// Banned return type names
const BANNED_RETURN_TYPES = new Set([
  "void", "any", "never", "unknown",
]);

function isRuntimeFunction(node) {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

function unwrapExpression(node) {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const key = unwrapExpression(node.argumentExpression);
    if (ts.isStringLiteralLike(key)) return key.text;
  }
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    const key = node.propertyName || node.name;
    if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) return key.text;
    if (ts.isComputedPropertyName(key) && ts.isStringLiteralLike(key.expression)) return key.expression.text;
  }
  return undefined;
}

export function validateContent(content, filename = "input.pure.ts") {
  const sourceFile = ts.createSourceFile(filename, content, ts.ScriptTarget.ES2023, true);
  const errors = _validateSourceFile(sourceFile);
  if (errors.length) return errors;
  // The editor submits unsaved text; resolve types against that text, not disk.
  const filePath = resolve(filename);
  const program = createTypeProgram(filePath, {}, content);
  return validateTypePurity(program, program.getSourceFile(filePath));
}

function validateAST(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2023, true);
  return _validateSourceFile(sourceFile);
}

function _validateSourceFile(sourceFile) {

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

        break;
      }

      case ts.SyntaxKind.FunctionDeclaration:
        // Function rules are applied by the whole-file walk below.
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

  function checkReturnTypeText(typeText, line) {
    const normalized = typeText.trim();
    if (BANNED_RETURN_TYPES.has(normalized)) {
      errors.push({ line, message: `Return type '${normalized}' is not allowed. Functions must return a concrete data type.` });
    }
    if (normalized.startsWith("Promise")) {
      errors.push({ line, message: `Return type 'Promise' is not allowed. .pure.ts functions must be synchronous.` });
    }
  }

  // True when the identifier names a property/declaration rather than
  // referring to a binding — `x.Date` and `{ Date: 1 }` are not the global.
  function isReferencePosition(n) {
    const p = n.parent;
    if (!p) return true;
    if (ts.isPropertyAccessExpression(p) && p.name === n) return false;
    if (ts.isQualifiedName(p) && p.right === n) return false;
    if (ts.isPropertyAssignment(p) && p.name === n) return false;
    if (ts.isPropertySignature(p) && p.name === n) return false;
    if (ts.isShorthandPropertyAssignment(p) && p.name === n) return true;
    if (ts.isMethodSignature(p) && p.name === n) return false;
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return false;
    if (ts.isBindingElement(p) && p.propertyName === n) return false;
    // Declaration names: const Date = ..., function Date(), (Date) => ...
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) ||
         ts.isFunctionDeclaration(p) || ts.isTypeAliasDeclaration(p) ||
         ts.isTypeParameterDeclaration(p)) && p.name === n) return false;
    return true;
  }

  function isAssignmentOperator(kind) {
    return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
  }

  // Deep scan of an expression subtree for anything impure.
  function checkForBannedGlobals(node) {
    function walk(n) {
      if (ts.isIdentifier(n) && BANNED_GLOBALS.has(n.text) && isReferencePosition(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: `'${n.text}' is not allowed. .pure.ts files must be free of IO, ambient state and side effects.` });
      }
      if (n.kind === ts.SyntaxKind.ThisKeyword) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'this' is not allowed. .pure.ts functions must be pure and stateless." });
      }
      if (n.kind === ts.SyntaxKind.SuperKeyword) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'super' is not allowed in .pure.ts files." });
      }
      if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "Type assertions ('as' / angle-bracket) are not allowed. Use type narrowing instead." });
      }

      // x = v, x += v, x ??= v, ... — assignment is mutation
      if (ts.isBinaryExpression(n) && isAssignmentOperator(n.operatorToken.kind)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "Assignment is not allowed. .pure.ts values are immutable — build a new value instead." });
      }

      // x++, --x
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
          (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'++' / '--' are not allowed. .pure.ts values are immutable." });
      }

      // delete obj.k
      if (ts.isDeleteExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'delete' is not allowed. .pure.ts values are immutable." });
      }

      // Reject dangerous members on access, not just direct calls. This also
      // catches extraction (const push = xs.push) and literal bracket access.
      const name = memberName(n);
      if (name) {
        const line = getLineNumber(n);
        if (["constructor", "__proto__", "prototype"].includes(name)) {
          errors.push({ line, message: `Property '${name}' is not allowed. Dynamic code and prototype access are outside the pure subset.` });
        }
        if (MUTATING_METHODS.has(name)) {
          errors.push({ line, message: `'.${name}()' mutates in place and is not allowed. Build a new value instead (e.g. [...xs, x], xs.toSorted()).` });
        }
        if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
          const receiver = unwrapExpression(n.expression);
          if (ts.isIdentifier(receiver)) {
            const member = `${receiver.text}.${name}`;
            if (BANNED_MEMBERS.has(member)) {
              errors.push({ line, message: `'${member}' is not allowed. .pure.ts functions must be deterministic.` });
            }
            if (receiver.text === "Object" && MUTATING_OBJECT_STATICS.has(name)) {
              errors.push({ line, message: `'Object.${name}' mutates its argument and is not allowed. Use object spread to build a new value.` });
            }
          }
        }
      }

      // await / yield anywhere, including in nested functions
      if (ts.isAwaitExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'await' is not allowed. .pure.ts functions must be synchronous." });
      }
      if (ts.isYieldExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'yield' is not allowed in .pure.ts files." });
      }

      // class expressions and `new` — the subset has no classes
      if (ts.isClassExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'class' is not allowed in .pure.ts files." });
      }
      if (ts.isNewExpression(n)) {
        const line = getLineNumber(n);
        errors.push({ line, message: "'new' is not allowed in .pure.ts files. Construct plain data instead." });
      }

      // Nested functions get the same body rules as top-level ones
      if (isRuntimeFunction(n)) {
        validateNestedFunction(n);
      }

      ts.forEachChild(n, walk);
    }
    walk(node);
  }

  function validateNestedFunction(fn) {
    const line = getLineNumber(fn);
    const modifiers = ts.canHaveModifiers(fn) ? ts.getModifiers(fn) : undefined;
    if (modifiers) {
      for (const mod of modifiers) {
        if (mod.kind === ts.SyntaxKind.AsyncKeyword) {
          errors.push({ line, message: "'async' is not allowed. .pure.ts functions must be synchronous and pure." });
        }
      }
    }
    if (fn.asteriskToken) {
      errors.push({ line, message: "Generator functions are not allowed in .pure.ts files." });
    }
    if (fn.type) {
      checkReturnTypeText(fn.type.getText(sourceFile), line);
    }
    validateFunctionBody(fn.body);
  }

  // Branches and blocks recurse; every function body is checked by the walker.
  function validateFunctionBody(body) {
    if (!body || !ts.isBlock(body)) return;
    for (const stmt of body.statements) {
      validateBodyStatement(stmt);
    }
  }

  function validateBodyStatement(stmt) {
    const line = getLineNumber(stmt);

    if (!ALLOWED_BODY_STATEMENTS.has(stmt.kind)) {
      if (stmt.kind === ts.SyntaxKind.ExpressionStatement) {
        errors.push({ line, message: "Expression statements are not allowed inside functions. A statement whose result is discarded can only be a side effect." });
      } else {
        errors.push({ line, message: "Only 'const', 'return', 'if' and 'switch' are allowed inside a .pure.ts function body." });
      }
      return;
    }

    if (ts.isVariableStatement(stmt)) {
      const declList = stmt.declarationList;
      if (!(declList.flags & ts.NodeFlags.Const)) {
        const keyword = declList.flags & ts.NodeFlags.Let ? "let" : "var";
        errors.push({ line, message: `'${keyword}' is not allowed. Use 'const' for all declarations.` });
      }
      return;
    }

    // Recurse into the statements nested in allowed control flow
    if (ts.isBlock(stmt)) {
      for (const s of stmt.statements) validateBodyStatement(s);
    } else if (ts.isIfStatement(stmt)) {
      validateBodyStatement(stmt.thenStatement);
      if (stmt.elseStatement) validateBodyStatement(stmt.elseStatement);
    } else if (ts.isSwitchStatement(stmt)) {
      for (const clause of stmt.caseBlock.clauses) {
        for (const s of clause.statements) validateBodyStatement(s);
      }
    }
  }

  // Visit top-level statements
  for (const statement of sourceFile.statements) {
    visitNode(statement);
  }

  // Scan the entire file once, including defaults, binding patterns and methods.
  checkForBannedGlobals(sourceFile);

  // The deep scan and the statement walk can reach the same node twice
  const seen = new Set();
  const unique = errors.filter((e) => {
    const key = `${e.line}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.line - b.line);

  return unique;
}

// Only these standard-library callable declarations are admitted. Inspecting
// declaration provenance preserves the policy through aliases and bracket access.
// User functions/callbacks still rely on the pure-module/input contract; this is
// not a proof of purity for arbitrary objects supplied by unvalidated JS callers.
const PURE_LIBRARY_MEMBERS = new Map(Object.entries({
  Math: 'abs acos acosh asin asinh atan atanh atan2 ceil cbrt exp expm1 floor fround hypot imul log log1p log2 log10 max min pow round sign sin sinh sqrt tan tanh trunc clz32',
  ObjectConstructor: 'is keys values entries fromEntries hasOwn',
  ArrayConstructor: 'isArray of',
  Array: 'at concat every filter find findIndex findLast findLastIndex flat flatMap includes indexOf join lastIndexOf map reduce reduceRight slice some toReversed toSorted toSpliced with',
  ReadonlyArray: 'at concat every filter find findIndex findLast findLastIndex flat flatMap includes indexOf join lastIndexOf map reduce reduceRight slice some toReversed toSorted toSpliced with',
  String: 'at charAt charCodeAt codePointAt concat endsWith includes indexOf lastIndexOf normalize padEnd padStart repeat slice startsWith substring toLowerCase toUpperCase trim trimEnd trimStart toString valueOf',
  StringConstructor: 'fromCharCode fromCodePoint',
  Number: 'toExponential toFixed toPrecision toString valueOf',
  NumberConstructor: 'isFinite isInteger isNaN isSafeInteger parseFloat parseInt',
  Boolean: 'toString valueOf',
  JSON: 'parse stringify',
}).map(([owner, names]) => [owner, new Set(names.split(' '))]));
const PURE_LIBRARY_GLOBALS = new Set([
  'parseInt', 'parseFloat', 'isFinite', 'isNaN',
  'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
]);

function validateTypePurity(program, sourceFile) {
  if (!sourceFile) return [];
  const checker = program.getTypeChecker();
  const errors = [];
  const seen = new Set();
  function report(node, message) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const key = `${line}:${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      errors.push({ line, code: 'PURETS', message });
    }
  }
  function checkCallableType(node, type) {
    if (type.isUnionOrIntersection()) {
      for (const part of type.types) checkCallableType(node, part);
      return;
    }
    // Function's constructor/call/apply/bind are reflection escape hatches,
    // including aliases whose type has no ordinary call signature.
    const symbol = type.getSymbol();
    if (symbol?.name === 'Function' && symbol.declarations?.some(d => program.isSourceFileDefaultLibrary(d.getSourceFile()))) {
      report(node, 'Dynamic Function values are not allowed. Use a checked function with a concrete signature.');
    }
    for (const signature of type.getCallSignatures()) {
      const declaration = signature.getDeclaration();
      if (!declaration) {
        report(node, 'Callable provenance is unknown; this operation is not allowed in pure code.');
        continue;
      }
      const file = declaration.getSourceFile();
      const isOverride = resolve(file.fileName) === resolve(__dirname, 'purets-overrides.d.ts');
      if (!program.isSourceFileDefaultLibrary(file) && !isOverride) continue;
      const owner = declaration.parent?.name?.text;
      const name = declaration.name?.text;
      const allowed = PURE_LIBRARY_MEMBERS.get(owner)?.has(name) ||
        (ts.isFunctionDeclaration(declaration) && PURE_LIBRARY_GLOBALS.has(name));
      if (!allowed) {
        report(node, `Standard-library operation '${owner ? owner + '.' : ''}${name || 'call'}' is not allowed. Only reviewed pure operations may be used.`);
      }
    }
  }
  function walk(node) {
    // Check references as well as calls: an unsafe function cannot be extracted
    // and passed into map/reduce or hidden in an object before it is invoked.
    const isMemberReceiver = node.parent && (ts.isPropertyAccessExpression(node.parent) || ts.isElementAccessExpression(node.parent)) && node.parent.expression === node;
    const isBindingSource = node.parent && ts.isVariableDeclaration(node.parent) &&
      node.parent.initializer === node && ts.isObjectBindingPattern(node.parent.name);
    if (!isMemberReceiver && !isBindingSource && (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
      checkCallableType(node, checker.getTypeAtLocation(node));
    }
    if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node)) {
      const callee = ts.isCallExpression(node) ? node.expression : node.tag;
      const type = checker.getTypeAtLocation(callee);
      if (type.flags & ts.TypeFlags.Any) {
        report(node, "Calling a value of type 'any' is not allowed. Callable purity cannot be checked.");
      }
      checkCallableType(callee, type);
    }
    if (isRuntimeFunction(node) && node.body && !ts.isSetAccessorDeclaration(node)) {
      const signature = checker.getSignatureFromDeclaration(node);
      if (signature) {
        const type = checker.getReturnTypeOfSignature(signature);
        const name = checker.typeToString(type);
        if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Void | ts.TypeFlags.Never)) {
          report(node, `Function infers return type '${name}'. Functions must return a concrete data type.`);
        }
        if (checker.getPromisedTypeOfPromise(type)) {
          report(node, `Function infers return type '${name}'. Async/Promise types are not allowed.`);
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return errors.sort((a, b) => a.line - b.line);
}

function createTypeProgram(filePath, extraTscOptions = {}, content) {
  const overridePath = resolve(__dirname, "purets-overrides.d.ts");
  const options = {
    strict: true,
    noEmit: true,
    // ES2023 so the non-mutating array methods (toSorted, toReversed,
    // toSpliced, with) exist as alternatives to the banned mutating ones
    target: ts.ScriptTarget.ES2023,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noPropertyAccessFromIndexSignature: true,
    ...extraTscOptions,
  };
  const host = ts.createCompilerHost(options);
  if (content !== undefined) {
    const readFile = host.readFile;
    host.readFile = (path) => resolve(path) === filePath ? content : readFile(path);
  }
  return ts.createProgram([overridePath, filePath], options, host);
}

function checkTypes(filePath, extraTscOptions = {}) {
  const program = createTypeProgram(filePath, extraTscOptions);
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

  errors.push(...validateTypePurity(program, sourceFile));

  return errors;
}

// Parse tsc flags from -- passthrough
function parseTscFlags(flags) {
  const options = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag.startsWith("--")) {
      const name = flag.slice(2);
      // Boolean flags vs value flags
      if (i + 1 < flags.length && !flags[i + 1].startsWith("--")) {
        options[name] = flags[i + 1];
        i++;
      } else {
        options[name] = true;
      }
    }
  }
  return options;
}

function check(filePath, extraTscOptions = {}) {
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
  const typeErrors = checkTypes(absPath, extraTscOptions);
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

const HELP = `purets — TypeScript subset for pure typed data

Usage:
  purets check <file.pure.ts> [-- <tsc flags>]   Type-check a .pure.ts file
  purets edit [dir] [--port N] [--no-open]        Launch web editor

Examples:
  purets check data.pure.ts
  purets check data.pure.ts -- --noUnusedLocals
  purets edit
  purets edit ./data --port 8080`;

// CLI — only run when executed directly (not when imported)
const __purets_file = fileURLToPath(import.meta.url);
if (process.argv[1] === __purets_file || process.argv[1] === resolve(__purets_file)) {
  const rawArgs = process.argv.slice(2);

  // Split on -- for tsc passthrough
  const dashDashIdx = rawArgs.indexOf("--");
  const args = dashDashIdx >= 0 ? rawArgs.slice(0, dashDashIdx) : rawArgs;
  const tscFlags = dashDashIdx >= 0 ? rawArgs.slice(dashDashIdx + 1) : [];

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    process.exit(0);
  }

  if (args[0] === "check" && args[1]) {
    const extraTscOptions = parseTscFlags(tscFlags);
    check(args[1], extraTscOptions);
  } else if (args[0] === "edit") {
    const serveScript = resolve(__dirname, "serve.mjs");
    const portIdx = args.indexOf("--port");
    const portVal = portIdx >= 0 ? args[portIdx + 1] : null;
    const noOpen = args.includes("--no-open");
    const positional = args.filter((a, i) => a !== "edit" && a !== "--no-open" && a !== "--port" && (portIdx < 0 || i !== portIdx + 1));
    const dir = positional[0] || ".";
    const serveArgs = [resolve(dir)];
    if (portVal) serveArgs.push("--port", portVal);
    if (noOpen) serveArgs.push("--no-open");
    import("child_process").then(({ execSync: ex }) => {
      ex(`node ${serveScript} ${serveArgs.join(" ")}`, { stdio: "inherit" });
    });
  } else {
    console.log(HELP);
    process.exit(1);
  }
}
