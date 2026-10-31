# Eighth benchmark: comparisons, proposals, merges and versions from git (M11b)

Date: 2026-10-30. Measured on a branch from 0b33c60, after M11b was merged, in Node 22.16 with git 2.49 on the reference laptop from `benchmark-3.md` (an i5-1135G7). It records, once, what M11b's work costs at 10,000 elements and at the reading benchmark's size, against the marks of ADR 0070, ADR 0072 and ADR 0073. By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized.

## How it was measured

- **The versions.** `packages/app/src/bench/versions.ts` makes them from the benchmark's own project (`syntheticProject`):
  - **The older version** is the benchmark's project: 10,000 elements and 19,199 relations, its nesting ones included, in one view.
  - **The newer version** has 100 changes spread evenly over the view, made by one batch command: 25 elements renamed, 25 shapes moved inside their systems, 25 elements added in World with a relation each, and 25 elements removed with the relations that end on them. The comparison holds 172 changes: 50 added, 72 removed, 25 changed and 25 moved, since added and removed relations count on their own.
  - **The reading benchmark's size** (M8) is the same project at 100,000 elements and 200,640 relations (`READING_SIZE`), with the same 100 changes: its comparison holds 169.
  - **The person's action** is a rename (`update-element`) or a move (`set-positions` of one shape), of a different element each run, away from the changes.
  - **Claude's proposal** is one batch of 20 commands on the newer version: descriptions written, 4 elements added and 4 removed, 28 changes in all.
  - **Each side of a merge** edits 200 elements of the model file, ours their descriptions and theirs their names, never the same one, and adds 50 elements: no conflicts.
- **The scripts:**
  - `pnpm exec tsx packages/app/src/bench/versions-timing.ts 10000 10` times the core's comparison and recompare, the comparison's scene, the marks' layer, a proposal's rebase and the core's merge, three times;
  - `pnpm exec tsx packages/app/src/bench/versions-timing.ts reading 5` times comparing and following at the reading benchmark's size, once;
  - `pnpm exec tsx packages/server/scripts/versions-timing.ts 10000 10` times reading the older version from git and the merge driver, twice. It makes a temporary repository with two commits, the older version then the newer, with a fixed author and no configuration of the person's, and removes it at the end.
