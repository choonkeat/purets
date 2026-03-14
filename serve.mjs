#!/usr/bin/env node

import { createServer } from "http";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, join, dirname } from "path";
import { exec } from "child_process";
import { platform } from "os";

// Parse args
const args = process.argv.slice(2);
const portFlag = args.find((a, i) => args[i - 1] === "--port") || null;
const dirArg = args.find((a) => !a.startsWith("--") && a !== portFlag) || ".";
const noOpen = args.includes("--no-open");

// If the path is a file, use its parent directory as the serving root
const resolved = resolve(dirArg);
const dir = statSync(resolved).isFile() ? dirname(resolved) : resolved;
const port = parseInt(portFlag || process.env.PORT || "3000");

function openBrowser(url) {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`, () => {});
}

function findDataTsFiles(baseDir) {
  const files = [];
  function walk(d, prefix = "") {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory() && entry !== "node_modules" && entry !== ".git") {
        walk(full, rel);
      } else if (entry.endsWith(".pure.ts")) {
        files.push(rel);
      }
    }
  }
  walk(baseDir);
  return files.sort();
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>datats</title>
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

    .tree-folder {
      user-select: none;
    }
    .tree-label {
      padding: 4px 8px;
      cursor: pointer;
      font-size: 13px;
      color: #ccc;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tree-label:hover { background: #2a2d2e; }
    .tree-icon {
      flex-shrink: 0;
      font-size: 13px;
    }
    .tree-folder.collapsed > .tree-children { display: none; }
    .tree-folder.collapsed > .tree-label > .tree-icon::before { content: '\\1F4C1'; }
    .tree-folder:not(.collapsed) > .tree-label > .tree-icon::before { content: '\\1F4C2'; }
    .tree-children {
      margin-left: 8px;
      padding-left: 12px;
      border-left: 1px solid #3c3c3c;
    }
    .file-icon::before { content: '\\1F4C4'; }
    .file-icon { flex-shrink: 0; font-size: 12px; }
    .file-item {
      padding: 4px 8px;
      cursor: pointer;
      font-size: 13px;
      color: #ccc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
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

    #back-btn {
      display: none;
      background: none;
      border: none;
      color: #888;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      line-height: 1;
    }
    #back-btn:hover { background: #3c3c3c; color: #fff; }

    /* Mobile: single-panel layout */
    @media (max-width: 768px) {
      body { flex-direction: column; }

      #sidebar {
        width: 100%;
        border-right: none;
        border-bottom: 1px solid #3c3c3c;
      }

      /* When a file is open on mobile, hide sidebar and show editor full-width */
      body.mobile-editor-open #sidebar { display: none; }
      body.mobile-editor-open #main { display: flex; }

      /* When no file is open on mobile, show sidebar full-height, hide main */
      body:not(.mobile-editor-open) #main { display: none; }
      body:not(.mobile-editor-open) #sidebar { flex: 1; }

      #back-btn { display: inline-block; }
      #filename { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40vw; }
      #save-hint { font-size: 10px; }

      #toolbar { padding: 0 8px; gap: 6px; }
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <h2>.pure.ts files</h2>
    <div id="file-list"></div>
  </div>
  <div id="main">
    <div id="toolbar" style="display:none">
      <button id="back-btn" onclick="backToFiles()" title="Back to files">&#8592;</button>
      <span id="filename"></span>
      <span id="status"></span>
      <span id="save-hint">Ctrl+S to save</span>
      <button id="close-btn" onclick="closeFile()" title="Close file">&times;</button>
    </div>
    <div id="editor-container" style="display:none"></div>
    <div id="welcome">Select a .pure.ts file to start editing</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
  <script>
    // Exposed on window for testing
    let editor = null;
    window.editor = null;
    let currentFile = null;
    let isDirty = false;

    async function loadFiles() {
      const res = await fetch('/api/files');
      const files = await res.json();

      // Build tree structure from flat paths
      const tree = {};
      files.forEach(f => {
        const parts = f.split('/');
        let node = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node[parts[i]]) node[parts[i]] = {};
          node = node[parts[i]];
        }
        node[parts[parts.length - 1]] = f; // leaf = full path
      });

      const list = document.getElementById('file-list');
      list.innerHTML = '';
      renderTree(tree, list, '');
    }

    function renderTree(node, parent, prefix) {
      const entries = Object.keys(node).sort((a, b) => {
        const aIsDir = typeof node[a] === 'object';
        const bIsDir = typeof node[b] === 'object';
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.localeCompare(b);
      });

      for (const key of entries) {
        if (typeof node[key] === 'object') {
          // Folder
          const folder = document.createElement('div');
          folder.className = 'tree-folder';
          const label = document.createElement('div');
          label.className = 'tree-label';
          label.innerHTML = '<span class="tree-icon"></span> ' + key;
          label.onclick = () => folder.classList.toggle('collapsed');
          folder.appendChild(label);

          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(node[key], children, prefix + key + '/');
          folder.appendChild(children);
          parent.appendChild(folder);
        } else {
          // File
          const el = document.createElement('div');
          el.className = 'file-item';
          el.innerHTML = '<span class="file-icon"></span> ' + key;
          el.dataset.path = node[key];
          el.onclick = () => openFile(node[key]);
          parent.appendChild(el);
        }
      }
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
      document.body.classList.remove('mobile-editor-open');
    }

    function backToFiles() {
      // On mobile: go back to file list without closing the file
      closeFile();
    }

    async function openFile(name) {
      if (isDirty && !confirm('Unsaved changes. Discard?')) return;

      const res = await fetch('/api/file?name=' + encodeURIComponent(name));
      const data = await res.json();

      currentFile = name;
      isDirty = false;

      document.querySelectorAll('.file-item').forEach(el => {
        el.classList.toggle('active', el.dataset.path === name);
      });

      document.getElementById('welcome').style.display = 'none';
      document.getElementById('toolbar').style.display = 'flex';
      document.getElementById('editor-container').style.display = 'block';
      document.getElementById('filename').textContent = name;
      setStatus('ok', 'Ready');
      document.body.classList.add('mobile-editor-open');

      if (editor) {
        const oldModel = editor.getModel();
        if (oldModel) oldModel.dispose();

        // .pure.ts files are valid TypeScript — load directly!
        const uri = monaco.Uri.parse('file:///' + name.replace(/\\//g, '_'));
        const model = monaco.editor.createModel(data.content, 'typescript', uri);
        editor.setModel(model);

        // Check errors after TS diagnostics settle
        setTimeout(() => {
          validateDataTs(model);
          updateStatus();
        }, 2000);
      }
    }

    function setStatus(cls, text) {
      const el = document.getElementById('status');
      el.className = cls;
      el.textContent = text;
    }

    function updateStatus() {
      const model = editor?.getModel();
      if (!model) return;
      const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri });
      const errors = allMarkers.filter(m => m.severity === monaco.MarkerSeverity.Error);
      if (errors.length > 0) {
        setStatus('error', errors.length + ' error(s)');
      } else {
        setStatus('ok', 'No errors');
      }
    }

    async function saveFile() {
      if (!currentFile || !editor) return;

      const content = editor.getValue();
      const res = await fetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentFile, content })
      });

      if (res.ok) {
        isDirty = false;
        setStatus('ok', 'Saved');
        setTimeout(updateStatus, 500);
      } else {
        setStatus('error', 'Save failed');
      }
    }

    // datats subset validator — disallow non-type, non-const constructs
    const DISALLOWED_KEYWORDS = [
      'function', 'class', 'interface', 'let', 'var',
      'import', 'export', 'return', 'if', 'else', 'for', 'while',
      'do', 'switch', 'case', 'break', 'continue', 'throw', 'try',
      'catch', 'finally', 'new', 'delete', 'typeof', 'void', 'yield',
      'await', 'async', 'enum', 'namespace', 'module', 'declare',
      'abstract', 'implements', 'extends',
    ];

    function validateDataTs(model) {
      const content = model.getValue();
      const lines = content.split('\\n');
      const customMarkers = [];
      let inTypeBlock = false;
      let braceDepth = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('*/')) continue;

        // Track type body braces
        if (line.startsWith('type ') && line.includes('{')) inTypeBlock = true;
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        if (inTypeBlock && braceDepth === 0) { inTypeBlock = false; continue; }
        if (inTypeBlock) continue;

        // Allow: type declarations, const with type annotation, closing braces, object/array contents
        if (line.startsWith('type ')) continue;
        if (line.startsWith('const ') && line.includes(':')) continue;
        if (line === '}') continue;
        if (line.match(/^[|&{}\\/\\[\\]",\\d\\-]/) || line.match(/^\\w+\\??\\s*:/) || line === 'true' || line === 'false' || line === 'null') continue;

        for (const kw of DISALLOWED_KEYWORDS) {
          if (line.startsWith(kw + ' ') || line.startsWith(kw + '(') || line.startsWith(kw + '{') || line === kw) {
            customMarkers.push({
              severity: monaco.MarkerSeverity.Error,
              message: "'" + kw + "' is not allowed in .pure.ts files. Only type declarations and const values are permitted.",
              startLineNumber: i + 1,
              startColumn: 1,
              endLineNumber: i + 1,
              endColumn: lines[i].length + 1,
            });
            break;
          }
        }
      }

      monaco.editor.setModelMarkers(model, 'datats-validator', customMarkers);
    }

    // Initialize Monaco
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
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

        clearTimeout(editor._errorCheck);
        editor._errorCheck = setTimeout(() => {
          validateDataTs(editor.getModel());
          updateStatus();
        }, 1000);
      });

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
    const files = findDataTsFiles(dir);
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content }));
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
  console.log(`\n  datats editor`);
  console.log(`  Serving: ${dir}`);
  console.log(`  Open: ${url}\n`);
  if (!noOpen) openBrowser(url);
});
