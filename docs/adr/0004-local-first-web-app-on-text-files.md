---
status: superseded by ADR-0008
---

# Local-first web app on text files

Visual Anything runs in the browser and works on a project folder of text files on the user's disk, with no server or accounts. Files are JSON with Visual Anything's own extensions, validated against a published schema. We chose this so anyone can use it without installing anything, to avoid running infrastructure or holding other people's data, and so projects can be versioned with git, reviewed line by line in a pull request, and read and written by both people and Claude through MCP.

## Considered options

- **Desktop app** (Tauri or Electron): not as the first platform; it can be packaged later on the same base.
- **Web app with a server and accounts**: rejected. Requires operating infrastructure and holding user data.
- **Obsidian or VS Code plugin**: rejected. Ties the product to another host and its limits.
- **Local database (SQLite) or binary format**: rejected. Versions cannot be compared or changes reviewed line by line.
- **YAML**: rejected. Ambiguous in edge cases, slower to parse, and loses comments when the app rewrites it.

## Consequences

Opening a local folder directly depends on the browser's File System Access API, available in Chrome and Edge; other browsers will need import and export.
