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
