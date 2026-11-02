---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# A merge driver merges project files by id, and keeps conflicts as data in a file that still validates

Git is the spec's answer to collaboration ("Collaboration: Git on the project files"). Git merges JSON line by line:
- two people who add elements to one model file in two branches get a conflict where the lists meet;
- the markers git writes then break the JSON, and the project no longer opens.

Benchmark R49 asks for a merge driver that merges by id and leaves conflicts as data. This ADR settles:
- what the driver merges, and how;
- what a conflict looks like in a project file that must still validate;
- how the person resolves one;
- how the driver is installed, and its limits.

## What it merges

- **The seven kinds of project file:** `.vaproject`, `.vamodel`, `.vapackage`, `.vaview`, `.vascenario`, `.vatour` and `.vacomment`.
- **How git runs it.** When both branches changed one such file, git runs `visual-anything merge-driver %O %A %B %P`:
  - `%O` is the common ancestor, `%A` ours and `%B` theirs, three temporary files git wrote;
  - `%P` is the file's path in the repository.

  Where the person's git passes the two sides' names, `--install` adds them too, so that the app can say "main" and "feature/billing" rather than ours and theirs.
- **What the driver does.** It reads the three versions, merges them by id in the core (`mergeFile`), and writes the result over `%A` in the stable key order (ADR-0019), atomically. It exits:
  - **0** when nothing conflicts;
  - **1** when the file holds conflicts. Git then marks the file unmerged until the person resolves them and adds it.
- **Rebases and cherry-picks** use the same driver. Ours and theirs are as git defines them: in a rebase, ours is the branch being rebased onto.

## Merging by id

The items are those of ADR 0070. Within an item, each value it holds merges on its own, by its key.

- **A value changed on one side only** takes that side's value.
- **A value changed on both sides alike** takes it. Changed to two different values, it is a conflict.
- **Maps merge by key:**
  - attributes by name;
  - an appearance by trait;
  - external ids by scheme;
  - project appearances by definition.
- **Sets merge as sets, then sort as the file keeps them:**
  - a scope's `added` and `leftOut`;
  - the containers a view collapses;
  - the relation types it leaves out;
  - its nesting relation types;
  - the packages a project uses.
- **Lists of things with ids merge by id, keeping order:**
  - elements, relations, components, relation types and images;
  - positions, free shapes, routes and overlays;
  - scenario steps, tour steps, and a thread's comments.

  The merged list takes ours' order. What theirs added goes after the item it follows in theirs. When both sides reorder the same list differently, its order is a conflict.
- **Stacking lists,** which are lists of bare ids, merge as ordered lists in the same way.
- **What a removed item takes.** An item removed on one side takes with it what the core would remove with it in the same file.
  - Deleting an element on one side deletes from the merged model the relations that end on it, and the relations that end on those, as the `delete` command does.
  - Its positions in view files are another file's. They stay there as positions of something gone, which opening already passes over with a warning.

## A merged file keeps its rules

After merging, the core checks the rules that one file can tell:
- ids once each;
- relations whose ends are in the model;
- containment without a cycle;
- a list's own limits.

A change that would break one of these becomes a conflict instead of applying, by one rule: **keep what loses least**.

- **A deletion that meets something the other side added or changed that needs it** is not applied. The thing stays, and the deletion is the conflict's other choice. An example: a relation added on one side ends on an element deleted on the other.
- **An item removed on one side and changed on the other** keeps the changed item. The removal is the other choice.
- **Two additions that together close a containment cycle:** ours is kept, and theirs is the other choice.
- **A value both sides changed, or an id both sides added with different values:** ours is kept, and theirs is the other choice.

Rules that span files are checked when the project opens, as after any merge, since git runs the driver for one file at a time. Such rules include an element's component in a package file, a view's positions of elements of the model, and a scenario's view.
- What names something gone is already kept and flagged: positions, broken steps, tour steps and detached threads.
- An element whose component the other branch removed keeps the project from opening, as today. The problem names both files.

## A conflict as data

Each of the seven kinds gains an optional `conflicts` list. The file format stays version 1. A program from before M11b refuses a file that has one, which is right: it would drop the conflicts. A conflict holds:

- **`id`:** unique within the file.
- **`item`:** the item, by a key local to its file:
  - in the model file: `world`, `element:<id>`, `relation:<id>` or `order`;
  - in a package file: `package`, `component:<id>`, `relation-type:<id>` or `image:<id>`;
  - in a view file: `view`, `position:<element>` or `position:<element> in <container>` (as positions are keyed), `free-shape:<id>`, `stacking:<container>` or `route:<relation>`;
  - in a scenario, tour or thread file: `scenario`, `tour` or `thread`, and `step:<id>`, `tour-step:<id>` or `comment:<id>`;
  - in the project file: `project`.

  Ids cannot hold `:` or spaces, so a key reads one way only.