- **Each step** runs once to warm the code, then the given number of times; the tables give the median and the worst of those runs.
- **The scene as the canvas builds it.** The canvas gives the comparison the scene it already has of the project now (`useComparisonCanvas`), so the newer version's scene is built first and given, untimed, and the older one's is built from it, as `buildScene` builds a scene from the last.
- **The marks** are drawn into PixiJS's `Graphics` in Node, which records them and draws nothing: the times are the layer's own work, `markItems` and `drawMarkItem`, two chunks of 400 a frame.
- **The machine was not quiet:** the main session was building M9 beside these runs, and Windows reported the processor 68% busy before they started. The medians say more than the worst runs, which hold collections of garbage and the other work. Earlier figures on a quieter machine were about half these (ADR 0070's clarification: comparing in about 110 ms, following in about 24 ms).

## The numbers

Times in milliseconds, median / worst.

### Comparing and following, at 10,000 elements

| Step | Run 1 | Run 2 | Run 3 | Mark |
| --- | --- | --- | --- | --- |
| `compareProjects`, the two versions | 213 / 302 | 236 / 353 | 195 / 223 | 100 (ADR 0070) |
| `compareView`, the one view | 49 / 68 | 56 / 95 | 45 / 70 | |
| A rename, `executeCommand` | 41 / 89 | 48 / 71 | 27 / 68 | |
| `recompare` after the rename | 91 / 105 | 92 / 135 | 44 / 64 | 5 (ADR 0070) |
| A move, `executeCommand` | 12 / 19 | 7 / 11 | 7 / 11 | |
| `recompare` after the move | 126 / 180 | 93 / 144 | 93 / 117 | 5 |
| `compareProjects` afresh after an action, for reference: the medians after the rename and the move | 275, 251 | 258, 267 | 221, 259 | |

### Comparing and following, at the reading benchmark's size

| Step | 100,000 elements, 200,640 relations | Mark |
| --- | --- | --- |
| `compareProjects` | 1,566 / 1,817 | 1,500 in the program (ADR 0070) |
| `compareView`, the one view | 1,189 / 1,395 | |
| A rename, `executeCommand` | 933 / 1,254 | |
| `recompare` after the rename | 708 / 1,140 | |
| A move, `executeCommand` | 175 / 255 | |
| `recompare` after the move | 1,083 / 1,282 | |
| `compareProjects` afresh after a rename, a move, for reference | 5,690 / 7,604; 2,185 / 2,281 | |

Making the newer version took 8.6 s, which the program never does; the 100,000-element project took most of the script's memory, and the slowest afresh comparisons are its collections of garbage.

### Drawing the comparison, at 10,000 elements

| Step | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| `buildSceneAfresh` of the newer version, for reference | 346 / 582 | 317 / 502 | 288 / 531 |
| `comparisonScene`, before | 354 / 406 | 232 / 275 | 191 / 324 |
| `comparisonScene`, after | 61 / 68 | 47 / 75 | 50 / 71 |
| `comparisonScene`, the comparison | 351 / 566 | 287 / 549 | 271 / 353 |
| Following in full after a rename: `recompare`, `compareView` and the comparison's scene | 441 / 671 | 404 / 483 | 382 / 464 |
| The marks of the 100 changes, 197 marks: the first frame (`set` and two chunks) | 11.6 / 14.3 | 8.1 / 12.1 | 11.9 / 15.6 |
| The marks of every element renamed, 10,000 marks: the first frame | 14.5 / 22.1 | 11.9 / 15.8 | 14.5 / 22.2 |
| The same, each of the 12 frames after it (800 marks each) | 10.9 / 26.5 | 7.4 / 140.9 | 9.3 / 23.4 |

The comparison drawing of the 100 changes holds 10,025 shapes: 100 marked, 72 lines marked and 25 moves, 197 marks.

### An action while a proposal is open, at 10,000 elements

| Step | Run 1 | Run 2 | Run 3 | Mark |
| --- | --- | --- | --- | --- |
| A rename, `executeCommand` | 38 / 53 | 46 / 54 | 43 / 53 | |
| Its rebase, `rebaseProposal` | 163 / 204 | 147 / 221 | 181 / 224 | 20 (ADR 0073) |
| The proposal shown again: `proposalChanges` and `operationsBetween` | 518 / 727 | 456 / 566 | 556 / 616 | |
| A move, `executeCommand` | 7.7 / 9.7 | 4.4 / 9.9 | 6.3 / 12.7 | |
| Its rebase, `rebaseProposal` | 93 / 123 | 87 / 111 | 104 / 176 | 20 |
| The proposal shown again | 563 / 651 | 573 / 1,380 | 553 / 1,102 | |

### Merging a 10,000-element model file

| Step | Run 1 | Run 2 | Run 3 | Mark |
| --- | --- | --- | --- | --- |
| The core's `mergeFile`, 200 changes and 50 additions a side | 178 / 485 | 202 / 278 | 201 / 359 | 500 (ADR 0072) |
| The merge driver, `runMergeDriver`, from the three files to the one it writes | 598 / 687 | 381 / 623 | not run | |

The merged file holds 10,100 elements and 19,199 relations, with no conflicts, and the driver exits 0.

### Reading the benchmark project's version from git, at 10,000 elements

Its project files weigh about 5 MiB.

| Step | Run 1 | Run 2 |
| --- | --- | --- |
| `Versions.list` from nothing: finding git, its version, the repository and the listing | 618 / 786 | 590 / 792 |
| `Versions.read` of the older commit, after a listing | 537 / 650 | 508 / 621 |
| Its parts: `openRepository` (`rev-parse`) | 66 / 76 | 70 / 86 |
| `listVersions` | 445 / 492 | 437 / 544 |
| `readCommit`: `ls-tree` and `cat-file --batch`, within the caps | 216 / 248 | 228 / 402 |
| `loadProjectFrom`: the loader's checks from bytes | 213 / 259 | 262 / 356 |
| `compareProjects` of the version read with the project now | 216 / 281 | 163 / 248 |

## What it says

- **Comparing afresh takes about 200 ms at 10,000 elements,** twice ADR 0070's 100 ms on this loaded machine, and about 1.6 s at the reading benchmark's size, against 1.5 s. Both run in the program, never on the app's main thread.
- **Following an action misses its 5 ms by far:** 44 to 126 ms at 10,000 elements and 0.7 to 1.1 s at 100,000. `recompare` reads every item of both versions again on each action, as the spec's follow-up of 2026-10-28 already says; that follow-up is what would meet the mark. On the canvas, following a rename in full, with the view's states and the comparison's scene, takes about 400 ms, most of it building the older version's scene again from the newer one's. One view's states (`compareView`) take about 50 ms at 10,000 elements and 1.2 s at 100,000.
- **The marks keep a frame within the budget at the median:** 8 to 12 ms for the first frame of the 197 marks, and 7 to 11 ms for each frame of 800 marks when every shape is marked. The worst frames reach 23 to 141 ms, collections of garbage and the busy machine among them. What PixiJS spends drawing them on the GPU is not in these numbers.
- **The rebase misses its 20 ms:** about 150 to 180 ms after a rename and 90 to 100 ms after a move. The rebase merges each file the action reached whole: a rename reaches the model file, which is merged as a whole 10,000-element model, as `mergeFile` takes about 200 ms for; a move reaches the view, with its 10,000 positions. Merging only the items the action's operations name, as ADR 0073 says the program does, is what would meet the mark. It is not a trivial change, so it is left as a follow-up. Showing the proposal again after the action, which the session does too, takes another 450 to 570 ms: `proposalChanges` compares the project twice.
- **Merging a 10,000-element model file meets its 500 ms in the core,** at about 180 to 200 ms. The whole driver takes 380 to 600 ms here: validating, parsing and writing the three files come on top, which ADR 0072's clarification measured at about 1.1 s under heavier load.
- **Reading a version of 10,000 elements from git takes about half a second,** a listing about as long, both in the program and while the dialog says it reads. Git's own work (`ls-tree` and `cat-file`) is about two fifths of the read, the loader's checks another two fifths, and opening the repository the rest; comparing the version with the project now takes about 200 ms more.

## What only a browser can measure

- The frames of the comparison drawn on the canvas: PixiJS drawing the marks' chunks, the faint unchanged shapes in the tiles, and the camera moving with `]` and `[`. Here the marks are recorded, not drawn.
- How the app's main thread holds up while a comparison follows each action, between the canvas's own frames.

They wait for the next browser run (`pnpm bench`), which this session could not make, since it opened no browser.
