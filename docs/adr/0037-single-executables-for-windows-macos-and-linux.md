---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions, after the user asked for Visual Anything to run on several operating systems. -->

# The local program also ships as a single executable for Windows, macOS and Linux

Besides the npm package of ADR 0013, the local program ships as one executable file per operating system and processor: Windows x64 (`visual-anything.exe`), macOS arm64 and x64, and Linux x64 and arm64. Each holds Node's runtime, the server bundled into one script, and the built app as embedded assets. It needs nothing else installed. Started, it does what `visual-anything` does today: serves the app on 127.0.0.1 and opens the browser. `visual-anything mcp` is Claude's MCP entry point, so Claude Desktop and Claude Code are set up with the executable's path.

The executables are Node single executable applications (SEA), built in continuous integration on each operating system. The test suite runs on Windows, macOS and Linux on every change, and each executable is smoke-tested before it is kept: it opens a sample project, answers on 127.0.0.1, and the MCP entry point lists its tools.

We chose this because the person should not need Node, pnpm or the repository to use Visual Anything on any of the three systems. The architecture of ADR 0004 and ADR 0013 stays as it is, a local program and the browser, so a desktop window is not needed. Every dependency the server uses is plain JavaScript, so nothing is compiled per platform. Building and testing on all three systems from now on finds what differs between them, such as paths and file locks, while each difference is still small.

## Considered options

- **Electron or Tauri, with a window of its own**: rejected for now. It adds a second runtime and an updater to keep, for no benefit over the browser the app already runs in. It can come later as a thin shell around the same local program.
- **Only the npm package**: rejected. It needs Node and a terminal, which is a developer's setup.
- **Bun or Deno compiling a binary**: rejected. The server runs on Node, and its tests run on Node; a second runtime would need its own checks.
- **Building every platform's executable on one machine**: rejected. macOS executables must be signed on macOS, and each executable is smoke-tested where it runs.

## Consequences

- The server reads the built app from the executable's assets when it is one, and from `packages/app/dist` otherwise.
- Releases are unsigned while the repository is private. Windows SmartScreen and macOS Gatekeeper then warn the first time. macOS executables are signed ad hoc so that they run at all. Signing with a Windows certificate and an Apple Developer ID, with notarization, comes when Visual Anything is published.
- Installers (an MSI, a macOS package, a Linux AppImage or package) and updates come later, as Track D's last stage.
- CI takes longer: the suite runs on three systems.