- **`path`:** where the value lies inside the item, as a list of keys, such as `["attributes", "latency"]`. It is empty for the whole item.
- **`why`:** one of `both-changed`, `removed-and-changed`, `both-added`, `needs-removed`, `cycle` or `order`.
- **`kept`:** whose value the file holds in place, `ours` or `theirs`.
- **`other`:** the other side's value, left out when that side removed the item.
- **`base`:** the common ancestor's value, left out when it had none.
- **`sides`:** the names git gave the two sides, when it gave them.

The file in place is a valid file of its kind. `other` and `base` are JSON as that kind of file holds that item. They are data, and they are checked only when chosen, as reading the file would check them. Images are cleaned, for one (ADR-0027). The project opens, and `checkProject` warns `merge-conflict` for each file that holds conflicts. A merged file that already held conflicts keeps them, merged by id like any list.

## Resolving

- **In the app.** The Changes tab lists the conflicts of every file whenever the project holds any. Each is drawn as a comparison between what the file keeps and the other choice (ADR 0070).
  - The person keeps what the file holds, or takes the other choice, one conflict at a time or a whole file at once.
  - Each is the command `resolve-conflicts`, the person's action, undone like any other.
  - Taking the other choice sets that value, checked as above, or removes the item as the `delete` command would. A choice that would break a rule is refused, naming what needs what, so that the person resolves those first.
  - With a file's last conflict, its `conflicts` list goes. The app then says the file can be added with `git add <path>`. The program never runs a git command that writes.
- **By Claude,** when the person asks: `list_conflicts` and `resolve_conflicts`, each change one action of Claude's.
- **By hand.** Deleting a conflict's entry keeps what the file holds. `git checkout --ours` or `--theirs` takes one side's file whole.

## Inputs that do not read

- **An input that is not a valid file of its kind:** an ancestor or a side that is not JSON, is of a newer format, or is past its cap. The driver does not merge:
  - it leaves ours in `%A` as it is;
  - it writes on standard error why, and how to take theirs (`git checkout --theirs -- <path>`);
  - it exits 1.
- **It never writes conflict markers.**
- **A file both sides added,** for which git passes an empty ancestor, merges with an empty ancestor: everything in it was added on both sides.

## Installing

Git requires two parts, and a repository can give only the first.

- **`.gitattributes` names the driver** for the seven extensions, as in `*.vamodel merge=visual-anything`. A repository that names it does nothing on its own: git runs a merge driver only when the person's own configuration defines it. That is why a cloned repository can never make git run anything through this line.
- **The person's git configuration defines it,** only when they run `visual-anything merge-driver --install`:
  - It writes `merge.visual-anything.name` and `merge.visual-anything.driver` with `git config`, with arguments, into the repository's own configuration, or the person's global one with `--global`.
  - It adds the seven lines to the `.gitattributes` at the repository's top level where they are missing, and says so. `--no-attributes` leaves that file alone.
  - `--uninstall` takes the configuration out again.
- **The driver's command names this very program by its absolute path:**
  - the single executable;
  - or Node with the same loaders and the absolute path of its entry, as Claude's entry point starts the program (ADR-0029).

  It is quoted for the shell git runs drivers through. It is never a bare name looked up on PATH, and never `npx` or `pnpm exec`, which could find a package of the repository's own.
- **Neither the app nor the program installs it** on its own. This repository's `.gitattributes` gains the seven lines. The README says how to install the driver.

## Never running code from the repository

- **What it reads and writes.** It reads the three files git gave it, as regular files within their kind's cap (ADR-0030). It writes only `%A`.
- **What it uses `%P` for:** only its extension, to know the kind, and its text in messages, with control characters escaped. It never opens `%P`.
- **What it loads:** nothing from the repository. No package code (ADR-0054), which is data to it like any other text. No configuration of the project, no `node_modules`, no hook.
- **What it starts and reaches:** it runs no git and no other program, needs no running local program, and opens no network.

## Limits

- **Each input within its kind's cap.**
- **A merged file past its cap** is not written: ours is kept, and the driver exits 1, saying so.
- **Time.** The merge is linear in the file's items. A 10,000-element model file merges in at most 500 ms.

## Considered options

