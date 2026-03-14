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
  const out = check("valid-basic.data.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("union types and arrays", () => {
  const out = check("valid-unions.data.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("optional fields", () => {
  const out = check("valid-optional.data.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("nested arrays and tuples", () => {
  const out = check("valid-nested-arrays.data.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("generic types", () => {
  const out = check("valid-generics.data.ts");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

// --- Type errors ---

console.log("\nInvalid files (should fail with correct errors):");

test("wrong type (string instead of number)", () => {
  const out = checkFails("invalid-wrong-type.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error");
});

test("missing required field", () => {
  const out = checkFails("invalid-missing-field.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("email"), "Expected error about missing 'email' field");
});

test("invalid union value", () => {
  const out = checkFails("invalid-bad-union.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("deleted"), `Expected error mentioning 'deleted', got: ${out}`);
});

test("optional field with wrong type", () => {
  const out = checkFails("invalid-optional-wrong-type.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'string'"), "Expected string type error for email");
});

test("wrong type in nested array", () => {
  const out = checkFails("invalid-nested-array.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error in nested object");
});

test("wrong type in generic", () => {
  const out = checkFails("invalid-generic.data.ts");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected type error in generic data field");
});

// --- Disallowed constructs ---

console.log("\nDisallowed constructs (should reject):");

test("function in file", () => {
  const out = checkFails("invalid-has-function.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'function' is not allowed"), "Expected function rejection");
});

test("class in file", () => {
  const out = checkFails("invalid-has-class.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'class' is not allowed"), "Expected class rejection");
});

test("interface in file", () => {
  const out = checkFails("invalid-has-interface.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'interface' is not allowed"), "Expected interface rejection");
});

test("let/var/function in file", () => {
  const out = checkFails("invalid-code-in-values.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'let' is not allowed"), "Expected let rejection");
  assert(out.includes("'function' is not allowed"), "Expected function rejection");
});

test("import in file", () => {
  const out = checkFails("invalid-has-import.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'import' is not allowed"), "Expected import rejection");
});

test("enum in file", () => {
  const out = checkFails("invalid-has-enum.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'enum' is not allowed"), "Expected enum rejection");
});

test("let/var in file", () => {
  const out = checkFails("invalid-has-let.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'let' is not allowed"), "Expected let rejection");
  assert(out.includes("'var' is not allowed"), "Expected var rejection");
});

test("control flow in file", () => {
  const out = checkFails("invalid-has-control-flow.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'if' is not allowed"), "Expected if rejection");
  assert(out.includes("'for' is not allowed"), "Expected for rejection");
  assert(out.includes("'while' is not allowed"), "Expected while rejection");
});

test("export in file", () => {
  const out = checkFails("invalid-has-export.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'export' is not allowed"), "Expected export rejection");
});

test("declare in file", () => {
  const out = checkFails("invalid-has-declare.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'declare' is not allowed"), "Expected declare rejection");
});

test("namespace in file", () => {
  const out = checkFails("invalid-has-namespace.data.ts");
  assert(out !== null, "Expected validation to fail");
  assert(out.includes("'namespace' is not allowed"), "Expected namespace rejection");
});

// --- Summary ---
console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
