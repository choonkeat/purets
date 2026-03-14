#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseTjson(content) {
  // Extract type block from /* ... */
  const typeBlockMatch = content.match(/\/\*([\s\S]*?)\*\//);
  if (!typeBlockMatch) {
    throw new Error("No type block found. Expected /* ... */ block with type definitions.");
  }

  const typeBlock = typeBlockMatch[1]
    .split("\n")
    .map((line) => line.replace(/^\s*/, "")) // trim leading whitespace
    .join("\n")
    .trim();

  const typeBlockEndIndex = typeBlockMatch.index + typeBlockMatch[0].length;

  // Extract values by finding `// TypeName` comments followed by JSON objects
  const valuesSection = content.slice(typeBlockEndIndex);
  const values = [];
  const lines = valuesSection.split("\n");
  let i = 0;

  while (i < lines.length) {
    const commentMatch = lines[i].match(/^\s*\/\/\s*(.+?)\s*$/);
    if (commentMatch) {
      const typeName = commentMatch[1];
      // Collect the JSON object lines that follow
      i++;
      let jsonLines = [];
      let braceDepth = 0;
      let started = false;

      while (i < lines.length) {
        const line = lines[i];
        // Skip blank lines before the JSON starts
        if (!started && line.trim() === "") { i++; continue; }

        for (const ch of line) {
          if (ch === "{" || ch === "[") { braceDepth++; started = true; }
          if (ch === "}" || ch === "]") braceDepth--;
        }
        jsonLines.push(line);
        i++;
        if (started && braceDepth === 0) break;
      }

      if (jsonLines.length > 0) {
        const jsonStr = jsonLines.join("\n").trim();
        // Calculate line number in original file
        const contentBeforeType = content.slice(0, typeBlockEndIndex) + valuesSection.split("\n").slice(0, i - jsonLines.length).join("\n");
        const lineNumber = contentBeforeType.split("\n").length + 1;
        values.push({ typeName, jsonStr, lineNumber });
      }
    } else {
      i++;
    }
  }

  return { typeBlock, values };
}

function generateTs(typeBlock, values) {
  let ts = typeBlock + "\n\n";

  for (let i = 0; i < values.length; i++) {
    const { typeName, jsonStr } = values[i];
    ts += `const _v${i}: ${typeName} = ${jsonStr}\n`;
  }

  return ts;
}

function mapTscErrors(tscOutput, values) {
  // tsc errors look like: file.ts(lineNum,colNum): error TS1234: message
  const errorRegex = /\.ts\((\d+),(\d+)\): error (TS\d+): (.+)/g;
  const errors = [];

  let match;
  while ((match = errorRegex.exec(tscOutput)) !== null) {
    const tsLine = parseInt(match[1]);
    const col = parseInt(match[2]);
    const code = match[3];
    const message = match[4];

    // Try to map back to a value
    let valueInfo = null;
    for (const v of values) {
      // rough mapping — find which const assignment this error is in
    }

    errors.push({ tsLine, col, code, message });
  }

  return errors;
}

function check(filePath) {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, "utf-8");

  const { typeBlock, values } = parseTjson(content);

  if (values.length === 0) {
    console.log("⚠ No values found to check.");
    return;
  }

  console.log(`Found ${values.length} value(s) to check against types.\n`);

  // Generate temp .ts file
  const tsContent = generateTs(typeBlock, values);
  const tmpFile = absPath.replace(/\.tjson$/, ".check.ts");
  writeFileSync(tmpFile, tsContent);

  try {
    const tscPath = resolve(__dirname, "node_modules/.bin/tsc");
    execSync(`${tscPath} --noEmit --strict --target es2020 --moduleResolution node ${tmpFile}`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    console.log("✓ All values type-check successfully!");
  } catch (err) {
    const output = err.stdout || err.stderr || "";
    console.log("✗ Type errors found:\n");

    // Parse and display errors with context
    const lines = output.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      // Try to make errors more readable
      const errorMatch = line.match(/\.check\.ts\((\d+),(\d+)\): error (TS\d+): (.+)/);
      if (errorMatch) {
        const [, tsLine, col, code, message] = errorMatch;

        // Map ts line back to value
        const tsLines = tsContent.split("\n");
        const errorLine = tsLines[parseInt(tsLine) - 1] || "";
        const constMatch = errorLine.match(/const _v(\d+): (.+?) =/);

        if (constMatch) {
          const valueIndex = parseInt(constMatch[1]);
          const typeName = constMatch[2];
          const origLine = values[valueIndex]?.lineNumber || "?";
          console.log(`  Line ${origLine} (${typeName}): ${message} [${code}]`);
        } else {
          console.log(`  ${message} [${code}]`);
        }
      } else if (line.trim()) {
        console.log(`  ${line}`);
      }
    }
    process.exitCode = 1;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help") {
  console.log("Usage: tjson check <file.tjson>");
  console.log("\nType-checks JSON values against TypeScript type definitions.");
  process.exit(0);
}

if (args[0] === "check" && args[1]) {
  check(args[1]);
} else if (args[0] === "serve" || (args.length >= 1 && !args[0].startsWith("-") && args[0] !== "check")) {
  // `tjson serve [dir] [--port N]` or `tjson .` — launch editor
  const serveScript = resolve(__dirname, "serve.mjs");
  const portIdx = args.indexOf("--port");
  const portVal = portIdx >= 0 ? args[portIdx + 1] : null;
  const noOpen = args.includes("--no-open");
  const positional = args.filter((a, i) => a !== "serve" && a !== "--no-open" && a !== "--port" && (portIdx < 0 || i !== portIdx + 1));
  const dir = positional[0] || ".";
  const serveArgs = [resolve(dir)];
  if (portVal) serveArgs.push("--port", portVal);
  if (noOpen) serveArgs.push("--no-open");
  import("child_process").then(({ execSync }) => {
    execSync(`node ${serveScript} ${serveArgs.join(" ")}`, { stdio: "inherit" });
  });
} else {
  console.log(`Usage:`);
  console.log(`  tjson check <file.tjson>   Type-check a file`);
  console.log(`  tjson serve [dir] [port]   Launch web editor`);
  console.log(`  tjson <dir>                Launch web editor (shorthand)`);
  process.exit(1);
}
