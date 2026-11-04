# Visual Anything guide

Everything the [README](../README.md) leaves out: opening and starting projects, addresses, the executable, exports, versions, live values, packages, merging with git, Claude through MCP, and notes for contributors.

## Opening a project

Run `pnpm dev` (or `pnpm start`) at the repository root. Visual Anything opens your browser on the sample project at an address that works once, within two minutes. In the terminal where it runs, press `o` to open another tab, or `a` to print another such address; with `--no-open` it prints one at start. The session token never appears on screen or in an address: the tab gets it when it opens and keeps it for reloads.

### Another address, and restarts

- **A new address** that works once: `visual-anything address [folder]` prints one for the Visual Anything running on that folder, or for the only one running, at home too, without its terminal (ADR 0099). In Docker, run `docker exec visual-anything visual-anything address`. Each new address ends the one before, and none holds the session token.
- **Restarts keep the session.** Visual Anything keeps the session token in a private record beside Claude's (only your account can read it), or, in a container, in `/data/preferences/sessions`. Started again on the same folder, or at home on the same projects folder, within a day, it reuses the token on the port it had, so a tab that was open reconnects by itself and says "Visual Anything restarted; reconnected." At home it also opens again the project that was open when it stopped. Before it reconnects, the tab asks the program to prove that it holds the tab's session, and it never sends the token to a program that does not. Another folder, another port (`--port`), or a port taken in the meantime makes a new session, and the tabs of the old one ask for a new address.
- **No pile of tabs.** When Claude opens the app (`open_app`), or you run `visual-anything open <folder>`, while a tab of Visual Anything is connected, that tab comes forward and shows the view asked for, instead of a new tab opening. Claude can ask for a new tab when you want one.

### Home and the Projects screen

Started with no folder, as a double-click on the executable does, Visual Anything starts at **home** and the browser shows the **Projects** screen (ADR 0093):

- **Your projects**: the projects in the projects folder, `Documents/Visual Anything` in your home folder (made the first time a project is written there), each with its world and when it last changed.
- **Recent projects**: the last 10 opened, wherever they are. One whose folder is gone is marked missing, and **Remove from the list** takes it off.
- **New project**: give it a name, then start it empty or from a sample, shown by world. It is written as a subfolder of the projects folder named from the project's name (`Name 2` when `Name` is taken).
- **Open a folder…**: paste the whole path of a folder that holds a project, or nothing yet, which shows the start screen there.

Choosing a project opens it in every tab, and Claude can attach to it. **Projects…**, in the header's **Menu**, closes the project once every change is saved and takes every tab back to the Projects screen; Claude is told that no project is open until you open one. An absolute `VISUAL_ANYTHING_PROJECTS` names another projects folder.

## Starting a new project

`visual-anything new <folder>` starts a new project in a folder that does not exist yet or holds nothing, then opens it; with `--from <sample>`, one of `c4-architecture`, `data-science-pipeline`, `churn-classifier`, `robot-arm`, `order-process`, `clinic-claim`, `workshop-books` and `bookshop-database`, it starts from that sample project (ADR 0051). From the repository, run `pnpm exec tsx packages/server/src/cli.ts new <folder> --from <sample>`. Opening a folder that holds nothing yet, as `visual-anything <folder>`, shows a start screen in the browser instead, with the same choices.

A package of another project comes in from the Components tab, with **Add from another project…**: choose that project's folder, then one of its packages. It is copied with its images, keeping its ids; a package of the project's own updates from there with **Update from another project…**, which lists what changed before it applies.

### Starter packages

Each starter package is built in, with its icons and a sample project in `examples/` that plays a scenario. Everything they ship is CC0-1.0, credited to the Visual Anything contributors (ADR 0047).

