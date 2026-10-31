# Ninth benchmark: solids at 10,000 elements, without a GPU (M9)

Date: 2026-10-31. Measured on the branch that builds M9's sample, its benchmark, the `turn` guidance and relations that follow a turning drawing, in Node 22.16 on the reference laptop from `benchmark-3.md`. It records, once, what the solids benchmark's project costs the page's thread where no GPU is needed (ADR 0075). By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized.

## How it was measured

- **The script.** `pnpm exec tsx packages/app/src/bench/solids-timing.ts 10000 3`, in one Node thread. It makes the benchmark's twenty canonical files (`bench/solidFiles.ts`) and its project (`bench/solidsProject.ts`): 10,000 elements of which 200 show solids, from 20 distinct solids, 4 of them at the caps, and 10 drawings with parts holding 1,000 anchored parts, with 100 relations ending on them. It times:
  - making the files, and making them again with their hashes, their descriptions read by the core and the project;
  - the scene's first build from nothing (`buildSceneAfresh`), three times, and the scene built again after each of ten moves of the middle drawing, from the scene before, as the app builds it;
  - pointing: 2,000 points at random over the middle drawing, the one at the cap of 4,096 named parts, through the canvas's own path: the hit, the drawing for an anchored part's dot, then the part buffer (`pointedPart`). The buffer is one of 400 × 400 pixels, as the picture is at 400 pixels across, with each part a square of a 64 × 64 grid and a gap of nothing between them; three runs;
  - the table of part states (`partStatesOf`) for that drawing's 4,096 parts and for one of 100, with 100 parts standing for elements, half of them faint, and the selected one moving, 200 times each;
  - the solid client's ordering of the 200 pictures the view shows, nearest the middle of the screen first, its files never arriving so that only the ordering is timed, 500 times.
- **The machine was not quiet:** another builder's tests ran beside the script. The medians say more than the worst runs, which hold the JIT's first passes and the other work.
- **What needs a GPU is not measured here:** the frames of pan, zoom and select, the cold run's pictures, a change of focus shown on parts, a filter's picture drawn again, turning, the cleared image store and the theme switch are the browser's (`pnpm bench`, `?solids`, in work and frames modes), and this session opened no browser. Their phases run in jsdom with the stand-in worker (`bench/solids.test.ts`), which shows that they run and report, not how fast.

## The numbers

Times in milliseconds: median, 95th percentile and worst.

| Step | Median | 95th percentile | Worst | Runs |
| --- | --- | --- | --- | --- |
| Making the twenty canonical files, 55.6 MiB | 454 | 485 | 485 | 3 |
| Making them again, hashed, described, with the project | 6,517 | 6,517 | 6,517 | 1 |
| The scene's first build, 200 solids and 1,000 anchored parts | 285 | 426 | 426 | 3 |
| The scene built again after moving the middle drawing | 19.1 | 44.0 | 44.0 | 10 |
| Pointing over 4,096 parts, run 1 | 0.011 | 0.045 | 0.78 | 2,000 |
| Pointing over 4,096 parts, run 2 | 0.008 | 0.017 | 1.61 | 2,000 |
| Pointing over 4,096 parts, run 3 | 0.006 | 0.013 | 0.30 | 2,000 |
| The state table of 4,096 parts | 0.28 | 1.28 | 3.46 | 200 |
| The state table of 100 parts | 0.008 | 0.012 | 0.046 | 200 |
| The client's ordering of 200 pictures | 0.14 | 0.26 | 1.68 | 500 |

Of the 2,000 points, 25 found an anchored part: 100 of the drawing's 4,096 parts stand for elements, as the spec's counts have it; the others found the drawing.

## What it says

- **Pointing at parts meets its mark** with room: about 0.01 to 0.05 ms at the 95th percentile against 1 ms, the hit in the scene's index costing more than the part buffer's look-up.
- **The state table** of the drawing at the cap on parts is rewritten in about 0.3 ms at the median and 1.3 ms at the 95th percentile, for any change of focus, selection, playback step or overlay, without a picture drawn again: within a frame, before its upload, which the browser run times.
- **The client's ordering** of 200 pictures costs about 0.1 to 0.3 ms a frame when the wish changes.
- **The scene's first build** with solids takes about 0.3 s at 10,000 elements, once, when the view opens; a move's build about 19 ms at the median and 44 ms at the 95th percentile, through the incremental scene, within the 50 ms M3 gives one edit at 10,000 elements from the operations to the frame drawn, but leaving little of it to the frame.
- **Making the files** is the benchmark's own setup, before anything is measured: half a second to write them, and about 6.5 s more to hash 55.6 MiB with the core's synchronous SHA-256 and describe them. The program hashes with Node's own (ADR 0075's clarification of the cleaner).
- **The browser run** is the next step: the 60 frames per second target for pan, zoom and select with 200 solids, every picture on screen within 2 s of the files arriving, the filter's picture within 150 ms, and turning at 60 and 30 frames per second.
