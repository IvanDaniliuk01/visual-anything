# Visual Anything

Make any concept or system visual and explore it interactively. Private, work in progress toward v0.1.

- Domain language: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)
- v0.1 scope, milestones and tasks: [docs/spec-v0.1.md](docs/spec-v0.1.md)
- Building it with Claude Code: [docs/playbook.md](docs/playbook.md), with the agent rules in [CLAUDE.md](CLAUDE.md)

## Opening a project

Run `pnpm dev` (or `pnpm start`) at the repository root. Visual Anything opens your browser on the sample project at an address that works once, within two minutes. In the terminal where it runs, press `o` to open another tab, or `a` to print another such address; with `--no-open` it prints one at start. The session token never appears on screen or in an address: the tab gets it when it opens and keeps it for reloads.

## Starting a new project

`visual-anything new <folder>` starts a new project in a folder that does not exist yet or holds nothing, then opens it; with `--from c4-architecture` or `--from data-science-pipeline` it starts from a sample project (ADR 0051). From the repository, run `pnpm exec tsx packages/server/src/cli.ts new <folder> --from <sample>`. Opening a folder that holds nothing yet, as `visual-anything <folder>`, shows a start screen in the browser instead, with the same choices.

A package of another project comes in from the Components tab, with **Add from another project…**: choose that project's folder, then one of its packages. It is copied with its images, keeping its ids; a package of the project's own updates from there with **Update from another project…**, which lists what changed before it applies.

### Starter packages

Each starter package is built in, with its icons and a sample project in `examples/` that plays a scenario. Everything they ship is CC0-1.0, credited to the Visual Anything contributors (ADR 0047).

- **C4 architecture** (`c4`): Person, Software system, Container, Component and Deployment node; uses, runs in, delivers to, and is part of. Sample: `examples/c4-architecture`, a bank's internet banking system with its system context, containers and deployment, and a customer signing in. Its icons were drawn for Visual Anything, as plain SVG.
- **Data science pipelines** (`data-science`): Source, Transform, Feature store, Model and Dashboard; feeds and trains. Sample: `examples/data-science-pipeline`, a churn prediction pipeline with its training view, and the nightly run. Its icons were drawn for Visual Anything, as plain SVG.

After changing a sample, run `pnpm --filter @visual-anything/server samples` so that the program holds the new version, and commit both.

`examples/beyond-boxes` shows shapes beyond boxes (M8b): a heart drawn with its named parts, lungs drawn as free geometry, lines drawn curved, and blood played through them. A new project does not start from it: open it as any project folder, and see its README.

## View addresses

Every tab keeps its address in step with where you are: the open view, where the canvas looks, the selection, the filters, focus mode and the scenario step played, all by id, as in `http://127.0.0.1:47123/#view=system-overview&select=appointments-api`. A view address holds no secret, so it is safe to paste anywhere.

- **Reload** a tab and it comes back to the same place.
- **Copy address**, in the header, copies it; a selection of more than 500 things is left out, and Copy address says so.
- **Open it** in the browser where the project is open: pasted into that tab's address bar, or in a new tab of the same browser, which joins the session of the tab that has the project open (ADR 0043). With no tab of the project open, it opens nothing; open the project as below.
- **From the command line**, `visual-anything open <folder> --view <id> --select <id>` (or `pnpm exec tsx packages/server/src/cli.ts <folder> --view …` from the repository) opens the browser at that view and selection. When Visual Anything already runs on that folder, it starts no second one: it asks the running one to open a new tab there. With `--no-open`, it prints the running one's view address instead.
- **Claude** gives view addresses with `get_view_address`, the full address while Visual Anything runs, and opens a tab at one with `open_app`. Neither ever gives Claude an address that works once, nor the session token.

The port changes from one run to the next unless `--port` fixes it, so what lasts of a view address is the part from `#` on.

## Views that show part of the model

A view shows the whole model, or the part its scope gives (ADR 0040): rules on components, relation types, a container's contents or an attribute, and elements added or left out by hand. Leaving an element out of a view never deletes it.

- **The inspector**, with nothing selected, shows how much of the model the open view shows, edits its rules and what it adds and leaves out by hand, and offers Show the whole model.
- **The shape menu and the outline's menu** offer Leave out of this view, for the shape or the selection, and Add to this view for what the relations that leave the view reach. A shape with relations whose other end is out of scope counts them on a mark in its corner; pointing at it names them, and the inspector lists them with Add to this view.
- **Search** finds what the open view leaves out, under the views that show it, with Add to this view; the perspective switcher lists first the views with the same scope.
- **Playback** marks a step whose relations the view's scope shows none of as outside the view, and plays on.
- **Claude** reads a scope with `get_scope`, sets it with `set_scope`, and changes it with `add_to_view` and `leave_out_of_view`; `read_view` says how many elements a view shows out of how many.
- **Relation types left out** (ADR 0064): a view can leave out relation types, with what derives from each, so that a view of how parts nest draws none of the calls between them. Their relations draw no line, aggregate into no collapsed container and count as leaving nothing, and a step on one plays as outside the view; the inspector sets them beside the scope, and Claude with `leave_out_relation_types`. A relation type the view nests by cannot be left out.