- **C4 architecture** (`c4`): Person, Software system, Container, Component and Deployment node; uses, runs in, delivers to, and is part of. Sample: `examples/c4-architecture`, a bank's internet banking system with its system context, containers and deployment, and a customer signing in. Its icons were drawn for Visual Anything, as plain SVG.
- **Data science pipelines** (`data-science`): Source, Transform, Feature store, Model and Dashboard; feeds and trains. Sample: `examples/data-science-pipeline`, a churn prediction pipeline with its training view, and the nightly run. Its icons were drawn for Visual Anything, as plain SVG.
- **Machine learning** (`machine-learning`): Dataset, Tensor, Layer and its kinds (Dense, Convolution, Attention, Embedding, Normalization, Recurrent and Pooling layers), Block and Transformer block, Model and Convolutional network, Loss, Optimizer, Metric and Training run; flows into, adds to, is part of, trains on, is measured by, minimizes and updates. Its Model derives from the Model of Data science pipelines, which starts being used with it. The Transformer block and the Convolutional network are drawings with parts: the layers inside them are drawn as the picture's named parts, `input-embedding`, `positional-encoding`, `multi-head-attention`, `add-norm-1`, `feed-forward`, `add-norm-2` and `output` in the Transformer block, and `conv-1`, `pool-1`, `conv-2`, `flatten`, `dense` and `softmax` in the network. Tensors, losses, optimizers, metrics and training runs have outlines of their own, and residual connections ("adds to") are drawn as dashed curves. Sample: `examples/churn-classifier`, a Transformer that reads each customer's last 90 events beside the pipeline that feeds it, with its training, its architecture and the forward pass. Its icons and both drawings were drawn for Visual Anything, as plain SVG.
- **Physical AI and robotics** (`physical-ai`): Robot, Link, Joint, Sensor (with Camera, Depth camera, LiDAR, IMU, Force-torque sensor and Encoder), Actuator (with Motor, Servo and Gripper), Controller (with Policy, a learned controller), Compute unit, Node and Topic; is attached to, is part of, drives, senses, commands, publishes to, subscribes to, and runs on. A link is drawn as a rounded bar of free geometry. Two drawings with parts come with it: a six-axis arm (`base`, `joint-1` to `joint-6`, `link-1` to `link-6` and `gripper`) and a differential mobile robot (`chassis`, `wheel-left`, `wheel-right`, `lidar`, `camera` and `imu`). A robot that shows one with its parts draws its links, joints and sensors as those parts, so that drives and senses attach to the exact part. Sample: `examples/robot-arm`, a pick-and-place arm with its parts, its kinematic chain and its software, and a command that goes from the policy through the controller and the motor to a joint and is read back. Its icons and drawings were drawn for Visual Anything, as plain SVG.
- **Processes and state machines** (`process`), in the style of BPMN: Pool, Lane, Start event, End event, Intermediate event, Task, Subprocess, Exclusive gateway, Parallel gateway, Inclusive gateway, Data object and Data store; and, for state machines, State, Initial state, Final state and Choice; sequence flow, message flow, association, transition, and is part of. An event's `trigger` (none, message, timer or signal) and a task's `kind` (user, service or manual) are written under its name; the package's message, timer and signal icons show a trigger when an element takes one as its own image. Sample: `examples/order-process` (`--from order-process`), an online shop's order with its process and its states, whose scenarios decide at the stock check whether the order ships or is cancelled. Its events, gateways and data are drawn by free geometry of their own (ADR 0066), its boxes and containers by the kinds, and its icons are plain SVG, all drawn for Visual Anything. BPMN and UML are marks of the Object Management Group; the package is named for what it describes and only draws in their style (ADR 0079).
- **Healthcare** (`healthcare`): Patient, Encounter, Provider (with Practitioner and Provider organization), Payer, Plan, Claim and Claim line, Authorization, Audit and Audit finding, Care plan and Goal, and Clinical record (with Observation, Condition, Procedure and Medication); treats, is for, is covered by, requests, is submitted to, authorizes, bills, pays, denies, audits, is found in, addresses, measures, and is part of. A claim draws its lines as rows and a care plan its goals, so that bills, denies, is found in and measures end on the exact line or goal. Its concepts are those health systems share, as public standards for health data name them; it copies none of their text or pictures. Sample: `examples/clinic-claim` (`--from clinic-claim`), an invented clinic that bills an invented insurer for a knee MRI, with its claim journey, the insurer's audit and the patient's care plan; its scenario follows the claim from the visit through its authorization to a decision, paid in full or the contrast agent denied, and its tour ends on the audit that finds what the review let pass. Every person and organization in it is invented, and it holds no real data. Its icons are plain SVG, drawn for Visual Anything.
- **Finance** (`finance`): Ledger, Account and its kinds (Asset, Liability, Equity, Revenue and Expense accounts), Journal entry, Entry line, Transaction and Payment, Invoice, Party, Instrument, Portfolio, Position, Risk and Control; posts to, debits, credits, records, issues, pays, settles, holds, is exposed to, mitigates, checks, and is part of. Books are kept by double entry: a journal entry draws its lines as its rows, each line debits or credits one account and writes its amount with "Dr" or "Cr", and the entry posts to its ledger. Sample: `examples/workshop-books` (`--from workshop-books`), an invented furniture workshop's books, from an invoice through its payment to the general ledger, its reserve portfolio, and the risks and controls over both, with a scenario that decides at payment matching whether the payment settles the invoice or waits as an unapplied receipt, and the tour "Read the books". The company, its customer and every amount in it are invented. Its icons are plain SVG drawn for Visual Anything, and its shapes are the kinds.

