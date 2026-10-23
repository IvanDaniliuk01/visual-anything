---
status: accepted
supersedes: ADR-0008
---

# A single local Node program serves the app and the MCP server

Visual Anything is delivered as a single local Node program, installable from npm and started with one command, that serves the web app on localhost, reads and writes the project folder, and exposes the MCP server through which Claude edits models and drives the open view live (highlight, focus, step). Projects remain folders of JSON files with Visual Anything's own extensions, validated against a published schema, with no hosted server or accounts. We chose this because Claude integration needs a local process anyway (an MCP server cannot run inside a browser tab), one program is simpler than a browser app plus a separate bridge, and it removes the dependency on the browser's File System Access API, so the app works in every browser.

## Considered options

- **A single local Rust binary** (ADR-0008): superseded by the move to TypeScript across the stack (ADR-0011).
- **Pure browser app plus a separate MCP program bridged over WebSocket**: rejected. Two pieces to install and keep in sync for no extra benefit.
- **Remote MCP server**: rejected. Requires hosting and contradicts local-first.
- **Pure browser app with no install**: kept only as a read-only demo.
- **Desktop app** (Tauri or Electron): may be packaged later on top of the same program.
