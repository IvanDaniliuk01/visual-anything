# A9's benchmark: Math

Date: 2026-11-12. Measured in the main session at the end of A9 (ADR 0106). By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back: what was not measured is recorded here, and nothing was optimized.

## The machine

- The user's laptop, Windows 10 Pro, Node v22.16.0 (win32 x64), with the editor and other programs open; not quiet.

## What was measured

- **Typesetting 10,000 distinct formulas in Node,** as the command line's exports and Claude's tools typeset them: `pnpm exec tsx packages/app/src/bench/math-typeset.ts`, which typesets formulas none of which was typeset before, KaTeX's parse and the core's layout together, with no cache.

| Run | Total | Mean | p50 | p95 | Worst | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| First, as a program just started | 8.95 s | 0.895 ms | 0.74 ms | 1.79 ms | 78.7 ms | 0 |
| Second, once KaTeX and the layout have run | 8.82 s | 0.88 ms | 0.73 ms | 1.71 ms | 88.6 ms | 0 |

- A formula is typeset once and kept by `(tex, display)` (2,000 at most, least recently used dropped first), so the cost is paid once per distinct formula.

## What was not measured

- `bench.html?elements=10000&math`: pan, zoom and select with a formula in each of 10,000 details and 1,000 display blocks in notes, against the same project with plain text. The headless run stalled on the laptop and was not taken again.
- Typesetting in the browser, and the time and memory KaTeX's bitmap families take to install.
- To take them: `pnpm bench`, then `/bench.html?elements=10000&math` and `/bench.html?elements=10000`, with the window in front at 60 Hz and the machine otherwise idle.

## What to watch

- The canvas typesets a formula the first time a tile draws it, and a scene opening typesets only its first 200 ahead (`wantMathOfScene`). A scene of 10,000 distinct formulas, past the cache's 2,000, typesets again what scrolled out of the cache, at about 0.9 ms a formula. If `?math` shows frames lost to it, typeset a scene's formulas ahead in idle chunks and size the cache to the scene.
