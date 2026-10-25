# Visual Anything

Make any concept or system visual and explore it interactively. Private, work in progress toward v0.1.

- Domain language: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)
- v0.1 scope, milestones and tasks: [docs/spec-v0.1.md](docs/spec-v0.1.md)
- Building it with Claude Code: [docs/playbook.md](docs/playbook.md), with the agent rules in [CLAUDE.md](CLAUDE.md)

## Opening a project

Run `pnpm dev` (or `pnpm start`) at the repository root. Visual Anything opens your browser on the sample project at an address that works once, within two minutes. In the terminal where it runs, press `o` to open another tab, or `a` to print another such address; with `--no-open` it prints one at start. The session token never appears on screen or in an address: the tab gets it when it opens and keeps it for reloads.

## Running the executable

Visual Anything also comes as one executable file for each system, which needs nothing else installed: no Node.js, pnpm or repository (ADR 0037). Take yours from the assets of a release, or make it for the system you are on with `pnpm package`, which writes `dist-exe/visual-anything` (`visual-anything.exe` on Windows).

| System | File |
| --- | --- |
| Windows x64 | `visual-anything-windows-x64.exe` |
| macOS on Apple silicon | `visual-anything-macos-arm64` |
| macOS on Intel | `visual-anything-macos-x64` |
| Linux x64 | `visual-anything-linux-x64` |
| Linux on ARM (64-bit) | `visual-anything-linux-arm64` |

Each release also holds `SHA256SUMS`. Check your file against it with `sha256sum -c SHA256SUMS --ignore-missing` on Linux, `shasum -a 256 -c SHA256SUMS --ignore-missing` on macOS, or `Select-String (Get-FileHash .\visual-anything-windows-x64.exe).Hash SHA256SUMS` in PowerShell, which prints the file's line when the hash matches.

Run it in a terminal, in the folder where it is or with its full path:

```sh
visual-anything [folder] [--port <n>] [--no-open]
```

It opens the project in `folder` (the current folder when left out), serves it on 127.0.0.1 and opens your browser, as `pnpm start` does; with `--no-open` it prints an address that works once instead. Press Ctrl+C to stop it. `visual-anything mcp` is the MCP server Claude starts (see below); to open a folder that is named `mcp`, write `./mcp`. The executable serves the app it was built with, so `--dev` works only from the repository.

The executables are not signed yet, so each system warns the first time:

- **Windows.** Started from Explorer, a file you downloaded shows "Windows protected your PC: Microsoft Defender SmartScreen prevented an unrecognized app from starting". Choose **More info**, then **Run anyway**. To start it from a terminal without that, unblock it once: right-click it, choose **Properties** and tick **Unblock**, or run `Unblock-File .\visual-anything-windows-x64.exe` in PowerShell. If Smart App Control is on (Windows 11), it blocks unsigned programs and offers no way through for one program; until releases are signed, the executable then cannot run there, and `pnpm start` from the repository still can. Windows Firewall does not ask, since Visual Anything listens on 127.0.0.1 only.
- **macOS.** The executable is signed ad hoc, which lets it run but does not identify its maker. Make it executable after downloading, with `chmod +x visual-anything-macos-arm64`. The first run of a file a browser downloaded shows "“visual-anything-macos-arm64” Not Opened: Apple could not verify it is free of malware". Choose **Done**, open **System Settings**, then **Privacy & Security**, choose **Open Anyway** beside the message about it, and run it again; macOS asks once more, with your password. Or remove the quarantine a browser puts on downloads before the first run: `xattr -d com.apple.quarantine visual-anything-macos-arm64`.
- **Linux.** Nothing warns. Make it executable after downloading, with `chmod +x visual-anything-linux-x64`. It needs glibc 2.28 or later (Debian 10, Ubuntu 20.04, Fedora 29, RHEL 8 or later; not Alpine), and opens the browser through `xdg-open`, which comes with `xdg-utils`; without it, use `--no-open`.

## Claude through MCP

Claude works on the project Visual Anything has open through an MCP server that Claude Code or Claude Desktop starts. It attaches to the Visual Anything running on the project, and starts one in the background when none runs, which stops by itself once nothing has been connected to it for a minute. Every change Claude makes is one action in your undo history, labelled Claude, and you undo it in the app like your own. Claude's guidance (highlights, focus, moves of the canvas and captions) shows while the app is open; ask Claude to open it.