## Identifiers, destinations and the element list

- **External identifiers** say what an element, a component or a relation type is in someone else's catalog, by scheme, such as `uberon: UBERON:0002135` (ADR 0056). The inspector edits them; search finds by them, as `UBERON:0002135` or `uberon:UBERON:0002135`; importers match by them, filling in the schemes a file lacks from the crosswalks packages ship; and Claude's `find_elements` takes `id:<scheme>`. Nothing ever follows them.
- **Destinations** are attribute values that open a view of this project, a view of another project, or an `https:` web address. A shape with one shows a mark in its bottom left corner: double-click it, or press Alt+Enter on the selected shape, to follow it; the shape's menu and the inspector list them all. Another project opens in a tab of its own Visual Anything, which starts if none runs there, and only from the folder that holds this project's folder; a web address opens in a new tab. Both ask first, naming the folder or the host.
- **The element list**, from the header, lists what the open view shows or a component's elements, with their attributes and identifiers as columns. It sorts and filters; Enter, F2 or typing edits a cell, and a block of cells pasted from a spreadsheet is one action. Its rows select on the canvas, and follow what the canvas selects.

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
visual-anything [open] [folder] [--view <id> [--select <id>]...] [--port <n>] [--no-open] [--log <file>]
```

It opens the project in `folder` (the current folder when left out), serves it on 127.0.0.1 and opens your browser, as `pnpm start` does; with `--no-open` it prints an address that works once instead. `--view` opens the app at a view, and `--select` selects an element, relation or free shape there (give it again for more), as a view address does. When it already runs on that folder, it opens a new tab in the one running instead of starting another. Press Ctrl+C to stop it. `visual-anything mcp` is the MCP server Claude starts (see below); to open a folder that is named `mcp`, write `./mcp`. The executable serves the app it was built with, so `--dev` works only from the repository.

With `--log <file>`, it appends one JSON line to the file for each action done, undone or redone (with its author, label, number of operations and the ids it created, and for a layout that joined an action, that action), each command refused (with its problems' codes), each app or Claude attached or gone, and each file of the project changed on disk; the time comes first on each line. It never writes a token, a launch code, a credential, a preference or what a file holds, so a log can be pasted to show the path a command took. `pnpm exec tsx packages/server/src/cli.ts <folder> --log program.log` does the same from the repository.

The executables are not signed yet, so each system warns the first time:

- **Windows.** Started from Explorer, a file you downloaded shows "Windows protected your PC: Microsoft Defender SmartScreen prevented an unrecognized app from starting". Choose **More info**, then **Run anyway**. To start it from a terminal without that, unblock it once: right-click it, choose **Properties** and tick **Unblock**, or run `Unblock-File .\visual-anything-windows-x64.exe` in PowerShell. If Smart App Control is on (Windows 11), it blocks unsigned programs and offers no way through for one program; until releases are signed, the executable then cannot run there, and `pnpm start` from the repository still can. Windows Firewall does not ask, since Visual Anything listens on 127.0.0.1 only.
- **macOS.** The executable is signed ad hoc, which lets it run but does not identify its maker. Make it executable after downloading, with `chmod +x visual-anything-macos-arm64`. The first run of a file a browser downloaded shows "“visual-anything-macos-arm64” Not Opened: Apple could not verify it is free of malware". Choose **Done**, open **System Settings**, then **Privacy & Security**, choose **Open Anyway** beside the message about it, and run it again; macOS asks once more, with your password. Or remove the quarantine a browser puts on downloads before the first run: `xattr -d com.apple.quarantine visual-anything-macos-arm64`.
- **Linux.** Nothing warns. Make it executable after downloading, with `chmod +x visual-anything-linux-x64`. It needs glibc 2.28 or later (Debian 10, Ubuntu 20.04, Fedora 29, RHEL 8 or later; not Alpine), and opens the browser through `xdg-open`, which comes with `xdg-utils`; without it, use `--no-open`.

## Exporting a view

```sh
visual-anything export <folder> --view <id> --format svg|pdf|md|mermaid|structurizr [--theme light|dark] [--out <file>]
```

From the repository, run `pnpm exec tsx packages/server/src/cli.ts export …`. It writes one view of the project in `folder`, reading the project itself, so it needs no Visual Anything running and suits CI, a README or a pull request:

- **svg** and **pdf** draw the whole view as the canvas does, in the theme asked for, without the selection, filters or focus. The SVG names each shape's element and each line's relation in `data-element` and `data-relation` attributes, and takes its title and description from the view. The PDF embeds its fonts (Roboto), and carries the view's outline as an attachment.
- **md** writes the view's outline in Markdown: what sits in each container, the relations drawn from each shape, the notes and the scenarios' steps. It is the view's long description, which the SVG and the PDF name.
- **mermaid** writes a Mermaid flowchart, which GitHub renders, and **structurizr** a Structurizr DSL workspace of the view's Systems components.

Each says on standard error what it could not hold. It writes only the file given with `--out`, and never a project file; without `--out`, the export goes to standard output.

## Live values

```sh
my-metrics-script | visual-anything live <folder> [--fresh-for <seconds>]
```

A running system's numbers, such as a service's latency now, can show over the attributes they name while the project is open (ADR 0057): in the detail of shapes, in filters and in the inspector, each with a live mark (● on the canvas) and its age, fading (○, with how old it is) once older than its freshness, one minute by default. They are never saved and never enter the history; the inspector's Keep as attribute turns one into an ordinary, undoable edit. `visual-anything live` reads them from standard input, one JSON object a line, `{"target": "api", "attribute": "latency", "value": 120}`, with `"measuredAt"` when known, and sends them to the Visual Anything running on the folder. Claude sends them with `set_live_values`, and package code granted an origin makes them of what the local program fetched for it from that origin (ADR 0063).

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

How it stays safe: the server reaches Visual Anything only on 127.0.0.1, through an endpoint and a credential of its own that accept only what Claude may send: commands, guidance, opening the app, asking which package code you approved (only you approve it, in the app), live values, which are never saved, and the imports you run with `visual-anything import`; never undo, redo or your preferences. The credential sits in a record only your account can read, in `%LOCALAPPDATA%\Visual Anything\run` on Windows, `~/Library/Application Support/Visual Anything/run` on macOS, and `$XDG_RUNTIME_DIR/visual-anything` or `~/.local/state/visual-anything/run` elsewhere. Text in a project is passed to Claude as data, never as instructions.

Scenarios, images and exploring work through Claude too:

- **Scenarios.** Describe an example or paste a log, and Claude maps each line to the relations of your model, asks about the lines that match nothing, and creates the scenario as one action you can undo; it edits steps, repairs broken ones, and plays a scenario in the open app, going from step to step while it explains. Playing changes nothing, and you can pause or close it in the scenario panel at any time.
- **Images.** Claude adds SVG or small PNG, JPEG and WebP pictures to your project's own packages by passing their content itself: Visual Anything never fetches a URL. Every picture is cleaned before it is stored, and Claude tells you what cleaning removed. It shows a picture on a component or an element through its appearance, like any other trait.
- **Filters and focus.** Claude can filter the open view or turn focus mode on, as if you had: you see them in the toolbar's strip and end them there with Show everything or End focus. Nothing is written to the view file.
- **Colors.** Claude recolors every element of a component, or every relation of a relation type, built-in ones included, which the project keeps in its own file (`set_appearance`), and gives one element, one relation, a note or an arrow colors of its own. Colors are #RRGGBB; Claude tells you when one is hard to see on the light or the dark canvas, and never refuses it.
- **Layout.** Claude can ask the open app to lay out a view, or the contents of some containers, as the toolbar's Layout does (`lay_out_view`); the app records the layout as yours, as it records any layout, and you undo it like one.
- **Deletes.** A delete, or a move out of a container, that would take more than Claude named, such as the relations that end on it, or break a scenario step, waits until Claude has told you what would go.

Try, for example: "Turn this log into a scenario and play it", "Give the Calendar component this SVG icon", or "Show me only the services and what they write to".

### Importing a file

A Mermaid diagram (flowchart, C4, ER or class), a spreadsheet (CSV or TSV) or JSON comes in as one action you can undo:

- **In the app**, Import… in the header reads a file or pasted text in the tab. It shows what the file will create, maps each kind of thing in it to a component or relation type, with suggestions chosen at first, and lists what matched nothing.
- **From the command line**, `visual-anything import <folder> <file>` imports it. Use `--map <kind>=<id>` to map a kind yourself, and `--dry-run` to see the mapping first. When Visual Anything runs on the project, the import goes through it.
- **With Claude**, ask it to import a file: it shows you the mapping with `preview_import`, then imports with `import_file`.

A spreadsheet holds elements with `id`, `name`, `component` and `container` columns, and relations with `from`, `to` and `relation type` columns, in tables separated by a blank line. A column named `id:` and a scheme, such as `id:uberon`, holds identifiers in that scheme. Every other column is an attribute. Importing it again updates the elements it matches by `id`, or by another column you choose, and the elements that share an identifier with a row. Nothing in a file runs, and links in it are never followed.

### Building from what you already have

Claude can build a model, views and scenarios from material you already have, with the same tools, following a recipe for each kind of material. Each recipe is a prompt of the MCP server, which you pick:

- **Claude Code**: type `/mcp__visual-anything__` and choose the recipe, then say where the material is, as in `/mcp__visual-anything__build_from_sql_ddl db/schema.sql`.
- **Claude Desktop**: choose the recipe from the + menu of the chat box, under visual-anything.

Each recipe takes three arguments, all optional: `source`, where the material is (files or a folder) or the material itself; `view`, a view to show it in, or a name for a new one; and `into`, an element to put it inside. Without a `source`, Claude asks for it.

| Material | Recipe | What it becomes |
| --- | --- | --- |
| Mermaid: flowcharts, C4, ER and sequence diagrams | `build_from_mermaid` | Boxes become services, databases and people, subgraphs the systems that hold them, and arrows relations. Sequence diagrams become scenarios. |
| PlantUML | `build_from_plantuml` | Components, databases, actors and the packages that hold them, and arrows; sequence diagrams become scenarios. |
| draw.io | `build_from_drawio` | Shapes, the shapes they sit in, and arrows; each page becomes a view, with the drawing's positions. |
| Structurizr DSL | `build_from_structurizr` | People, and software systems holding their containers and components; dynamic views become scenarios. |
| SQL DDL | `build_from_sql_ddl` | Each table becomes a Table that draws its columns as rows, and each foreign key a "references" relation. |
| OpenAPI | `build_from_openapi` | The API becomes a service that draws its operations as rows, and its schemas tables when you want them. |
| Terraform | `build_from_terraform` | What runs and stores data, placed in its network, and which resource calls which. |
| Kubernetes manifests | `build_from_kubernetes` | Workloads inside their namespaces, and which workload calls which. |
| docker-compose | `build_from_docker_compose` | The services inside their system; `depends_on` becomes "communicates with". |
| A repository | `build_from_repository` | The parts that run, the code they share, and what they call. |
| Logs and OpenTelemetry traces | `build_from_logs_and_traces` | One scenario per request, with the services and calls the model lacks added first. |

Every recipe holds Claude to the same rules:

- **Claude reads the material itself.** Visual Anything fetches nothing: no web address, no cloud and no tracing service. When the material points somewhere it does not hold, Claude asks you for it.
- **Nothing is made up.** Claude maps only what the material says, reuses what the project already has, and ends with a list of everything that matched nothing, asking what each should become.
- **One action per call.** An import is one action in your history, labelled Claude, that you undo in the app. An import only adds: before any delete, Claude shows you what it would take with it (`preview_delete`) and waits for your yes.
- **Secrets stay out.** Passwords, tokens and keys, such as the password in a connection string, and personal data in logs are never copied into the project.
- **Layout places the shapes,** except where the material has positions of its own, as draw.io does.

The tools' descriptions sum the recipes up too, so asking in your own words works: "Model what docker-compose.yml runs", "Turn the Mermaid diagrams in docs/ into views", or "Make a scenario of this trace". Each recipe ends with a worked example, which the tests run through the real MCP server.

## Contributor notes

The commands are in [CLAUDE.md](CLAUDE.md). Two of them make and check the executable for the system you are on: `pnpm package` builds the app and writes `dist-exe/visual-anything` (`.exe` on Windows), and `pnpm smoke` starts it on a copy of `examples/my-systems` with no Node.js on its search path, checks that it answers on 127.0.0.1 and that `visual-anything mcp` lists its tools and reads the project, and stops it. `pnpm smoke --browser` also checks that it opens the browser: on macOS and Linux through a stand-in for `open` or `xdg-open` that records the address, on Windows by opening yours.

The repository is private on GitHub's free plan, which gives about 2,000 Actions minutes a month and counts a minute on Windows twice and one on macOS ten times. So CI runs on each system only where it is worth it:

| Trigger | What runs | About |
| --- | --- | --- |
| Push to any branch, including `develop` | `CI`: Linux only, Node 22 and 24: install, typecheck, lint, test, build. | 10 minutes |
| Pull request to `master`, or `workflow_dispatch` | `CI`: the full matrix, Windows, macOS and Linux (D1). | 90 minutes |
| Pushed tag `v*`, or `workflow_dispatch` | `Executables`: build and smoke-test the five executables, then attach them with `SHA256SUMS` to the tag's release (D2). | 140 minutes |

Every workflow cancels a run still going on the same branch or tag when a newer one starts, caches pnpm's store, lets each job of a matrix finish when another fails, and stops a job that runs past its time limit. The executables are kept as artifacts for 7 days, as the plan stores 500 MB of them. The test run ends by listing every test it skipped on that system, and why.