- **Git's own text merge, with markers:** rejected. Markers break the JSON, and the project does not open until someone edits it by hand.
- **Conflicts in a side file,** such as a `conflicts/` folder of `.vaconflict` files: rejected. A second file has to be kept in step with the one it is about, and `git add .` commits it apart from it. Git already flags the file that holds the conflicts.
- **Conflicts kept in `.git/`:** rejected. It writes into the repository's own folder, which nothing else of Visual Anything does, and the app could not open them as part of the project.
- **Taking ours, or theirs, for every conflict without saying:** rejected. It loses work silently.
- **A generic JSON merge driver:** rejected. It knows neither which lists are keyed by id nor the rules that keep a model valid.
- **Merging the whole project at once:** not possible. Git calls a merge driver for one file at a time.
- **Installing the driver when a project opens:** rejected. It would change the person's git configuration without being asked. It would also teach people that opening a repository may write their configuration.

## Consequences

- The schema gains `conflicts` in the seven file kinds, with the JSON Schema regenerated.
- The core gains:
  - `mergeFile`, and the item merge it shares with proposals (ADR 0073);
  - the operation `set-conflicts`, through which a file's `conflicts` list alone changes, as routes change only through their own list;
  - the command `resolve-conflicts`;
  - the warning `merge-conflict`.
- The command line gains `merge-driver`.
- The app gains the conflicts in the Changes tab.
- Claude gets `list_conflicts` and `resolve_conflicts`.
- ADR-0019 gains a clarification for `conflicts`. ADR-0041's page leaves them out.
- CLAUDE.md's file rule should say that a project file may hold `conflicts` from a merge, as data. Its security rules should say that the merge driver is installed only by the person and runs nothing from the repository. The main session makes these edits with the user's agreement.
- CONTEXT.md gains **Merge driver** and **Conflict**.

## Clarifications