The built-in Data modeling package (`data-modeling`, ADR 0023) has a sample too: `examples/bookshop-database` (`--from bookshop-database`), an invented online bookshop's database, with its `catalog` and `sales` schemas, six tables with their columns, primary keys and foreign keys, the views Overview, Catalog and Sales, and a scenario that follows an order's foreign keys from its customer to a book's author and publisher. It exports to SQL DDL with **SQL DDL (CREATE TABLE)**. The shop and every value in it are invented.

After changing a sample, run `pnpm --filter @visual-anything/server samples` so that the program holds the new version, and commit both.

`examples/beyond-boxes` shows shapes beyond boxes (M8b): a heart drawn with its named parts, lungs drawn as free geometry, lines drawn curved, and blood played through them. A new project does not start from it: open it as any project folder, and see its README.

## View addresses

Every tab keeps its address in step with where you are: the open view, where the canvas looks, the selection, the filters, focus mode and the scenario step played, all by id, as in `http://127.0.0.1:47123/#view=system-overview&select=appointments-api`. A view address holds no secret, so it is safe to paste anywhere.

- **Reload** a tab and it comes back to the same place.
- **Copy address**, in the header, copies it; a selection of more than 500 things is left out, and Copy address says so.
- **Open it** in the browser where the project is open: pasted into that tab's address bar, or in a new tab of the same browser, which joins the session of the tab that has the project open (ADR 0043). With no tab of the project open, it opens nothing; open the project as below.
- **From the command line**, `visual-anything open <folder> --view <id> --select <id>` (or `pnpm exec tsx packages/server/src/cli.ts <folder> --view …` from the repository) opens the browser at that view and selection. When Visual Anything already runs on that folder, it starts no second one: it asks the running one to open a new tab there. With `--no-open`, it prints the running one's view address instead.
- **Claude** gives view addresses with `get_view_address`, the full address while Visual Anything runs, and shows one with `open_app`: in the tab already open, or a new one. Claude is given an address that works once only when no tab is open and the browser cannot be opened, as in a container, to pass on to you; never the session token.

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

Each release also holds `visual-anything-THIRD-PARTY-NOTICES.txt`, the code the executables bundle with its licenses and where its source is, which `visual-anything notices` prints too, and `SHA256SUMS`. Check your file against it with `sha256sum -c SHA256SUMS --ignore-missing` on Linux, `shasum -a 256 -c SHA256SUMS --ignore-missing` on macOS, or `Select-String (Get-FileHash .\visual-anything-windows-x64.exe).Hash SHA256SUMS` in PowerShell, which prints the file's line when the hash matches.

Run it in a terminal, in the folder where it is or with its full path:

```sh
visual-anything [open] [folder] [--view <id> [--select <id>]...] [--port <n>] [--no-open] [--listen <address>] [--log <file>]
```

It opens the project in `folder` (home, the Projects screen, when left out; `.` is the current folder), serves it on 127.0.0.1 and opens your browser, as `pnpm start` does; with `--no-open` it prints an address that works once instead. `--view` opens the app at a view, and `--select` selects an element, relation or free shape there (give it again for more), as a view address does. When it already runs on that folder, it shows the project there instead of starting another: in its open tab, which comes forward, or in a new tab when none is open. `visual-anything address [folder]` prints a new address that works once for the one running. Press Ctrl+C to stop it. `visual-anything mcp` is the MCP server Claude starts, and `visual-anything setup-claude` adds it to Claude Desktop (see below); to open a folder that is named `mcp`, write `./mcp`. The executable serves the app it was built with, so `--dev` works only from the repository. `--listen 0.0.0.0` is for a container alone, whose port is published on the host's 127.0.0.1 (see [Run it in Docker](../README.md#run-it-in-docker) and ADR 0094); requests must name 127.0.0.1 or localhost either way.

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