Below, replace `<project>` with the absolute path of a project folder. Leave it out to attach to whichever single Visual Anything is running. On Windows, write paths with forward slashes, as in `C:/Users/you/visual-anything.exe`, or with doubled backslashes in JSON.

### With the executable

The server is the executable itself, with `mcp` as its first argument. Replace `<executable>` with its absolute path, such as `/Users/you/bin/visual-anything-macos-arm64` or `C:/Users/you/bin/visual-anything-windows-x64.exe`. Run it once from a terminal first, so that macOS or Windows has let it through (see above): Claude starts it in the background, where no warning can show.

**Claude Code**, from any folder:

```sh
claude mcp add visual-anything -- <executable> mcp <project>
```

Add `--scope user` after `add` to have it in every folder. `claude mcp list` shows whether it connects.

**Claude Desktop**: open Settings, then Developer, then Edit Config, and add the server to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "visual-anything": {
      "command": "<executable>",
      "args": ["mcp", "<project>"]
    }
  }
}
```

The Visual Anything that Claude starts when none runs is the same executable, on the project, without opening the browser; ask Claude to open the app.

### From the repository

The server is `packages/server/src/mcp-cli.ts`, run with the `tsx` that `pnpm install` puts in the repository. Below, replace `<repo>` with the absolute path of this repository; a project can be `<repo>/examples/my-systems`. A program Claude starts serves the built app, so run `pnpm build` once first, or add `--dev` after the project to serve it from its sources.

**Claude Code**, from any folder:

```sh
claude mcp add visual-anything -- node <repo>/node_modules/tsx/dist/cli.mjs <repo>/packages/server/src/mcp-cli.ts <project>
```

Add `--scope user` after `add` to have it in every folder. `claude mcp list` shows whether it connects.

**Claude Desktop**: open Settings, then Developer, then Edit Config, and add the server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "visual-anything": {
      "command": "node",
      "args": [
        "<repo>/node_modules/tsx/dist/cli.mjs",
        "<repo>/packages/server/src/mcp-cli.ts",
        "<project>"
      ]
    }
  }
}
```

Restart Claude Desktop afterwards.

Then ask Claude, for example: "Build a view of my booking system from this description", "Walk me through the System overview", or "Which services write to the Appointments DB?".

How it stays safe: the server reaches Visual Anything only on 127.0.0.1, through an endpoint and a credential of its own that accept only what Claude may send (commands, guidance and opening the app; never undo, redo or your preferences). The credential sits in a record only your account can read, in `%LOCALAPPDATA%\Visual Anything\run` on Windows, `~/Library/Application Support/Visual Anything/run` on macOS, and `$XDG_RUNTIME_DIR/visual-anything` or `~/.local/state/visual-anything/run` elsewhere. Text in a project is passed to Claude as data, never as instructions.

## Contributor notes

The commands are in [CLAUDE.md](CLAUDE.md). Two of them make and check the executable for the system you are on: `pnpm package` builds the app and writes `dist-exe/visual-anything` (`.exe` on Windows), and `pnpm smoke` starts it on a copy of `examples/my-systems` with no Node.js on its search path, checks that it answers on 127.0.0.1 and that `visual-anything mcp` lists its tools and reads the project, and stops it. `pnpm smoke --browser` also checks that it opens the browser: on macOS and Linux through a stand-in for `open` or `xdg-open` that records the address, on Windows by opening yours.

The repository is private on GitHub's free plan, which gives about 2,000 Actions minutes a month and counts a minute on Windows twice and one on macOS ten times. So CI runs on each system only where it is worth it:

| Trigger | What runs | About |
| --- | --- | --- |
| Push to any branch, including `develop` | `CI`: Linux only, Node 22 and 24: install, typecheck, lint, test, build. | 10 minutes |
| Pull request to `master`, or `workflow_dispatch` | `CI`: the full matrix, Windows, macOS and Linux (D1). | 90 minutes |
| Pushed tag `v*`, or `workflow_dispatch` | `Executables`: build and smoke-test the five executables, then attach them with `SHA256SUMS` to the tag's release (D2). | 140 minutes |

Every workflow cancels a run still going on the same branch or tag when a newer one starts, caches pnpm's store, lets each job of a matrix finish when another fails, and stops a job that runs past its time limit. The executables are kept as artifacts for 7 days, as the plan stores 500 MB of them. The test run ends by listing every test it skipped on that system, and why.