<!-- Decided by Claude on 2026-10-28 under the user's standing delegation of design decisions. -->
- 2026-10-28 (M11b's second seam): how the core merges and resolves, as built.
  - **What `mergeFile` is told.** Besides the three versions it takes `sides`, the names git gave them; `kept`, whose value stays in place, ours unless said, which a proposal sets; and `nesting`, the relation types that nest. A model file alone does not say which relation types nest, and the driver reads no other file, so it passes those of the built-in packages. A cycle through a relation type of the project's own packages spans two files, and opening finds it as it finds any.
  - **What a removal takes, and what it keeps.** A relation that one side left as it was goes with an end the other side removed, as `delete` takes it. A relation one side added or changed keeps its end: the end comes back, from the ancestor or the side that holds it, as a `needs-removed` conflict whose other choice is the removal. What comes back for what needs it is needed in turn, so its own ends come back too, each thing once at most. World is always there to end on. A restored element goes back after what precedes it where ours, theirs or the ancestor had it; the rest keep their merged order.
  - **Lists inside an item.** Lists of things with ids merge by id, at any depth: a conflict inside one carries the thing's id in its path, as `["overlays", "<id>", "name"]`. A view's relation types left out merge by relation type, and a conflict inside them carries the relation type in its path. The sets the file keeps sorted come out sorted: the containers a view collapses, a scope's `added` and `leftOut`, and the relation types it leaves out. The packages a project uses and a view's nesting relation types keep ours' order, with what theirs added after.
  - **Order conflicts hold keys.** A conflict of a list's order keeps the other side's keys in their order, and the ancestor's: ids, position keys or bare ids, never the things again, so that a 10,000-element model does not hold its elements twice. The model's relations have no order of their own, since no command reorders them: their merged order is ours', with theirs' additions after, and never a conflict.
  - **Conflicts a file held before** merge by id like any list, first; the new ones follow, numbered `conflict-<n>` from the lowest number free.
  - **Resolving.** `resolve-conflicts` names its file as `{ kind: 'project' }`, `{ kind: 'model' }`, or the kind and id of a package, view, scenario, tour or thread file. Taking the other choice sets the value at its path, finding things of a list by their key; puts a list in the other side's order; or removes the item as `delete` removes it, with what ends on it, which the app previews first as it previews a deletion. It is checked as reading the file would check it: the core refuses a choice that adds an error `checkProject` finds, an image that does not clean among them, and the refusal is that error; the program refuses to save a file its schema rejects, as it refuses any. The label names the file as it was before the choice: "Resolve a conflict in the model", "Resolve 2 conflicts in the view "Overview"".
  - **The warning.** `merge-conflict` is one warning for each file that holds conflicts, with their number and the file's id as its subject: "A merge left 2 conflicts in the model: resolve them in the Changes tab, then add the file with git add."
  - **Time.** A 10,000-element model with 10,000 relations, 200 changes on each side and 50 removals, merges in 140 to 260 ms on the development machine, within the 500 ms above.
- 2026-10-29 (M11b's task "The merge driver"): the driver and its installing, as built in `server/src/merge-driver.ts`.
  - **The placeholders are `%O %A %B %P %X %Y`.** Git's `%X` and `%Y` are the labels of ours and theirs, such as `HEAD` and `feature/billing`; `%S` is the ancestor's, which a conflict does not keep. Git 2.44 and later fill them in. An older git passes `%X` and `%Y` as they are, and the driver takes them as no names. A name keeps no control character and at most 200 characters; an empty one is left out.
  - **The inputs.** Git writes the three in the folder it runs the driver in, by names relative to it. The driver reads each as a regular file inside that folder, within its kind's cap, as UTF-8, and parses it with the schema's validator, so a project file of a newer format says so. It reads the ancestor first, then ours, then theirs, and says the first that does not read. An empty ancestor is a file both sides added.
  - **The path** gives the kind by its extension and nothing else. A path of no project kind, which only a `.gitattributes` that names the driver for another file gives, is not merged: ours stays, and the driver exits 1. What the driver says shows the path with control characters and the characters that turn the direction of text escaped, as `\u{1b}`.
  - **Writing.** The merged file is checked against its schema and its kind's cap before it is written. It is written over ours as the writer writes a project file: a temporary file in the same folder, renamed over ours, only as a regular file there, never through a link. Nothing else stays behind.
  - **Exit codes.** 0 when the merged file holds no conflicts; 1 when it holds any, those both sides held before included, or when nothing was merged; 2 for a command line it does not understand, which leaves ours as it is too. It says nothing on success, and on standard error how many conflicts remain, or why it did not merge with how to take theirs.
  - **Nesting** is that of the built-in packages, as the second seam settled; nothing else is read.
  - **The command names the program,** quoted for git's shell, each word in single quotes:
    - From the executable, the executable alone.
    - From the sources, Node with only the options that load code, `--require`, `--import`, `--loader` and `--experimental-loader`, then the absolute path of `cli.ts`. Other options, such as `--inspect`, are dropped. A loader named other than by its absolute path is refused, since Node would look it up from the repository.
    - From the sources, the command also sets `TSX_TSCONFIG_PATH` to the program's own `packages/server/tsconfig.json`. The TypeScript loader otherwise reads the `tsconfig.json` of the current folder, which is the repository's, and its `paths` can send the program's own imports, such as `@visual-anything/core`, to a file of the repository. Tried on 2026-10-29: without it, a repository's `tsconfig.json` did.
    - On Windows its paths are written with forward slashes, which git's shell and Node both read. A path with a `%`, which git would read as a placeholder, or with a control character, is refused, saying to move Visual Anything.
  - **Installing** writes the two keys with `git config --local`, or `--global`, through the narrow calls of ADR 0071's clarification of this date. Without `--global` it needs a repository. With `--global` it still adds the lines to the `.gitattributes` of the repository it runs in, if any; outside one, it says the seven lines. The lines count as there when a line has the pattern, such as `*.vamodel`, and `merge=visual-anything` among its attributes. Those missing go at the end, after a comment, in the line endings the file uses. The file is read as a regular file within 1 MiB and written atomically.
  - **Uninstalling** unsets the two keys, which may leave the empty section `[merge "visual-anything"]`, and leaves `.gitattributes` as it is: its lines do nothing without the definition.
  - **Time.** A 10,000-element model file, with 200 changes on each side and 50 additions, takes about 1.1 s in the driver on the development laptop under load: about 350 ms to compile the schema's validator, 220 ms to parse the three versions, 440 ms for the core's merge, 40 ms to check the result and 150 ms to write it in the stable key order. The core's merge alone is the 500 ms mark's, as before. Started from the sources, the driver takes about 3.5 s more to load for each file; the executable loads faster.
- 2026-10-29 (M11b's third seam): **a merge where the kept side wins**, for proposals (ADR 0073). `mergeFile` and `mergeItem` take `keptWins`: the kept side's removal then stays over the other side's change, and takes the other side's relations that end on what it removed, as `delete` takes them; a cycle that no addition of the other side closed keeps the kept side's relations. Git's merges never set it.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions. -->
- 2026-10-30 (M11b's task "Conflicts in the app, and for Claude", Claude's half, built in `server/src/claude/conflict-tools.ts`):
  - **Files, as Claude names them:** `project`, `model`, or `package`, `view`, `scenario`, `tour` and `thread` with an id. A thread's file is the core's `comment` kind of file; Claude says thread, as CONTEXT.md does.
  - **`list_conflicts`** reads the project as Claude reads it, and answers each file that holds conflicts, with its kind, id and name, then each conflict: its id, item, path, why, kept and sides; what the file keeps there now (`keeps`), found by the item's key in its file and read along the path, things of a list by their id; the other choice, or that taking it removes the item; and the ancestor's value. An order's `keeps` is the list's keys, as `other` holds them. A value whose JSON passes 1,000 characters comes cut. It answers 200 conflicts at most from an offset, of one kind of file or one file if asked.
  - **`resolve_conflicts`** takes one file and either `resolutions`, each a conflict and `kept` or `other`, or `all`, the same choice for each of the file's conflicts. A file that holds none is refused before anything is sent. It runs the core's `resolve-conflicts` as one action of Claude's, undone by the person like any other, and answers how many it resolved and how many are left; once none is, that the person can add the file with `git add`. While the person reviews Claude's changes, or a proposal of Claude's waits, it is refused, as ADR 0073's clarification of 2026-10-29 settles.
  - **The app's half,** the conflicts in the Changes tab, is still to build.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions. -->
- 2026-10-30 (M11b's task "Conflicts in the app, and for Claude", the app's half, built in `app/src/versions/conflicts/`):
  - **Where they show.** The Changes tab is there whenever a file of the project holds conflicts, and comes forward when they appear, on opening or after an undo; it does not open a collapsed model panel for them. The conflicts come first in the tab, under "Conflicts from a merge", with the list of a comparison or a proposal below when one is open.
  - **Each file** is headed by what it holds, as "The model" or "View “Overview”", with its count, Keep all and Take the other for all. **Each conflict** says what it is about, as the element's name then its path ("WhatsApp channel › name"), why the merge could not join it, what the file keeps and the other choice, each with the side it came from by git's name, or our side and their side, as JSON cut past 300 characters; an other choice that removes the item says so.
  - **Drawn as a comparison.** Show works out with the core's `resolve-conflicts` the project with the conflict kept and the project with its other choice taken, both on the project now, and draws them through the comparison mode with `follows: false`, titled "<what it is about>: what is kept, and the other choice"; a conflict in a view's file opens that view first. The Changes tab then lists what taking the other choice changes, below the conflicts. An other choice the core refuses is said instead, with the core's reason.
  - **Resolving** sends `resolve-conflicts` as the person's action: one conflict, kept or with its other choice, or every conflict of a file at once. Taking the other choice where it removes an element or a relation of the model opens the deletion's preview first, the canvas's own dialog, with the relations that go with it; nothing is sent until the person confirms. A refusal shows under the conflict, or the file, in the program's words. A conflict drawn by Show stops showing once a resolution is sent.
  - **The note.** When a resolution takes a file's last conflict, the tab says "<file> holds no conflict now: its file can be added with git add.", with Dismiss; the note goes once dismissed, or when the file holds conflicts again. The app is not told where each file lies in the folder, so the note names the file by what it holds rather than by its path; the program never runs git.

<!-- Decided by Claude on 2026-11-02 under the user's standing delegation of design decisions. -->
- 2026-11-02 (bugs the merge's properties found at 600 runs): what a merge leaves out, and which cycles are its to break.
  - **A list or an object each side emptied of what the other kept is left out,** as the files leave out a list or an object with nothing in it, whose schema asks for one item or key at least. One side opening one collapsed container and the other side the other, for one, leaves the view without `collapsed`, where the merge wrote `collapsed: []`, which no view file holds. The same goes for a scope each side emptied, a view's relation types left out, its overlays, a scenario's decisions and a package's images and solids. Two lists the files keep when empty stay, empty: the packages a project uses and a view's nesting relation types. A list that one side itself emptied is that side's, and merges as before.
  - **Only the cycles the merge closed are its to break.** A nesting relation that lies on a cycle one side already holds, as that side holds it, is passed over where the merge looks for cycles. A side never holds a cycle of the relation types that nest in its own packages, so such a cycle means that side's packages made one of its relation types not nest, which the model file does not say and the nesting the merge is told does not know. The merge took it out before, from a side the other had left unchanged, or kept the side's relations and lost the other's. Opening checks it with the merged packages, as it checks a cycle through the project's own relation types. A cycle the merge closes through such a relation is left to opening too; a cycle of its own beside one is broken as before.
  - **The properties** reach a `cycle` conflict through edits that add nesting relations between the model's elements and nothing else, besides the actions at large, which reach one too seldom to count on.