## Comparing versions for a pull request

```sh
visual-anything compare <folder> --base <ref> [--head <ref>] [--view <id>]... --out <folder> [--theme light|dark] [--image-url <prefix>]
```

It compares two versions of the project in `folder` by id (ADR 0070) and writes, in the out folder, `summary.md`, every change with what differs in Markdown, and for each view that changed `<view>.before.svg`, `<view>.after.svg` and `<view>.comparison.svg`, drawn as the app draws a comparison. The base is a branch, a tag, a commit or `HEAD` of the project's git repository; the head is another, or by default the files on disk. It reads the repository through your own git, read-only (ADR 0071), needs no Visual Anything running, and writes only in the out folder, each file atomically; the out folder may not be the project folder, one of its kind folders or inside `.git`. `--view` keeps the drawings and the summary to some views, and `--image-url` links the drawings from the summary at the address they are uploaded to, for a pull request's comment. It says on standard error what a drawing could not hold.

From the repository, run `pnpm exec tsx packages/server/src/cli.ts compare …`. To run it from the sources on a project in another repository, set `TSX_TSCONFIG_PATH=<checkout>/packages/server/tsconfig.json` first, for the reason given under Claude through MCP below.

## Live values

```sh
my-metrics-script | visual-anything live <folder> [--fresh-for <seconds>]
```

A running system's numbers, such as a service's latency now, can show over the attributes they name while the project is open (ADR 0057): in the detail of shapes, in filters and in the inspector, each with a live mark (● on the canvas) and its age, fading (○, with how old it is) once older than its freshness, one minute by default. They are never saved and never enter the history; the inspector's Keep as attribute turns one into an ordinary, undoable edit. `visual-anything live` reads them from standard input, one JSON object a line, `{"target": "api", "attribute": "latency", "value": 120}`, with `"measuredAt"` when known, and sends them to the Visual Anything running on the folder. Claude sends them with `set_live_values`, and package code granted an origin makes them of what the local program fetched for it from that origin (ADR 0063).

## Writing a package that extends Visual Anything

A package (ADR 0012, ADR 0051) holds components and relation types, and may hold code: one JavaScript module, in its `.vapackage` file's `code`, one item a line. Besides computing attributes, checking elements, drawing inside shapes and simulating (ADR 0054, ADR 0085), its code can add four things a person uses (ADR 0089): **actions**, **importers**, **exporters** and **panels**. `examples/word-count` is a small project whose package adds one of each; open it with `pnpm exec tsx packages/server/src/cli.ts examples/word-count`, or add its `packages/word-count.vapackage` to any project from "Packages…" in the header.

**Declare what it adds.** The app lists what a package adds from its file, before its code runs, so each one is declared in `extensions`:

```json
"capabilities": ["model:read"],
"extensions": {
  "actions": [{ "id": "count-words", "label": "Count the words", "description": "…",
                "where": ["selection", "packages-menu"], "components": ["word-count.note"] }],
  "importers": [{ "id": "paragraphs", "label": "Notes, one a paragraph", "extensions": [".txt"] }],
  "exporters": [{ "id": "markdown", "label": "Notes as Markdown", "extension": ".md" }],
  "panels": [{ "id": "words", "label": "Words", "components": ["word-count.note"] }]
}
```

Ids are lower case letters, digits and `-`, unique within their kind; labels are 1 to 60 characters, in the package's own words. A package declares at most 32 actions and 8 of each other kind. An action is offered in the shape menu's "From packages" (`selection`), as a "Run" button in its package's entry of "Packages…" (`packages-menu`), or both; with `components`, only for a selection whose elements are of those components or of components derived from them. A panel with `components` shows only for their elements.

**Write one hook for each kind.** Each is an exported function called `hook(input, context)`, with `input` frozen; `context.model` is there only with the `model:read` capability, and reads the project without changing it: `element(id)`, `relation(id)`, `elements(component?)` (ids, World first, created from that component or one derived from it) and `relationsOn(id)` (the ids of the relations that end on it). Each answers plain data, and never writes anything itself.

