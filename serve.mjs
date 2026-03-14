#!/usr/bin/env node

import { createServer } from "http";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, join, extname } from "path";
import { exec } from "child_process";
import { platform } from "os";

// Parse args
const args = process.argv.slice(2);
const portFlag = args.find((a, i) => args[i - 1] === "--port") || null;
const dirArg = args.find((a) => !a.startsWith("--") && a !== portFlag) || ".";
const noOpen = args.includes("--no-open");

const dir = resolve(dirArg);
const port = parseInt(portFlag || process.env.PORT || "3000");

function openBrowser(url) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`, () => {}); // fire and forget
}

function findTjsonFiles(baseDir) {
  const files = [];
  function walk(d, prefix = "") {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory() && entry !== "node_modules" && entry !== ".git") {
        walk(full, rel);
      } else if (entry.endsWith(".tjson")) {
        files.push(rel);
      }
    }
  }
  walk(baseDir);
  return files.sort();
}

function parseTjsonForEditor(content) {
  const typeBlockMatch = content.match(/\/\*([\s\S]*?)\*\//);
  if (!typeBlockMatch) return { typeBlock: "", values: content };

  const typeBlock = typeBlockMatch[1]
    .split("\n")
    .map((line) => line.replace(/^\s*/, ""))
    .join("\n")
    .trim();

  return { typeBlock };
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>typed-json</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e1e1e; color: #ccc; display: flex; height: 100vh; }

    #sidebar {
      width: 250px;
      background: #252526;
      border-right: 1px solid #3c3c3c;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    #sidebar h2 {
      padding: 12px 16px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #888;
      border-bottom: 1px solid #3c3c3c;
    }

    #file-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }

    .file-item {
      padding: 6px 16px;
      cursor: pointer;
      font-size: 13px;
      color: #ccc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-item:hover { background: #2a2d2e; }
    .file-item.active { background: #37373d; color: #fff; }

    #main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    #toolbar {
      height: 35px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
      font-size: 13px;
    }

    #filename { color: #ddd; font-weight: 500; }
    #status { color: #888; font-size: 12px; }
    #status.error { color: #f44747; }
    #status.ok { color: #4ec9b0; }
    #save-hint { color: #666; font-size: 11px; margin-left: auto; }
    #close-btn {
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1;
    }
    #close-btn:hover { background: #3c3c3c; color: #fff; }

    #editor-container {
      flex: 1;
      overflow: hidden;
    }

    #welcome {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #555;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <h2>typed-json files</h2>
    <div id="file-list"></div>
  </div>
  <div id="main">
    <div id="toolbar" style="display:none">
      <span id="filename"></span>
      <span id="status"></span>
      <span id="save-hint">Ctrl+S to save</span>
      <button id="close-btn" onclick="closeFile()" title="Close file">&times;</button>
    </div>
    <div id="editor-container" style="display:none"></div>
    <div id="welcome">Select a .tjson file to start editing</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
  <script>
    // Exposed on window for testing
    let editor = null;
    window.editor = null;
    let currentFile = null;
    let isDirty = false;

    // Load file list
    async function loadFiles() {
      const res = await fetch('/api/files');
      const files = await res.json();
      const list = document.getElementById('file-list');
      list.innerHTML = '';
      files.forEach(f => {
        const el = document.createElement('div');
        el.className = 'file-item';
        el.textContent = f;
        el.onclick = () => openFile(f);
        list.appendChild(el);
      });
    }

    function closeFile() {
      if (isDirty && !confirm('Unsaved changes. Discard?')) return;
      if (editor) {
        const oldModel = editor.getModel();
        if (oldModel) oldModel.dispose();
        editor.setModel(null);
      }
      currentFile = null;
      isDirty = false;
      document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
      document.getElementById('toolbar').style.display = 'none';
      document.getElementById('editor-container').style.display = 'none';
      document.getElementById('welcome').style.display = 'flex';
    }

    async function openFile(name) {
      if (isDirty && !confirm('Unsaved changes. Discard?')) return;

      const res = await fetch('/api/file?name=' + encodeURIComponent(name));
      const data = await res.json();

      currentFile = name;
      isDirty = false;

      // Update sidebar selection
      document.querySelectorAll('.file-item').forEach(el => {
        el.classList.toggle('active', el.textContent === name);
      });

      // Show editor
      document.getElementById('welcome').style.display = 'none';
      document.getElementById('toolbar').style.display = 'flex';
      document.getElementById('editor-container').style.display = 'block';
      document.getElementById('filename').textContent = name;
      setStatus('ok', 'Ready');

      if (editor) {
        // Dispose old model first to free the URI
        const oldModel = editor.getModel();
        if (oldModel) oldModel.dispose();

        // Set content as TypeScript for type checking
        const tsContent = buildTsContent(data.content);
        const uri = monaco.Uri.parse('file:///' + name.replace(/\\//g, '_').replace(/\\.tjson$/, '.ts'));
        const model = monaco.editor.createModel(tsContent, 'typescript', uri);
        editor.setModel(model);

        // Store raw content for save
        editor._tjsonRaw = data.content;
        editor._tjsonTypeBlock = data.typeBlock;

        // Run validation and check errors after TS diagnostics settle
        setTimeout(() => {
          validateTjsonContent(model);
          const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
          const errors = allMarkers.filter(m => m.severity === monaco.MarkerSeverity.Error);
          if (errors.length > 0) {
            setStatus('error', errors.length + ' error(s)');
          } else {
            setStatus('ok', 'No errors');
          }
        }, 2000);
      }
    }

    function buildTsContent(tjsonContent) {
      // Extract type block and values, reconstruct as TS
      const typeMatch = tjsonContent.match(/\\/\\*([\\s\\S]*?)\\*\\//);
      if (!typeMatch) return tjsonContent;

      const typeBlock = typeMatch[1]
        .split('\\n')
        .map(l => l.replace(/^\\s*/, ''))
        .join('\\n')
        .trim();

      const afterTypes = tjsonContent.slice(typeMatch.index + typeMatch[0].length);

      // Parse values
      const lines = afterTypes.split('\\n');
      let tsValues = '';
      let valueIdx = 0;
      let i = 0;

      while (i < lines.length) {
        const commentMatch = lines[i].match(/^\\s*\\/\\/\\s*(.+?)\\s*$/);
        if (commentMatch) {
          const typeName = commentMatch[1];
          i++;
          let jsonLines = [];
          let braceDepth = 0;
          let started = false;

          while (i < lines.length) {
            const line = lines[i];
            if (!started && line.trim() === '') { i++; continue; }
            for (const ch of line) {
              if (ch === '{' || ch === '[') { braceDepth++; started = true; }
              if (ch === '}' || ch === ']') braceDepth--;
            }
            jsonLines.push(line);
            i++;
            if (started && braceDepth === 0) break;
          }

          if (jsonLines.length > 0) {
            tsValues += '\\nconst _v' + valueIdx + ': ' + typeName + ' = ' + jsonLines.join('\\n').trim() + '\\n';
            valueIdx++;
          }
        } else {
          i++;
        }
      }

      return typeBlock + '\\n' + tsValues;
    }

    function setStatus(cls, text) {
      const el = document.getElementById('status');
      el.className = cls;
      el.textContent = text;
    }

    async function saveFile() {
      if (!currentFile || !editor) return;

      // Reconstruct tjson from the TS content
      // We need to map back from TS to tjson format
      const tsContent = editor.getValue();
      const tjsonContent = rebuildTjson(tsContent);

      const res = await fetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentFile, content: tjsonContent })
      });

      if (res.ok) {
        isDirty = false;
        setStatus('ok', 'Saved');
        setTimeout(() => {
          // Check for errors
          const markers = monaco.editor.getModelMarkers({ resource: editor.getModel().uri });
          const errors = markers.filter(m => m.severity === monaco.MarkerSeverity.Error);
          if (errors.length > 0) {
            setStatus('error', errors.length + ' error(s)');
          } else {
            setStatus('ok', 'No errors');
          }
        }, 500);
      } else {
        setStatus('error', 'Save failed');
      }
    }

    function rebuildTjson(tsContent) {
      // Split into type definitions and const assignments
      const lines = tsContent.split('\\n');
      let typeLines = [];
      let valueLines = [];
      let inValues = false;

      for (const line of lines) {
        const constMatch = line.match(/^const _v\\d+:\\s*(.+?)\\s*=\\s*(.*)$/);
        if (constMatch) {
          inValues = true;
          valueLines.push('// ' + constMatch[1]);
          valueLines.push(constMatch[2]);
          valueLines.push('');
        } else if (!inValues) {
          typeLines.push(line);
        }
      }

      const typeBlock = typeLines.join('\\n').trim();
      const values = valueLines.join('\\n').trim();

      return '/*\\n  ' + typeBlock.split('\\n').join('\\n  ') + '\\n*/\\n\\n' + values + '\\n';
    }

    const DISALLOWED_KEYWORDS = [
      'function', 'class', 'interface', 'const', 'let', 'var',
      'import', 'export', 'return', 'if', 'else', 'for', 'while',
      'do', 'switch', 'case', 'break', 'continue', 'throw', 'try',
      'catch', 'finally', 'new', 'delete', 'typeof', 'void', 'yield',
      'await', 'async', 'enum', 'namespace', 'module', 'declare',
      'abstract', 'implements', 'extends',
    ];

    function validateTjsonContent(model) {
      const content = model.getValue();
      const lines = content.split('\\n');
      const customMarkers = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('//')) continue;

        // Allow: type declarations, field definitions, const _vN assignments (our generated code)
        if (line.startsWith('type ')) continue;
        if (line.match(/^\\w+\\??\\s*:\\s*.+/)) continue;
        if (line.match(/^const _v\\d+:/)) continue;
        if (line.match(/^[|&{}\\/\\[\\]",\\d\\-]/) || line === 'true' || line === 'false' || line === 'null') continue;

        for (const kw of DISALLOWED_KEYWORDS) {
          if (line.startsWith(kw + ' ') || line.startsWith(kw + '(') || line === kw) {
            customMarkers.push({
              severity: monaco.MarkerSeverity.Error,
              message: "'" + kw + "' is not allowed in typed-json. Only type declarations and JSON values are permitted.",
              startLineNumber: i + 1,
              startColumn: 1,
              endLineNumber: i + 1,
              endColumn: lines[i].length + 1,
            });
            break;
          }
        }
      }

      // Merge with existing TS markers
      const existingMarkers = monaco.editor.getModelMarkers({ resource: model.uri })
        .filter(m => m.owner !== 'tjson-validator');
      monaco.editor.setModelMarkers(model, 'tjson-validator', customMarkers);
    }

    // Initialize Monaco
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
      // Configure TypeScript
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        strict: true,
        noEmit: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      });

      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      editor = monaco.editor.create(document.getElementById('editor-container'), {
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        tabSize: 2,
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        wordWrap: 'on',
      });
      window.editor = editor;
      window.monaco = monaco;

      editor.onDidChangeModelContent(() => {
        isDirty = true;
        setStatus('', 'Modified');

        // Run custom tjson validation + check TS errors after a delay
        clearTimeout(editor._errorCheck);
        editor._errorCheck = setTimeout(() => {
          validateTjsonContent(editor.getModel());
          const allMarkers = monaco.editor.getModelMarkers({ resource: editor.getModel().uri });
          const errors = allMarkers.filter(m => m.severity === monaco.MarkerSeverity.Error);
          if (errors.length > 0) {
            setStatus('error', errors.length + ' error(s)');
          } else {
            setStatus('ok', 'No errors (modified)');
          }
        }, 1000);
      });

      // Ctrl+S to save
      editor.addAction({
        id: 'save-file',
        label: 'Save File',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: saveFile,
      });

      loadFiles();
    });
  </script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
    return;
  }

  if (url.pathname === "/api/files") {
    const files = findTjsonFiles(dir);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(files));
    return;
  }

  if (url.pathname === "/api/file" && req.method === "GET") {
    const name = url.searchParams.get("name");
    if (!name || name.includes("..")) {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    try {
      const content = readFileSync(join(dir, name), "utf-8");
      const { typeBlock } = parseTjsonForEditor(content);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content, typeBlock }));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }

  if (url.pathname === "/api/file" && req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { name, content } = JSON.parse(body);
        if (!name || name.includes("..")) {
          res.writeHead(400);
          res.end("Bad request");
          return;
        }
        writeFileSync(join(dir, name), content);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(err.message);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  typed-json editor`);
  console.log(`  Serving: ${dir}`);
  console.log(`  Open: ${url}\n`);
  if (!noOpen) openBrowser(url);
});
