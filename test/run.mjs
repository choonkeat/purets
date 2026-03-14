#!/usr/bin/env node

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const datats = resolve(__dirname, "../datats.mjs");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function check(fixture) {
  const file = resolve(__dirname, "fixtures", fixture);
  return execSync(`node ${datats} check ${file}`, { encoding: "utf-8", stdio: "pipe" });
}

function checkFails(fixture) {
  const file = resolve(__dirname, "fixtures", fixture);
  try {
    execSync(`node ${datats} check ${file}`, { encoding: "utf-8", stdio: "pipe" });
    return null;
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Valid files ---

console.log("\nValid files (should pass):");

test("basic types", () => {
  const out = check("valid-basic.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("union types and arrays", () => {
  const out = check("valid-unions.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("optional fields", () => {
  const out = check("valid-optional.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("nested arrays and tuples", () => {
  const out = check("valid-nested-arrays.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("generic types", () => {
  const out = check("valid-generics.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

// --- Type errors ---

console.log("\nInvalid files (should fail with correct errors):");

test("wrong type (string instead of number)", () => {
  const out = checkFails("invalid-wrong-type.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error");
});

test("missing required field", () => {
  const out = checkFails("invalid-missing-field.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("email"), "Expected error about missing 'email' field");
});

test("invalid union value", () => {
  const out = checkFails("invalid-bad-union.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("deleted"), `Expected error mentioning 'deleted', got: ${out}`);
});

test("optional field with wrong type", () => {
  const out = checkFails("invalid-optional-wrong-type.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'string'"), "Expected string type error for email");
});

test("wrong type in nested array", () => {
  const out = checkFails("invalid-nested-array.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error in nested object");
});

test("wrong type in generic", () => {
  const out = checkFails("invalid-generic.pure.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected type error in generic data field");
});

// --- Disallowed constructs ---

console.log("\nDisallowed constructs (should reject):");

test("function in file", () => {
  const out = checkFails("invalid-has-function.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("function") && out.includes("not allowed"), "Expected function rejection");
});

test("class in file", () => {
  const out = checkFails("invalid-has-class.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'class' is not allowed"), "Expected class rejection");
});

test("interface in file", () => {
  const out = checkFails("invalid-has-interface.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'interface' is not allowed"), "Expected interface rejection");
});

test("let/var/function in file", () => {
  const out = checkFails("invalid-code-in-values.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("let") && out.includes("not allowed"), "Expected let rejection");
  assert(out.includes("function") && out.includes("not allowed"), "Expected function rejection");
});

test("import from non-pure module", () => {
  const out = checkFails("invalid-has-import.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("not a .pure.ts module"), "Expected non-pure import rejection");
});

test("enum in file", () => {
  const out = checkFails("invalid-has-enum.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'enum' is not allowed"), "Expected enum rejection");
});

test("let/var in file", () => {
  const out = checkFails("invalid-has-let.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'let' is not allowed"), "Expected let rejection");
  assert(out.includes("'var' is not allowed"), "Expected var rejection");
});

test("control flow in file", () => {
  const out = checkFails("invalid-has-control-flow.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("Control flow") && out.includes("not allowed"), "Expected control flow rejection");
});

test("export default banned", () => {
  const out = checkFails("invalid-has-export.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("export default") && out.includes("not allowed"), "Expected default export rejection");
});

test("declare in file", () => {
  const out = checkFails("invalid-has-declare.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'declare' is not allowed"), "Expected declare rejection");
});

test("namespace in file", () => {
  const out = checkFails("invalid-has-namespace.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("namespace") && out.includes("not allowed"), "Expected namespace rejection");
});

// --- Imports and exports ---

console.log("\nImports and exports:");

test("named exports allowed", () => {
  const out = check("valid-with-exports.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success");
});

test("import from .pure.ts allowed", () => {
  const out = check("valid-with-import.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success");
});

test("import from non-.pure.ts banned", () => {
  const out = checkFails("invalid-import-non-pure.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("not a .pure.ts module"), "Expected non-pure import rejection");
});

test("default import banned", () => {
  const out = checkFails("invalid-default-import.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("Default import") && out.includes("not allowed"), "Expected default import rejection");
});

// --- Arrow functions and purity ---

console.log("\nArrow functions and purity:");

test("valid arrow functions", () => {
  const out = check("valid-arrow-functions.pure.ts");
  assert(out.includes("All values type-check successfully"), "Expected success");
});

test("IO globals banned (console)", () => {
  const out = checkFails("invalid-has-io.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("console") && out.includes("not allowed"), "Expected console rejection");
});

test("void return type banned", () => {
  const out = checkFails("invalid-void-return.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("void") && out.includes("not allowed"), "Expected void rejection");
});

test("any return type banned", () => {
  const out = checkFails("invalid-any-return.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("any") && out.includes("not allowed"), "Expected any rejection");
});

test("async arrow functions banned", () => {
  const out = checkFails("invalid-async-arrow.pure.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("async") && out.includes("not allowed"), "Expected async rejection");
});

// --- Summary ---
console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
