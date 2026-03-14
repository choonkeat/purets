#!/usr/bin/env node

import { readFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Keywords that are NOT allowed in .data.ts files
const DISALLOWED_KEYWORDS = [
  "function", "class", "interface", "let", "var",
  "import", "export", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "throw", "try",
  "catch", "finally", "new", "delete", "typeof", "void", "yield",
  "await", "async", "enum", "namespace", "module", "declare",
  "abstract", "implements", "extends",
];

function validate(content) {
  const errors = [];
  const lines = content.split("\n");
  let inTypeBlock = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    // Track brace depth for type bodies
    if (line.startsWith("type ") && line.includes("{")) {
      inTypeBlock = true;
    }
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }
    if (inTypeBlock && braceDepth === 0) {
      inTypeBlock = false;
    }

    // Inside a type body, allow field definitions
    if (inTypeBlock) continue;

    // Allow: type declarations
    if (line.startsWith("type ")) continue;

    // Allow: const with type annotation (our data values)
    if (line.startsWith("const ") && line.includes(":")) continue;

    // Allow: closing braces, comments, blank lines
    if (line === "}" || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line.startsWith("*/")) continue;

    // Allow: continuation of object literals / arrays
    if (line.match(/^[\[\]{}",\d\-]/) || line.match(/^\w+\s*:/) || line === "true" || line === "false" || line === "null") continue;

    // Check for disallowed keywords
    for (const kw of DISALLOWED_KEYWORDS) {
      if (line.startsWith(kw + " ") || line.startsWith(kw + "(") || line.startsWith(kw + "{") || line === kw) {
        errors.push({ line: i + 1, message: `'${kw}' is not allowed in .data.ts files. Only type declarations and const values are permitted.` });
        break;
      }
    }
  }

  return errors;
}

function check(filePath) {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, "utf-8");

  // Step 1: Validate .data.ts subset constraints
  const validationErrors = validate(content);
  if (validationErrors.length > 0) {
    console.log("✗ Invalid .data.ts file:\n");
    for (const err of validationErrors) {
      console.log(`  Line ${err.line}: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }

  // Step 2: Run tsc directly on the file (it's valid TS!)
  try {
    const tscPath = resolve(__dirname, "node_modules/.bin/tsc");
    execSync(`${tscPath} --noEmit --strict --target es2020 --moduleResolution node ${absPath}`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    console.log("✓ All values type-check successfully!");
  } catch (err) {
    const output = err.stdout || err.stderr || "";
    console.log("✗ Type errors found:\n");

    const lines = output.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const errorMatch = line.match(/\.data\.ts\((\d+),(\d+)\): error (TS\d+): (.+)/);
      if (errorMatch) {
        const [, lineNum, col, code, message] = errorMatch;
        console.log(`  Line ${lineNum}: ${message} [${code}]`);
      } else if (line.trim()) {
        console.log(`  ${line}`);
      }
    }
    process.exitCode = 1;
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help") {
  console.log("Usage:");
  console.log("  datats check <file.data.ts>   Type-check a .data.ts file");
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
  console.log("  datats check <file.data.ts>   Type-check a .data.ts file");
  console.log("  datats serve [dir] [--port N]  Launch web editor");
  console.log("  datats <dir>                   Launch web editor (shorthand)");
  process.exit(1);
}
