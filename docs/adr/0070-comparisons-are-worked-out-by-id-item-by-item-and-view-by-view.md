---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Comparisons are worked out by id, item by item and view by view

People who keep a project in git want to see what changed between two commits, in the app and in a pull request. Today they read JSON diffs. Benchmark R47 found no reviewed tool that does this well:
- INNOQ built a pixel diff for draw.io;
- Structurizr and IcePanel keep versions without a compare.

Visual Anything's ids are made once and never reused (ADR-0019), so a comparison can be exact. M11b plans it. This ADR settles:
- what is compared;
- how identity is kept across versions;
- what counts as added, removed, changed and moved;
- where a comparison is worked out, how it shows, and how big it may get.

ADR 0071 settles how versions are read from git. ADR 0072 and ADR 0073 reuse comparisons for conflicts and for proposals.

## Versions

- **A version** is the project as one of these holds it:
  - a commit of the project's repository (ADR 0071);
  - the local program when it opened the project, or last read it again from disk: the version **as opened**, which needs no git;
  - the program now, which is the files on disk, since every action is saved (ADR-0028).
- **A comparison takes an older and a newer version.**
  - In the app, the newer one is always the project now, so the comparison follows every action, whoever makes it.
  - On the command line, both can be commits, or the newer one can be the files on disk.
- **The same comparison serves two other uses:**
  - a proposal compares the project now with the project as it would be with the proposal accepted (ADR 0073);
  - a conflict compares what a merged file keeps with the other side's value (ADR 0072).

## What is compared: items

A project is a set of items, each named by its kind and its id. They are what operations change: the items of their lists, and what `set-world`, `set-project`, `set-view` and `set-package` set (ADR-0017). So comparisons, merges and the history all name the same things.

- **The project itself:** its name, its description, the packages it uses and its project appearances.
- **World, each element and each relation.**
- **The model's order of elements,** which is the order of rows: one item.
- **Each of the project's own packages:**
  - the package itself: its name, description, version, license, attribution, crosswalks, code and capabilities;
  - each component, relation type and image.

  Built-in packages are the program's (ADR-0018). A version names them by id and gets them from this program, so they count only through the project's list of packages. Their definitions are never changes.
- **Each view:**
  - the view itself: its name, description, perspective, nesting relation types, scope and overlays, the containers it collapses, and the relation types it leaves out;
  - each position, which is an element in a container;
  - each free shape;
  - each stacking list;
  - each route.
- **Each scenario, tour and thread,** each one item. What changed inside one is named by its steps' or comments' ids.

## Identity is the id

- **Two items are the same when their kind and id are the same** in both versions. Nothing is matched by name, by place or by likeness.
  - An id found in both versions is the same thing, renamed or not, since ids are never reused.
  - A thing deleted and made again has a new id. It is one change removed and one added.
- **File paths play no part.** A view whose file was renamed, or a package moved to another file name, is the same view or package, unchanged.
- **Values compare as JSON values.** Key order and how a number is spelled do not matter. A color compares without case, since files may write its digits either way (ADR-0033).

## What counts as what

A comparison is a list of **changes**. Each change is one thing added, removed, changed or moved, as a person reads it.

- **Added:** its id is in the newer version only.
- **Removed:** its id is in the older version only.
- **Changed:** it is in both versions, and something it holds differs, its place aside. For example:
  - a name, a description, a component or a relation type;
  - an attribute, by name; an appearance trait; an external id, by scheme;
  - a relation's end;
  - a definition's trait;
  - something of the view itself, such as its scope;
  - a step of a scenario or a tour, by id;
  - a thread's comments, or whether it is resolved.

  Each changed thing lists its differences. A difference has its path, such as `name`, `attributes.latency`, `appearance.fill` or `steps.<id>`, and its value before and after.
- **Moved:** a shape whose place in a view differs. Either it sits at least one canvas unit away in x or y, or it sits in another container of that view. A free shape moves the same way.
  - Places and sizes compare in whole canvas units, so that a layout's fractions do not show as moves.
  - A resize, a route set by hand, or a pin is a change of that view's shape, not a move.
- **What a change takes with it.**
  - An element added or removed takes its places, its stacking entries, and the nesting relations that place it, from it to its containers. This holds in every view.
  - A relation added or removed takes its routes.
  - Every other item is a change of its own. A move of a shape whose element is in both versions is one, and so are a restacking and a rerouting.
- **Unchanged** is everything else. A comparison lists only its changes.

## View by view

For one view, every element, relation and free shape it draws in either version has one state in that view:
- **added here:** it shows now and did not before, because it is new or because the view's scope took it in;
- **removed here:** it showed before and does not now, either deleted or left out by the scope. The list says which;
- **changed** or **moved**, as above. Changed comes first when both hold;
- **unchanged.**

A collapsed container that hides changes is marked with how many it holds, as an aggregated relation says how many relations it stands for. So a comparison reads at every abstraction level. The view's own changes, such as its scope, its nesting relation types or its overlays, show in the list and in the drawing's heading, since they are not shapes.

