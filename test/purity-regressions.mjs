import { validateContent } from '../purets.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function runPurityRegressionTests(test, assert) {
  const invalid = [
    ['parameter mutation default', 'export function f(xs: number[], n = xs.push(1)): number { return n }', 'mutates in place'],
    ['parameter random default', 'export function f(n = Math.random()): number { return n }', 'Math.random'],
    ['binding random default', 'export const {x = Math.random()} = {x: undefined};', 'Math.random'],
    ['nested binding default', 'export function f({x = Math.random()}: {x?:number} = {}): number { return x }', 'Math.random'],
    ['object method let', 'export const o = { f(): number { let x = 0; return x } };', "'let'"],
    ['object method loop', 'export const o = { f(): number { for (const x of []) {} return 1 } };', 'function body'],
    ['object method throw', 'export const o = { f(): number { throw 1 } };', 'function body'],
    ['getter throw', 'export const o = { get f(): number { throw 1 } };', 'function body'],
    ['setter loop', 'export const o = { set f(n: number) { while (true) {} } };', 'function body'],
    ['async method', 'export const o = { async f() { return 1 } };', "'async'"],
    ['generator method', 'export const o = { *f() { return 1 } };', 'Generator'],
    ['bracket mutation', 'export const f = (xs: number[]): number => xs["push"](1);', 'mutates in place'],
    ['bracket randomness', 'export const f = (): number => Math["random"]();', 'Math.random'],
    ['parenthesized randomness', 'export const f = (): number => (Math).random();', 'Math.random'],
    ['extracted mutator', 'export const f = (xs: number[]) => xs.push;', 'mutates in place'],
    ['destructured mutator', 'export const f = (xs: number[]): number => { const {push: append} = xs; return append.call(xs, 1) };', 'mutates in place'],
    ['computed random key', 'export const f = (): number => { const k = "random"; return Math[k]() };', 'Standard-library operation'],
    ['aliased Math', 'const m = Math; export const f = (): number => m.random();', 'Standard-library operation'],
    ['destructured random', 'const {random: roll} = Math; export const f = (): number => roll();', 'Standard-library operation'],
    ['random passed as callback', 'const m = Math; export const f = (): number[] => [1].map(m.random);', 'Standard-library operation'],
    ['aliased Object mutation', 'const o = Object; export const f = (x: {}) => o.assign(x, {n: 1});', 'Standard-library operation'],
    ['constructor dynamic code', 'export const f = (): number => (() => 0).constructor("return Math.random()")();', 'constructor'],
    ['bracket constructor', 'export const f = (): number => (() => 0)["constructor"]("return 1")();', 'constructor'],
    ['computed constructor', 'export const f = (): number => { const k = "constructor"; return (() => 0)[k]("return 1")() };', 'Dynamic Function'],
    ['destructured constructor', 'const {constructor: build} = () => 0; export const f = (): number => build("return 1")();', 'constructor'],
    ['any call', 'export const f = (g: any): number => g();', "type 'any'"],
    ['any tagged template', 'export const f = (g: any): number => g`code`;', "type 'any'"],
    ['nested inferred any return', 'export const o = { f(x: any) { return x } };', "return type 'any'"],
    ['object freeze', 'export const f = (x: {n:number}): {n:number} => Object.freeze(x);', 'Object.freeze'],
    ['object seal', 'export const f = (x: {}) => Object.seal(x);', 'Object.seal'],
    ['object preventExtensions', 'export const f = (x: {}) => Object.preventExtensions(x);', 'Object.preventExtensions'],
    ['aliased freeze', 'const {freeze: lock} = Object; export const f = (x: {}) => lock(x);', 'Standard-library operation'],
    ['regexp test', 'export const f = (r: RegExp): boolean => r.test("a");', 'RegExp.test'],
    ['regexp exec', 'export const f = (r: RegExp) => r.exec("a");', 'RegExp.exec'],
    ['regexp alias', 'export const f = (r: RegExp) => { const {test: match} = r; return match("a") };', 'RegExp.test'],
    ['computed regexp method', 'export const f = (r: RegExp): boolean => { const k = "test"; return r[k]("a") };', 'RegExp.test'],
    ['DataView mutation', 'export const f = (v: DataView): number => { const ignored = v.setInt8(0, 1); return 1 };', 'DataView.setInt8'],
  ];
  console.log('\nPurity bypass regressions (including editor validation):');
  for (const [name, source, expected] of invalid) {
    test(name, () => {
      const errors = validateContent(source);
      assert(errors.some(e => e.message.includes(expected)), `Expected ${expected}, got ${JSON.stringify(errors)}`);
    });
  }
  const valid = [
    ['pure defaults and bindings', 'export function f({x = 1}: {x?:number} = {}, n = 2): number { return x + n }'],
    ['pure method and getter', 'export const o = { f(x: number): number { if (x > 0) return x; return 0 }, get n(): number { return 1 } };'],
    ['pure computed array method', 'export const f = (xs: number[]): number[] => xs["map"](x => x + 1);'],
    ['aliased pure builtin', 'const {abs: positive} = Math; export const f = (x: number): number => positive(x);'],
    ['computed pure builtin', 'const key = "abs"; export const f = (x: number): number => Math[key](x);'],
    ['pure namespace destructuring', 'const {keys} = Object; const {isArray} = Array; export const f = (x: {}) => keys(x).map(k => isArray(k));'],
    ['pure local alias and callback', 'const inc = (x: number): number => x + 1; const alias = inc; export const f = (xs: number[]): number[] => xs.map(alias);'],
    ['ordinary data properties', 'export const o = {test: "data", freeze: true, random: 1};'],
    ['pure user method named test', 'export const o = {test(x: number): boolean {return x > 0}}; export const b = o.test(1);'],
    ['safe standard operations', 'export const f = (xs: number[]): string => Object.keys({x: xs.slice(0).toSorted()}).join(",").toUpperCase();'],
  ];
  for (const [name, source] of valid) {
    test(name, () => {
      const errors = validateContent(source);
      assert(errors.length === 0, `Expected valid pure code, got ${JSON.stringify(errors)}`);
    });
  }
  // Exercise the CLI's separate AST/type passes as well as the editor API above.
  const dir = mkdtempSync(join(tmpdir(), 'purets-regressions-'));
  try {
    const cli = fileURLToPath(new URL('../purets.mjs', import.meta.url));
    for (const name of ['parameter mutation default', 'object method throw', 'bracket mutation', 'computed constructor', 'any call', 'regexp test', 'aliased freeze']) {
      const [, source, expected] = invalid.find(c => c[0] === name);
      test(`CLI: ${name}`, () => {
        const file = join(dir, 'input.pure.ts');
        writeFileSync(file, source);
        const result = spawnSync(process.execPath, [cli, 'check', file], {encoding: 'utf8'});
        assert(result.status === 1 && result.stdout.includes(expected), `Expected policy rejection, got ${result.stdout} ${result.stderr}`);
      });
    }
    test('CLI: pure methods and defaults still type-check', () => {
      const file = join(dir, 'valid.pure.ts');
      writeFileSync(file, valid.slice(0, 2).map(c => c[1]).join('\n'));
      const result = spawnSync(process.execPath, [cli, 'check', file], {encoding: 'utf8'});
      assert(result.status === 0, result.stdout + result.stderr);
    });
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}