| Hook | Called with | Answers |
| --- | --- | --- |
| `act` | `{ action, selection, view? }`: the action's id, the selected elements then relations, the open view | `{ label?, commands }`: commands, as Claude's tools send them, which the person reviews on the canvas and the Changes tab and accepts as one action of theirs, or declines |
| `importFile` | `{ importer, name, text }`: the importer's id and the file's name and text | `{ label?, commands }`, reviewed the same way |
| `exportFile` | `{ exporter, view? }` | the file's text, which the browser saves with the declared extension |
| `panel` | `{ panel, element }`: the panel's id and the one selected element | a list of blocks the inspector draws with its own controls: `{ kind: "heading", text }`, `{ kind: "text", text }`, `{ kind: "value", label, value }`, `{ kind: "table", columns, rows }`, `{ kind: "chart", chart: "bar" or "line", labels, series: [{ name, values }] }` and `{ kind: "button", label, action }`, which runs one of the package's actions on the element |

An action that answers no commands says so in a notice. A failure, a stop or an answer the app drops is said once, naming the package, and is not retried.

**Limits.** Each call runs in QuickJS, in the app's code worker, with no access to files, the page or the network, within 32 MiB: `act`, `importFile` and `exportFile` for up to 2 s, `panel` for 50 ms, as it is called as the selection changes. Changes hold at most 500 commands within 1 MiB as JSON, and never comments, conflicts or package code; an importer reads and an exporter writes at most 4 Mi characters; a panel holds at most 64 blocks, tables up to 12 columns and 200 rows, charts up to 6 series of 200 values. The code itself is at most 256 KiB. Code stopped for its time or memory three calls in a row is turned off, and the app says so.

**Approval.** The code runs only once the person reads it and approves it, in "Packages…" or the inspector, with each capability granted on its own. The approval is kept in their preferences by the hash of the code, its capabilities and its `extensions`, so changing any of them, or updating the package from a file or another project, asks again. "Run its code on this computer" turns a package's code off without removing it. The code of a built-in package, such as Data modeling's SQL DDL exporter and "Find tables no relation reaches", ships with the program and runs as its own, without an approval; "Packages…" says so, shows it, and turns it off the same way.

**Testing it locally.** Edit the `.vapackage` file in a project folder while `pnpm dev` serves it: the app reads the change, asks for approval again, and runs the new code. To test its hooks without the app, run them as `packages/server/src/word-count-sample.test.ts` does, through the same QuickJS sandbox and the core's checks: `pnpm exec vitest run packages/server/src/word-count-sample.test.ts`.

## Merging project files with git

Git merges JSON line by line: two branches that each add elements to one model file meet in a conflict, and the markers git writes break the file. The merge driver merges the project files by id instead (ADR 0072). Changes to different elements, or to different values of one, join; what both sides changed differently stays in the file as conflicts, kept as data, and the file still opens. Install it once in each repository, in a terminal at its top:

```sh
visual-anything merge-driver --install [--global] [--no-attributes]
```

From a checkout of Visual Anything, run `<checkout>/node_modules/.bin/tsx <checkout>/packages/server/src/cli.ts merge-driver --install` in the repository to install it in, or `pnpm exec tsx packages/server/src/cli.ts merge-driver --install` for the checkout itself. It defines the driver in the repository's git configuration (`merge.visual-anything.name` and `merge.visual-anything.driver`), or in your own with `--global` for every repository, and adds the seven lines that name it to the repository's `.gitattributes` where they are missing, unless `--no-attributes`:

```gitattributes
*.vaproject merge=visual-anything
*.vamodel merge=visual-anything
*.vapackage merge=visual-anything
*.vaview merge=visual-anything
*.vascenario merge=visual-anything
*.vatour merge=visual-anything
*.vacomment merge=visual-anything
```

Commit `.gitattributes`, so that everyone who installs the driver merges the same way. Those lines alone do nothing: git runs a merge driver only when your own configuration defines it, so a repository you clone can never make git run anything through them. Nothing in Visual Anything installs the driver but this command.

