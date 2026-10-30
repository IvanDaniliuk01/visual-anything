# Sixth benchmark: faces at 10,000 shapes (M3e F5)

Date: 2026-10-30. Measured on the F5 branch of M3e, after F0 to F3 were merged, in Node 22.16 on the reference laptop from `benchmark-3.md`. It records, once, what faces cost the scene at 10,000 shapes, and how layout and routing fare on the fixture shaped like the user's PostgreSQL model when its tables and columns have faces. By the user's decision of 2026-10-27, benchmark marks do not hold a milestone back; nothing here was optimized.

## How it was measured

- **The faces.** The benchmark's `?faces` phase (`packages/app/src/bench/faces.ts`) gives every component the view draws a face through project appearances:
  - a table: a header with its name in bold and its component's name under it, then `<rows/>`;
  - a column: its name in monospace, its type in italics and its badges, on one line;
  - every other component: its name over its component's name, in its shape.
- **The script.** `pnpm exec tsx packages/app/src/bench/faces-timing.ts 10000 <tables|boxes> 3`. In one Node thread, it measures, with faces and on a fresh copy of the project without them:
  - the scene built from nothing (`buildSceneAfresh`), three times;
  - the scene built again from the one before after one move of a shape in World (`buildScene`), ten times;
  - every face drawn once (`shapeFaceDrawing`), after the first build and again after the moves, as tiles drawing the whole view would ask, counting how many drawings were laid out and how many the face layout cache already held (`faceCounts`).
- **The projects.**
  - `tables`: `syntheticTables(10000)`, 10,301 shapes, 401 of them tables.
  - `boxes`: `syntheticProject({ elements: 10000 })`, 10,000 shapes, 400 of them systems that hold the rest.
- **The frames** are not measured here. The phase is written (`?tables&faces` with `pnpm bench`: the scene's numbers again, then a pan where names show, a zoom across the label threshold and a pan where details show, with the cache's hit rate over them), but this session opened no browser. They are measured with the next browser run of the benchmark.

## The scene

Times in milliseconds. The first of the three first builds also warms the JIT, so the last two say more.

| Step | `tables` without faces | `tables` with faces | `boxes` without faces | `boxes` with faces |
| --- | --- | --- | --- | --- |
| First build, from nothing (3 runs) | 454 / 333 / 279 | 534 / 321 / 290 | 633 / 386 / 286 | 838 / 380 / 381 |
| Faces laid out during it | – | 401 of 401 asked | – | 400 of 400 asked |
| Built again after one move (median / worst of 10) | 14.8 / 53.0 | 12.7 / 31.1 | 15.3 / 47.3 | 19.1 / 26.9 |
| Faces laid out during the 10 moves | – | 0 of 10 asked | – | 1 of 10 asked |
| Every face drawn once after the first build | – | 10,301 laid out in 780 ms, hit rate 0.0% | – | 10,000 laid out in 442 ms, hit rate 0.0% |
| Every face drawn again after the moves | – | 7.2 ms, hit rate 100.0% | – | 10.3 ms, 1 laid out, hit rate 100.0% |

On a first run of the same script, before the timing of the drawing pass was added, the `tables` view built in 519 / 351 / 273 ms without faces and 817 / 516 / 495 ms with them, and again after a move in 17.3 and 15.8 ms at the median: the laptop's runs vary by as much as faces add.

## The fixture with faces

`packages/app/src/canvas/layout/quality.faces.test.ts`, on the fixture of `quality.fixture.test.ts` with faces like Data modeling's (`withDataModelFaces` in `packages/app/src/test/dataModel.ts`): its tables and database views draw a header with their name and their schema, a `schema` attribute the fixture gains, over their rows; its columns their name, type and PK and FK badges. The views are laid out in one pass and routed as the canvas routes them after Layout, with and without faces, by the same code on the same day.

| View | Crossings | Per line | Shared segments | Bends per line | Fill | Row ends at their middle | Overlaps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| schema-view | 24 → 24 | 0.67 → 0.67 | 0 → 0 | 1.67 → 1.67 | 0.24 → 0.24 | 72 of 72 | 0 |
| overview expanded | 1,821 → 1,725 | 11.17 → 10.58 | 16 → 30 | 4.01 → 3.71 | 0.15 → 0.15 | 326 of 326 | 0 |
| overview expanded, unpinned | 1,681 → 1,599 | 10.31 → 9.81 | 0 → 1 | 3.32 → 3.28 | 0.15 → 0.15 | 326 of 326 | 0 |
| processing with its tables open | 38 → 38 | 1.36 → 1.36 | 0 → 0 | 1.57 → 1.71 | 0.13 → 0.13 | 50 of 50 | 0 |

- 238, 1,180, 1,180 and 209 shapes have a face in the four views, and every face fits its shape: none is cut, drawn as its name, or draws a box or a run past the rectangle the canvas lays it out in.
- Lines through shapes stay at the router's give-ups (1 on the overview with its pinned schemas, 0 elsewhere), and lines over the shapes that cover their ends at 15 there and 0 elsewhere, as without faces.

## What it says

- **Faces cost the scene little.** The first build lays out only the faces that size their shapes before layout, the 401 table headers and 400 container headers, and stays within the laptop's own variation of about 30%. Building the scene after a move lays out no face at all, or the one it moved.
- **The first drawing of each face is where the work is:** about 0.04 to 0.08 ms a face, 442 to 780 ms for the whole view at once, which the canvas spreads over the tiles near the screen. Every drawing after it is the cache's.
- **A table's header is laid out twice.** The scene lays a table's face out at its width alone to find its header, and the tile at its width and the header's height, which the cache keeps apart: the first drawing of a table's face is never a hit. Reusing the scene's drawing when its height is the header's would save one layout a table; it is a follow-up, if the first frames over many tables are slow.
- **Layout and routing keep their quality with faces.** Overlaps, row ends and lines through shapes hold; crossings fall by 5% on the overview; shared segments rise from 16 to 30 on the overview with its pinned schemas and from 0 to 1 unpinned, since the taller headers move every row down and ELK lays the overview out otherwise. ADR 0080 wants none shared; the unpinned overview misses it by one, which `quality.faces.test.ts` holds as reached.
