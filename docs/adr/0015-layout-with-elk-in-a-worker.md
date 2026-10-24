---
status: accepted
---

# Layout with ELK (elkjs), run in a Web Worker

Automatic layout uses ELK through elkjs, run in a Web Worker so it never blocks the canvas. Each layout receives the view's shapes with their nesting, connection points and pinned positions; an element with several containers in the same view is passed as one copy per container. We chose ELK because it already solves what matters most for readability: layered layout of nested graphs, connection points, and orthogonal routing that keeps relations from tangling. Its license (EPL-2.0 or GPL-3.0-or-later, from version 0.12) is compatible with the AGPL planned for publication.

## Considered options

- **dagre** (@dagrejs/dagre, MIT): rejected. Layered layout only, with limited nesting support and no orthogonal routing.
- **Own implementation**: rejected. Months of work on a problem ELK already solves well.

## Consequences

ELK is a large dependency and layout results arrive asynchronously, so the canvas must show shapes in their previous positions until a new layout is ready.

## Clarifications

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

- 2026-10-24: what a layout moves, and how it is stored.
  - **Automatically**, the shapes a view shows without a position: all of them when the view opens, and each new one after that, such as the elements Claude adds. In each container, or World, where such a shape sits, every shape without a position is arranged; every shape with one stays. A shape whose position an undo took away is not new, so undo can go on past a layout.
  - **On demand**, from Layout in the canvas toolbar: every shape of the view that is not pinned, or, with one container selected, every shape inside it, at any depth, that is not pinned. The container stays where it is.
  - Pinned shapes never move (ADR-0009). The result is checked against the view as it is when it comes back, and stored as one undoable action: one `set-positions`, unpinned, keeping every stored size, named `Lay out "System overview"`, `Lay out the contents of "Scheduling"`, `Lay out "Billing" in "System overview"` or `Lay out 3 new shapes in "System overview"`. Positions it would leave as they are are not written, so laying out again changes nothing.
- 2026-10-24: how a layout arranges a view.
  - Each container, and World, arranges its own contents, innermost first, so that a container's size is known before it is arranged among its neighbours. Every copy of a container shares its contents' positions (ADR-0019), so they are arranged once, through its first copy.
  - The shapes layout may move at one level form one block. ELK's layered algorithm arranges it from left to right along the relations between them, each lifted to the level where its ends meet: a relation between the contents of two containers orders the two containers. Only the relations that close a cycle are reversed, found depth first in the model's order (`DFS_NODE_ORDER`), and the model's order breaks ties. A block of more than 12 shapes wraps its flow into rows toward 1.6 times wider than tall, so that a long chain of relations reads like lines of text instead of running far to the right; a shorter flow keeps to one row. A block with no relation inside it is packed in rows, about 1.6 times wider than tall, without ELK.
  - Fixed shapes are not part of ELK's graph, since ELK's layered algorithm cannot hold a shape at a given place. The block is placed clear of them, and in World clear of notes and arrows too: at the container's contents origin, or in World where its shapes start now, when nothing there stays; otherwise beside what stays when relations lead mostly from it into the block (to its right), or in World mostly out of the block (to its left), and below it otherwise.
  - Spacing: 40 between shapes in one layer and between rows, 80 between layers, 40 below and 80 beside what stays. Every position is rounded to a multiple of 8 relative to its container, and a container's contents never start above or left of its contents origin.
- 2026-10-24: connection points are ELK ports. A relation that ends on a shape with connection points ends on a port there, fixed on its side at its place along it; elsewhere it attaches anywhere on the border. Each end uses the point nearest the middle of the side layout's flow takes: the east side where a relation starts and the west side where it ends, the other way round for a relation that closes a cycle, so that ELK never has to turn a port around. Relations store nothing about it. A shape that draws its contents as rows (wave 2) is one block with a port for each related row.
- 2026-10-24: where layout runs. The app takes each layout's input from the scene it draws, so that layout works with the sizes and containment the canvas shows: one pass over the scene on the main thread, and a copy of the input to the layout worker. Everything else runs in the worker. ELK runs in workers of its own, started from the layout worker, because elkjs takes over the message handler of any worker it is loaded into: one for every two cores, up to three, among which the containers of one depth are shared out. ELK's own routes are not kept: positions are rounded and blocks placed after ELK runs, so the canvas routes relations itself.
- 2026-10-24: how long a layout may take, and how it is followed and stopped.
  - ELK's time grows with a level's shapes times its relations beyond one per shape (on the benchmark's laptop, 400 shapes took 2.4 s with 400 relations and 104 s with 800), and its stronger options for large graphs were slower, not faster. So each level gives ELK at most 4,000 of that product: beyond it, the pairs related by the most relations are kept, then the first in the model's order.
  - ELK runs at most 20 s in all for one layout. An ELK worker still running then is stopped, and started again for the next layout; the containers it had, and those not yet given to ELK, are packed in rows. So a layout ends within about 20 s, besides copying its input and result.
  - While a layout runs, automatic or asked for, Layout shows how far it has come (`Stop layout (40%)`), and pressing it stops the layout, which then moves nothing. Stopping a layout stops the layout worker, since ELK cannot be interrupted; the next layout starts a new one.
  - Measured on the shared, loaded laptop, with ELK in one thread: the synthetic view of 2,000 elements took 14.5 s (86 s before the work budget), and of 10,000 elements 29.5 s, 27.7 s of it for its 400 containers, which the app shares among its ELK workers.
- 2026-10-24: a layout's result moves in over 320 ms, its relations routed again on every frame, unless the system asks for reduced motion or the view holds more than 1,500 shapes, where it shows at once.