The driver's command names this very program by its absolute path: the executable, or Node with the loaders it was started with and the program's entry. Install it again after you move or update the executable, or after the checkout's dependencies change. Git then runs it on its own as `merge-driver %O %A %B %P %X %Y` for each project file both branches changed; it reads only the three versions git gives it, writes only the merged file, and runs no program. When conflicts remain, git stops the merge with that file unmerged: open the project, resolve the conflicts in the Changes tab, then `git add` the file. A version that does not read, such as one that is not valid JSON, is not merged: ours stays as it was, and `git checkout --theirs -- <path>` takes theirs instead. `visual-anything merge-driver --uninstall [--global]` takes the definition out again and leaves `.gitattributes` as it is.

## Claude through MCP

Claude works on the project Visual Anything has open through an MCP server that Claude Code or Claude Desktop starts. It attaches to the Visual Anything running on the project, and starts one in the background when none runs, which stops by itself once nothing has been connected to it for a minute. Every change Claude makes is one action in your undo history, labelled Claude, and you undo it in the app like your own. Claude's guidance (highlights, focus, moves of the canvas and captions) shows while the app is open; ask Claude to open it.

Below, replace `<project>` with the absolute path of a project folder. Leave it out to attach to whichever single Visual Anything is running. On Windows, write paths with forward slashes, as in `C:/Users/you/visual-anything.exe`, or with doubled backslashes in JSON.

### With the executable

**In one step.** Run `visual-anything setup-claude`, or choose **Connect Claude…** in the app's menu at the top right and confirm. It adds `mcpServers["visual-anything"]` to Claude Desktop's `claude_desktop_config.json` (in `%APPDATA%\Claude` on Windows, `~/Library/Application Support/Claude` on macOS, `~/.config/Claude` on Linux), naming the executable by its absolute path with `mcp`, so that Claude attaches to whichever single Visual Anything is running. It creates the file when there is none, first copies it to `claude_desktop_config.json.bak`, changes nothing else in it, refuses a file that is not valid JSON, and run again changes nothing. It never starts or restarts Claude: restart Claude Desktop yourself afterwards. It also prints the `claude mcp add` command for Claude Code, which it does not run. Run from the repository, it writes nothing and shows the entry below to add by hand instead.

