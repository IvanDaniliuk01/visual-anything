---
status: accepted
---

<!-- Asked by the user on 2026-11-03, before R1: "al no tener el .exe, médicos, traders no van a tener ni idea de cómo utilizar el proyecto", and "deberíamos hacer una pantalla en el frontend para poder elegir el proyecto que queremos que se despliegue". Decided by Claude under the user's standing delegation of design decisions. -->

# A home for projects, and Claude connected in one step

People who never open a terminal, such as doctors and traders, will start Visual Anything by double-clicking the executable. Today that opens the folder it was started from as a project: Downloads, or wherever the file sits. Nothing lets them pick a project, come back to one they used, or start one from their world's sample. Connecting Claude Desktop means editing a JSON file by hand.

## Decision

### 1. The program can start at home, with no project open

- **When home is used.** The program starts at home when it is given no folder: `visual-anything` alone, which is what a double-click runs. `visual-anything <folder>` and `visual-anything .` open that folder as before, and `new`, `open` and `mcp` keep their meaning. The guide's "the current folder when left out" changes to "home when left out".
- **Home is behind the same checks** of Host, Origin, token and launch code as a project (ADR 0030). The program greets each app with `home/offered`, in place of `project/opened` or `start/offered` (ADR 0051). That message carries:
  - **the projects folder**, `Documents/Visual Anything` in the person's home folder, made when first needed;
  - **the projects in it**: each subfolder that holds a `.vaproject`, with its name, its world (the first built-in package it uses besides Systems) and when it last changed;
  - **recent projects**: the last 10 opened, as absolute paths, kept in the preferences as `recentProjects` (ADR 0032). One whose folder is gone is shown as missing and can be removed from the list;
  - **the samples** (ADR 0051).

### 2. The Projects screen

The app shows home as a **Projects** screen, with the product's mark, in the person's language and theme:

- **Open a project** from the projects folder or the recent list.
- **New project:** a name, then empty or from a sample, shown as cards by world. It is written as a subfolder of the projects folder, named from the project's name, as `start/create` writes one today.
- **Open a folder…** takes an absolute path typed or pasted. The program opens it only when it exists and either holds a `.vaproject` or holds nothing yet, which shows the start screen. Otherwise it says why. The app sending the path holds the session token, so it is the person's own app, as for every other command. The path is checked, never run, and only a folder is ever read from it.

**Choosing a project** sends `home/open`. The program opens that project and becomes its session for every app connected. It writes the record that lets Claude attach, and adds the project to the recent list.

**"Projects…"** in the header's menu takes the program back home. It closes the open project only after every write has landed, and then every connected app shows the Projects screen. A Claude attached to the closed project is told that no project is open (ADR 0029).

### 3. Claude connected in one step

- **`visual-anything setup-claude`** adds Visual Anything to Claude Desktop's configuration (`claude_desktop_config.json` in Claude's folder for the system). It adds `mcpServers["visual-anything"]` with the running executable's absolute path and `["mcp"]`. That attaches to whichever single Visual Anything is running (ADR 0029).
  - It first copies the file to `claude_desktop_config.json.bak`.
  - It changes no other key, and refuses a file that is not valid JSON, saying so.
  - Run twice, it changes nothing.
  - It prints the `claude mcp add` command for Claude Code, which it does not run.
- **"Connect Claude…"** in the header's menu does the same from the app, after the person confirms, through `claude/setup`. Run from the sources there is no single executable to point at, so the dialog shows the command to copy instead.
- **What it never does:** it writes only that one file and its backup, and it never starts or restarts Claude. Restarting Claude Desktop is the person's step, and the dialog says so.

### 4. A README for everyone

The README starts with **Download** and three steps: download the file for your system, open it, pick a sample from your world. These come before anything about pnpm or terminals. The warning an unsigned file shows on each system, and how to get through it, follows at once.

## Considered options

- **A native folder picker:** rejected for now. Node has none across systems without a dependency per system, and typing or pasting a path works everywhere.
- **Several projects open at once in one program:** rejected. ADR 0016's one model and history per program stays; home switches between projects.
- **Writing Claude Code's configuration too:** rejected. `claude mcp add` is Claude Code's own way, and printing it keeps us out of its files.

## Consequences

- The live protocol gains `home/offered`, `home/open`, `home/close`, `claude/setup` and their answers, so its version goes up.
- The preferences gain `recentProjects`.
- The executable's double-click is the main way in for people who never use a terminal; signing it (D3) matters more now.

## Clarification of 2026-11-03: building sections 3 and 4

Decided by Claude while building them, under the user's standing delegation:

