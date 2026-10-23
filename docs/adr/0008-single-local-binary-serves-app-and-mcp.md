---
status: superseded by ADR-0013
supersedes: ADR-0004
---

# A single local binary serves the app and the MCP server

Visual Anything is delivered as a single local Rust binary that serves the web app on localhost, reads and writes the project folder, and exposes the MCP server through which Claude edits models and drives the open view live (highlight, focus, step). Projects remain folders of JSON files with Visual Anything's own extensions, validated against a published schema, with no hosted server or accounts. We chose this because Claude integration needs a local process anyway (an MCP server cannot run inside a browser tab), and one binary is simpler than a browser app plus a separate bridge; it also removes the dependency on the browser's File System Access API, so the app works in every browser.

## Considered options

- **Pure browser app plus a separate MCP binary bridged over WebSocket**: rejected. Two pieces to install and keep in sync for no extra benefit.
- **Remote MCP server**: rejected. Requires hosting and contradicts local-first.
- **Pure browser app with no install**: kept only as a read-only demo.
- **Desktop app** (Tauri or Electron): may be packaged later on top of the same binary.
- **Web app with a server and accounts, Obsidian or VS Code plugin, SQLite or a binary format, YAML**: rejected for the reasons recorded in ADR-0004.