Or set it up by hand. The server is the executable itself, with `mcp` as its first argument. Replace `<executable>` with its absolute path, such as `/Users/you/bin/visual-anything-macos-arm64` or `C:/Users/you/bin/visual-anything-windows-x64.exe`. Run it once from a terminal first, so that macOS or Windows has let it through (see above): Claude starts it in the background, where no warning can show.

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
claude mcp add visual-anything -e TSX_TSCONFIG_PATH=<repo>/packages/server/tsconfig.json -- node <repo>/node_modules/tsx/dist/cli.mjs <repo>/packages/server/src/mcp-cli.ts <project>
```

`TSX_TSCONFIG_PATH` keeps the TypeScript loader on the program's own configuration: otherwise it reads the `tsconfig.json` of the folder Claude runs in, whose `paths` could send the program's own imports to a file of that folder (ADR 0072's clarification of 2026-10-29). The executable has no loader, and needs none of this.

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
      ],
      "env": { "TSX_TSCONFIG_PATH": "<repo>/packages/server/tsconfig.json" }
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
- **With Claude**, ask it to import a file: it shows you the mapping with `preview_import`, then imports with `import_file`. Claude passes what it read itself: Visual Anything never reads a path Claude names, since text that steers Claude could then have it read any file the program can. For a large file, Claude may ask you to run `visual-anything import <folder> <file>` instead.

**HTML as a drawing.** A static HTML file or fragment, such as a card, a legend or a short table, comes in as a picture of the page instead, shown by the selected element or a new one (ADR 0068). Visual Anything lays the page out itself, from an allow-list of elements and styles, with its text in Roboto: nothing in it runs, nothing it names is fetched, and the import lists what it dropped. In the app, Import… shows the drawing before anything changes; from the command line, `visual-anything import <folder> card.html [--width <px>] [--element <id>]`; with Claude, `import_drawing`. A drawing holds about fifty words: shorten the page, or make it narrower, when it is refused as too large.

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
| SQL DDL | `build_from_sql_ddl` | One database holding its schemas; each table and view draws its columns as rows, each foreign key becomes a "references" relation, and enums, functions, triggers and sequences say what reads from, writes to, fires on and runs what, never their code. |
| OpenAPI | `build_from_openapi` | The API becomes a service that draws its operations as rows, and its schemas tables when you want them. |
| Terraform | `build_from_terraform` | What runs and stores data, placed in its network, and which resource calls which. |
| Kubernetes manifests | `build_from_kubernetes` | Workloads inside their namespaces, and which workload calls which. |
| docker-compose | `build_from_docker_compose` | The services inside their system; `depends_on` becomes "communicates with". |
| A repository | `build_from_repository` | The parts that run, the code they share, and what they call. |
| Logs and OpenTelemetry traces | `build_from_logs_and_traces` | One scenario per request, with the services and calls the model lacks added first. |

Every recipe holds Claude to the same rules:

- **Claude reads the material itself.** Visual Anything fetches nothing: no web address, no cloud and no tracing service. When the material points somewhere it does not hold, Claude asks you for it.
- **Nothing is made up.** Claude maps only what the material says, reuses what the project already has, and ends with a list of everything that matched nothing, asking what each should become.
- **One action per call.** An import is one action in your history, labelled Claude, that you undo in the app. A large one, past 500 elements and relations, such as a database of 70 tables, comes in batches of at most 500, each one action you undo on its own, which name one another by ids Claude chooses from the material's names, such as `t.billing.invoices` for a table. An import only adds: before any delete, Claude shows you what it would take with it (`preview_delete`) and waits for your yes.
- **Secrets stay out.** Passwords, tokens and keys, such as the password in a connection string, and personal data in logs are never copied into the project.
- **Layout places the shapes,** except where the material has positions of its own, as draw.io does.

The tools' descriptions sum the recipes up too, so asking in your own words works: "Model what docker-compose.yml runs", "Turn the Mermaid diagrams in docs/ into views", or "Make a scenario of this trace". Each recipe ends with a worked example, which the tests run through the real MCP server.

### Moving a database model onto Data modeling's components

Data modeling holds a whole database: Schema, Table, Column, View, Materialized view, Enum, Function, Trigger and Sequence, with "reads from", "writes to", "fires on" and "runs" (ADR 0023). Built-in packages are closed, so a project adds what one lacks by deriving in a package of its own. A model made that way before these existed, with a package of its own for schemas, tables, views, functions and triggers and relation types for what reads, writes, fires on and runs, keeps opening as it is. To move it, ask Claude to change each element's component with `update_element` (`{ "id": "…", "component": "data-modeling.view" }`, and likewise `data-modeling.schema`, `data-modeling.function` and `data-modeling.trigger`; a table whose component derives from Table can stay as it is, or become `data-modeling.table`), copying the attributes it needs into the built-in ones, such as `language` and `timing`, in lower case, with `removeAttributes` for the old names, and each relation's type with `update_relation` (into `data-modeling.reads-from`, `data-modeling.writes-to`, `data-modeling.fires-on` and `data-modeling.runs`). Schemas stay inside their database, and what they hold inside them, through `systems.is-part-of`, as before. Once nothing is made from one of the project's own components or relation types, nothing derives from it and no view nests by it, `remove_definition` takes it away.

## Contributor notes

The commands are in [CLAUDE.md](../CLAUDE.md). Two of them make and check the executable for the system you are on: `pnpm package` builds the app and writes `dist-exe/visual-anything` (`.exe` on Windows), and `pnpm smoke` starts it on a copy of `examples/my-systems` with no Node.js on its search path, checks that it answers on 127.0.0.1 and that `visual-anything mcp` lists its tools and reads the project, and stops it. `pnpm smoke --browser` also checks that it opens the browser: on macOS and Linux through a stand-in for `open` or `xdg-open` that records the address, on Windows by opening yours.

CI runs on each system only where it is worth it, since a minute on Windows counts twice and one on macOS ten times:

| Trigger | What runs | About |
| --- | --- | --- |
| Pull request to `master`, or `workflow_dispatch` | `CI`: the full matrix, Windows, macOS and Linux (D1). | 90 minutes |
| Pushed tag `v*`, or `workflow_dispatch` | `Executables`: build and smoke-test the five executables, then attach them with `SHA256SUMS` to the tag's release (D2). | 140 minutes |

Every workflow cancels a run still going on the same branch or tag when a newer one starts, caches pnpm's store, lets each job of a matrix finish when another fails, and stops a job that runs past its time limit. The executables are kept as artifacts for 7 days, as the plan stores 500 MB of them. The test run ends by listing every test it skipped on that system, and why.