## Where it is worked out

- **In the core, as pure functions** with no I/O:
  - `compareProjects(older, newer)` makes the comparison;
  - `compareView` gives one view's states;
  - `recompare(comparison, older, newer, operations)` updates it after an action, touching only the items that the action's operations name. A property test checks that this equals comparing afresh.
- **The same functions serve every reader:** the app, the command line, Claude's tools, proposals and conflicts.
- **Nothing of a comparison is stored.** Like scenario playback (ADR-0031), it is worked out from the versions and kept by the tab that shows it. Comparing writes no file and records nothing in the history.
- **Who works it out first.** The local program reads the older version (ADR 0071) and works out the comparison. It sends both to the app, which follows each later action with `recompare`, so that a large comparison is never worked out on the app's main thread.

## How it shows

### On the canvas

- **Compare with…** takes the version as opened, the last commit, or a branch, tag or recent commit that the program lists (ADR 0071). The canvas then draws the open view in one of three ways:
  - **Before:** the older version's view, with what was removed, changed and moved marked;
  - **After:** the newer version's view, which in the app is the view now, with what was added, changed and moved marked;
  - **Comparison:** the newer version's view, with what was removed drawn faintly at its older place, and each moved shape's older place drawn as a dashed outline joined to the shape by a thin arrow.
- **The marks.**
  - **Colors.** Each state has a color from the theme's tokens, Okabe–Ito hues chosen for each theme with 3:1 contrast against the canvas.
  - **Not color alone.** Each state also has a glyph in a badge (`+` added, `−` removed, `~` changed, `→` moved) and a line pattern (removed dashed, changed double). No state is told apart by color alone.
  - **Unchanged shapes** are drawn faintly, unless the person turns that off.
- **A legend** names the four marks with their counts, drawn on the canvas and in every export, as an overlay's legend is (ADR-0055).
- **Read-only while it shows.** The canvas selects, pans, zooms and explores, but does not edit. Escape ends the comparison, as Escape ends a tour.
- **Keys.** `]` and `[` go to the next and the previous change. Each selects the change's shape and brings it into view with a short eased move, or a cut under reduced motion. Screen readers hear what it is and what differs.

### In a list

The **Changes** tab of the model panel lists the changes:
- their counts by state;
- the changes grouped by kind, each saying what it is and what differs.

It can be filtered by state and to the open view. Choosing a change shows it on the canvas in the first view that draws it, as search does. The list is virtualized, works from the keyboard, and follows the canvas's selection.

### In exports

- **SVG and PDF** of each of the three drawings, with the legend, written from the same scene as the canvas (ADR-0014's clarification).
- **A summary in Markdown.** It names the two versions by commit, branch and date, gives the counts, then each change with what differs, grouped by view and by kind, with links to the drawings when they are written.
  - Every text taken from the project is escaped so that it reads as text. A name can make no link, image, heading or HTML in a pull request.

The Export dialog offers these while a comparison shows. `visual-anything compare` writes them for pull requests (spec, M11b). The read-only page shows no comparison for now.

## How big it may get

- **Inputs.** Versions are read within the caps of opening, plus the limits of ADR 0071.
- **The core's work.** A comparison holds every change. Working it out is linear in the items of the two versions, by maps from keys.
- **Time.**
  - At most 100 ms for two versions of 10,000 elements with their views.
  - At most 1.5 s at the reading benchmark's 100,000 elements and 200,000 relations, in the program.
  - Following one action with `recompare` at 10,000 elements: at most 5 ms.
- **What reads it is capped, not the comparison.**
  - The canvas marks every shape within the frame budget at 10,000 elements.
  - The list is virtualized.
  - The Markdown summary lists at most 1,000 changes, then says how many more there are.
  - Claude's `compare_versions` answers at most 200 changes per call, with an offset.

## Considered options

- **Pixel diffs of two images:** rejected (benchmark section 6). They miss renames, flag antialiasing, and cannot say what an attribute was.
- **Line diffs of the JSON files:** rejected. Lines carry no meaning: a move shows as numbers, and a relation as two ids.
- **Matching things by name or by place when ids differ:** rejected. It guesses. Ids are never reused, so the id alone is exact.
- **Two canvases side by side:** left for later. Two canvases double the drawing budget. Before, after and the comparison in one canvas show the same thing within one budget.
- **Working the comparison out only in the app:** rejected. At 100,000 elements it would block the main thread. The program works out the first comparison, and the app follows actions incrementally.
- **Storing comparisons, or versions, in the project:** rejected. Both are derived from git and the files, as playback is.

## Consequences

- The core gains `versions/`: items and their keys, `compareProjects`, `compareView`, `recompare` and `operationsBetween`, the last of which also serves ADR 0072 and ADR 0073. Property tests cover them.
- The app gains Compare with…, the three drawings with their marks and legend, the Changes tab, and the comparison's exports.
- The theme gains four tokens per theme for the marks, with contrast tests.
- CONTEXT.md gains **Version**, **Comparison** and **Change**.
