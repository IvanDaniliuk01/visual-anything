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
