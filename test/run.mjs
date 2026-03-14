#!/usr/bin/env node

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tjson = resolve(__dirname, "../tjson.mjs");

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
  return execSync(`node ${tjson} check ${file}`, { encoding: "utf-8", stdio: "pipe" });
}

function checkFails(fixture) {
  const file = resolve(__dirname, "fixtures", fixture);
  try {
    execSync(`node ${tjson} check ${file}`, { encoding: "utf-8", stdio: "pipe" });
    return null; // didn't fail
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// --- Tests ---

console.log("\nValid files (should pass):");

test("basic types", () => {
  const out = check("valid-basic.tjson");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("union types and arrays", () => {
  const out = check("valid-unions.tjson");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("optional fields", () => {
  const out = check("valid-optional.tjson");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("nested arrays and tuples", () => {
  const out = check("valid-nested-arrays.tjson");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

test("generic types", () => {
  const out = check("valid-generics.tjson");
  assert(out.includes("All values type-check successfully"), "Expected success message");
});

console.log("\nInvalid files (should fail with correct errors):");

test("wrong type (string instead of number)", () => {
  const out = checkFails("invalid-wrong-type.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error");
});

test("missing required field", () => {
  const out = checkFails("invalid-missing-field.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("email"), "Expected error about missing 'email' field");
});

test("invalid union value", () => {
  const out = checkFails("invalid-bad-union.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("deleted"), `Expected error mentioning 'deleted', got: ${out}`);
});

test("optional field with wrong type", () => {
  const out = checkFails("invalid-optional-wrong-type.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'string'"), "Expected string type error for email");
});

test("wrong type in nested array", () => {
  const out = checkFails("invalid-nested-array.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected number type error in nested object");
});

test("wrong type in generic", () => {
  const out = checkFails("invalid-generic.tjson");
  assert(out !== null, "Expected type check to fail");
  assert(out.includes("not assignable to type 'number'"), "Expected type error in generic data field");
});

// --- Summary ---
console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