- **Telling the executable from the sources** is `node:sea`'s `isSea()`, as `isExecutable()` already does. From the sources, `setup-claude` and "Connect Claude…" write nothing and give the entry to add by hand: Node.js by its absolute path, running `packages/server/src/mcp-cli.ts` through the repository's `tsx`, with `TSX_TSCONFIG_PATH` set, as the guide writes it.
- **Claude Desktop's folder** is `%APPDATA%\Claude` on Windows (`~\AppData\Roaming\Claude` when `APPDATA` is not an absolute path), `~/Library/Application Support/Claude` on macOS, and `$XDG_CONFIG_HOME/Claude` or `~/.config/Claude` elsewhere, where Electron keeps an application's data. A relative variable is passed over.
- **What "changes nothing" means.** An entry for `visual-anything` that is already exactly `{ command: <this executable>, args: ["mcp"] }` is left as it is, with no backup made. Any other entry under that name, such as one naming a project or an older executable, is replaced, after the backup. A missing file is created, with its folder, and there is nothing to back up. The file is written atomically, with two spaces of indentation; the order of its keys is kept. A file over 4 MiB, a top level that is not a JSON object, or an `mcpServers` that is not one is refused like JSON that does not parse.
- **The live messages** are `claude/setup`, which holds only its request id, and its answer `claude/setup-answer`, with `outcome` (`written`, `already`, `from-sources` or `refused`), the configuration's path, the backup's when one was made, the entry, the Claude Code command, and `why` for a refusal. The protocol goes to version 8.
- **Who answers it.** The HTTP server answers `claude/setup` itself, before the message reaches whatever is open (a project, the start screen, or home), since it touches no project. One request runs at a time. A program given no way to set Claude up (tests) refuses with why.
- **Where "Connect Claude…" is.** It is the last item of the header's menu, under the language and the theme, shown only while the local program is connected. The menu keeps its name, "Language and theme", until home's "Projects…" joins it; naming the menu then is left to that change.
- **The README's warnings** are the short form of the guide's; Smart App Control and quarantine removal stay in the guide.

## Clarification of 2026-11-03: building sections 1 and 2

Decided by Claude while building them, under the user's standing delegation:

- **One protocol version.** Home's messages join version 8 with `claude/setup`, since no build of 8 shipped.
- **The messages.** `home/offered` carries the projects folder's absolute path, its projects (path, name, world, last change in milliseconds), the recent projects (path and `missing`, with name, world and last change when not missing) and the samples; it is sent again to every app at home whenever the list changes, and answers `home/close` and `home/forget` by their request id. An app sends `home/open` with an absolute path, `home/create` with a name, an optional sample and, for an empty project, its first view's name, `home/forget` with a path, and `home/close`. Opening and starting are answered with `project/opened` to every app, or `start/offered` for an empty folder. `home/create` and `home/forget` are beyond the four messages section 1 names; they keep "new" and "remove from the list" apart from opening a path.
- **Claude at home.** Claude stays attached to the program across projects: it gets `project/closed` with a sentence to say when the project closes, and `project/opened` when the next one opens, which may be another project. While no project is open its MCP entry point refuses every tool with that sentence. The record that lets Claude attach is removed when the project closes and written for the next one; at home there is none, so a Claude that starts then finds no program, as for one that is not running.
- **The projects folder** is `Visual Anything` in the Documents folder: the profile's `Documents` on Windows, or `OneDrive\Documents` when only that one exists (the registry's redirected folder is not read, so that nothing is run); `~/Documents` on macOS; an absolute `XDG_DOCUMENTS_DIR` or `~/Documents` elsewhere; the home folder itself when there is no Documents folder. An absolute `VISUAL_ANYTHING_PROJECTS` names it instead. Listing never makes it; writing a new project does.
- **Listing.** A project is a subfolder, not a link, holding a `.vaproject` file; its name is the project file's, read only when the file is at most 1 MiB, or the folder's; its world is the first built-in package besides Systems; its last change is the latest modification time of the folder and the entries directly in it, since every write renames a temporary file into its folder. The newest first, at most 500.
- **A new project's folder** is its name without the characters Windows refuses, control characters, or dots and spaces at its ends, at most 80 characters, "Project" when nothing is left, with " project" after a device's name such as `CON`; "Name 2" up to "Name 100" when taken. A sample's project file takes the name the person gave.
- **A typed folder** must be an absolute path on this computer: a network or device path (`\\server\share`, `\\?\`) is refused on Windows. It is resolved to its real path, must be a folder that holds a `.vaproject` file, or nothing but entries whose names start with a dot; anything else is refused with why, in the person's language.
- **One program per folder** (ADR-0044): opening a project another Visual Anything has open asks that one to open a tab, and says so, instead of opening it twice.
- **The recent list** holds every project the program opens, from home or from the command line, by its real path, the latest first, compared without case on Windows and macOS. It lives in `preferences.json` as `recentProjects`, beside the preferences the core knows rather than among them, since only the program changes it: an app's `preferences/set` cannot.
- **"Projects…"** is in the header's menu above "Connect Claude…", shown while a project or a start screen is open. The menu, which now holds more than the language and the theme, is named "Menu".
- **At home, a command line `--view`** is refused, since home has no view; `visual-anything .` opens the current folder as before.

- 2026-11-03 (the Projects screen polished): **a new project starts in one click.** The name is optional; left empty, it takes the sample's title, or "My project" for an empty one, and `home/create` still always carries a name. A sample's card names the world its title names ("Machine learning: churn classifier"), and the world of its packages only when its title names none.
