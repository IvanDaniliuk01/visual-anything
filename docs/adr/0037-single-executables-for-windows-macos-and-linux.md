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

## Clarifications

<!-- Decided by Claude on 2026-10-24, building D1 and D2, under the user's standing delegation of design decisions. -->

- **When CI runs where.** The repository is private on GitHub's free plan, about 2,000 minutes a month, with a minute on Windows counted twice and one on macOS ten times. So a push to any branch runs the suite on Linux only, with Node 22 and 24; a pull request to `master` or a manual run adds Windows and macOS, with Node 22; and the executables are built and smoke-tested on a pushed tag `v*` or a manual run, not on every change to the default branch. A tag's executables are attached to its release with `SHA256SUMS`.
- **Runners.** Windows x64 on `windows-latest`, macOS arm64 on `macos-15`, macOS x64 on `macos-15-intel` (GitHub's last Intel image), Linux x64 on `ubuntu-24.04` and Linux arm64 on `ubuntu-24.04-arm`.
- **The Node.js inside.** An executable holds the Node.js that made it; CI makes them with Node 24, a long-term support release the suite runs on. They need glibc 2.28 or later on Linux, as Node 24 does.
- **How it is made.** esbuild bundles `packages/server/src/cli.ts` into one CommonJS script, with `import.meta.url` standing for the executable's own path. The sea-config is written by `pnpm package` for each build, since the app's file names change with every build: it embeds the script with V8's code cache, and each regular file of `packages/app/dist` as the asset `app/<its path>`; a link in the build is refused. postject injects the blob. On macOS the signature is removed and the executable signed ad hoc; on Windows postject's rewrite leaves it unsigned.
- **What the executable serves.** Only the files under `app/`, by request paths checked as for a folder, with the same headers and page and worker policies, the inline scripts' hashes read from the `index.html` it holds. It has no dev mode: `--dev` is refused.
- **Claude's entry point.** `visual-anything mcp [folder]` is the MCP server, for the repository's `cli.ts` and the executable alike; a folder named `mcp` is opened as `./mcp`. From the executable, it starts the program by starting the executable itself. It exits once Claude closes its stdin.
- **Opening the browser on Linux.** The executable uses the system's `xdg-open`, as the `open` package does when it is bundled; it does not carry the copy that package ships.
- **Release files.** `visual-anything-<system>-<processor>`, with `.exe` on Windows: `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64`, `linux-arm64`, and `SHA256SUMS` beside them. They are plain executables, not archives, so on macOS and Linux the person marks the downloaded file executable with `chmod +x`.
