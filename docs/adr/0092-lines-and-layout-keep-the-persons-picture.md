---
status: accepted
---

<!-- Asked by the user on 2026-11-03, after comparing with draw.io's latest connector work: "siento que la experiencia nuestra no está tan bien afinada aún, tenemos muchos problemas con el tema de las flechas, la reorganización automática", Decided by Claude under the user's standing delegation of design decisions, from an inventory of the app's lines and layout and a reading of draw.io's `dev` branch (commit 3e707fd). -->

# Lines and layout keep the person's picture

Lines and Layout are where the app feels least finished. The inventory of 2026-11-03 found five causes:

1. **Lines change after Layout without anything moving.** After a Layout the canvas draws ELK's routes, kept only in memory. A move nearby, or reopening the view, routes them again with the program's router (ADR 0039, clarification W49), which draws them differently.
2. **Layout lays the view out afresh.** Adding one table and pressing Layout moved 24 of `schema-view`'s 38 shapes by about 900 units (ADR 0080's clarification of 2026-10-30). ADR 0080 left "a layout that remembers the previous one" to an ADR of its own.
3. **Pins are invisible.** A shape moved by hand is pinned (ADR 0009) and Layout leaves it, but nothing shows which shapes are pinned. "Unpin them" appears only for pinned shapes that overlap, and the Arrange tab's toggle pins a mixed selection on its first press.
4. **Routes by hand bend out of shape.** When one end moves, only the corner next to it slides (`core/src/commands/follow.ts`). The other bend points stay, so a route stretched far leaves stray steps.
5. **Crossings are neither avoided nor drawn.** The router charges no cost for crossing other lines, except for lines that end beside rows, and the canvas draws two crossing lines as if they met. The user's real model has views with 597 and 1,093 crossings.

Getting back to automatic routes is also hard. Reset route is only in the relation's menu and the inspector. Several lines can be chosen only by Shift-clicking each, and nothing resets every route of a view. draw.io answers this with Clear Waypoints (Alt+Shift+R), which acts on the selected lines and on every line of the selected shapes.

## Decision

### 1. Getting back to automatic routes, from the keys

- **Reset routes (Alt+Shift+R)** resets the hand routes of the selected relations and of every relation drawn as a line whose end is a selected shape or lies inside one. It forgets bend points and style, as `reset-route` does today. It is one action, labelled with the count, and it does nothing, saying so, when none of them is routed by hand. The relation's menu, the shape's menu and the format panel's Arrange tab offer it.
- **Attach ends automatically** is a separate action, as draw.io's Clear Anchors is. It forgets the ends' attachments and keeps the bend points.
- **Reset every route in this view** sits in the view's inspector under Lines. It shows the count of routes by hand and is offered only when there is one.
- **Selecting lines.**
  - **Ctrl+Shift+E** selects the lines of the selected shapes, or every line of the view when nothing is selected.
  - Box selection takes the lines that lie wholly inside the box together with the shapes, as draw.io does.
  - Ctrl+A keeps selecting shapes only, as today, so Delete after Ctrl+A shows the same preview as before.
- **Layout gets keys: Alt+Shift+L.** It lays out the selection when shapes are selected (section 3), and the view otherwise.
- Claude's `reset_route` takes `all: true` for a view's every route. Its `attach` option resets the ends only.

### 2. Pins can be seen and undone

- ADR 0009 stands: a shape moved by hand is pinned, and Layout keeps it.
- **A pinned shape shows a small pin** at its top right while it is selected or hovered. The canvas draws it in screen space, like handles, so exports never show it.
- **The view's inspector** says "N shapes pinned", with **Unpin all**, whenever any is pinned, not only when they overlap.
- **A mixed selection's Pinned toggle unpins first.** A press pins only when none of the selection is pinned.

### 3. Layout keeps the picture unless asked to start over

**Layout keeps the order of what the person sees.** In each container, before ELK runs, the shapes are given to it in the order of their places in the flow's direction, then across it, and the ELK options that follow the model's order are turned on (`elk.layered.considerModelOrder.strategy`), so that ELK keeps that order when it costs no more crossings. Then the result is shifted so that the shapes it keeps move least: the median displacement of the shapes not pinned, per container. A shape with no place yet is placed as today (ADR 0065).

- **The mark.** After one table joins `schema-view`, Layout moves its shapes by at most half of today's 906 on average, and keeps the order of the shapes in each layer. Layout twice moves nothing, as today.
- **If ELK's model order costs crossings beyond today's thresholds** in `quality.fixture.test.ts`, the builder records that and, for this order, uses only the shift that moves least, which costs no crossings.

**Layout from scratch** is ADR 0080's run, ignoring the places the view has. It is in the Layout button's menu and is labelled as such.

**Layout of the selection.** With shapes selected, Layout arranges only them, the rest of the view held as if pinned, inside the container that holds them all. With only a container selected, it arranges that container's contents, as today.

**Options are kept per view.** The direction is right, down, left or up, right by default. The spacing is compact, normal or roomy, normal by default. They live in the view file's new `layout` object, `{ direction?, spacing? }`, absent while both are defaults. They are set in the Layout button's menu and the view's inspector, and read by every Layout and by the placement of new shapes. Claude's `lay_out_view` takes them.

### 4. One router draws every automatic line

**After a Layout, the program's router routes every automatic line, at once, in the worker.** ELK's routes are no longer drawn: `layout/keptRoutes.ts` goes. So a line looks the same after a Layout, after a move nearby and after reopening the view. The move animates with stand-in routes, as a move does today, and the routes arrive at its end.

**The router counts crossings.**
- A* charges a cost for each crossing with a line already routed in the same request.
- Lines are routed longest first.
- The channel pass keeps its order.

This is what ELK's routes gave that the router did not. The mark is the fixture's crossings after Layout: no worse than ELK's routes gave on any view, `schema-view` 24. Today's every-line-routed figure is 38. Within the router's budget, a line that cannot find a route under the cost keeps the cheapest it found.

### 5. Routes by hand stretch with their ends

When both ends move together, every bend point moves with them, as today. When the ends move apart, the bend points between them stretch with the box their ends span. Along each axis:

```
new = from′ + (old − from) × (to′ − from′) / (to − from)
```

Coordinates that were equal stay equal, so an orthogonal route stays orthogonal. When the span along an axis is under 8 units, that axis moves by the end that moved, as today. The runs into the ends then keep their stubs, as `follow.ts` does now. This is draw.io's `followTerminals`, made the only behavior. Property tests hold that an orthogonal route stays orthogonal, that moving and moving back gives the route back within rounding, and that no bend point leaves the box its ends and old points span.

### 6. Crossings are drawn as jumps

**A view can draw a jump where two lines cross.**
- The setting is the view's `lineJumps`: `arc` (a small half-circle), `gap` (a break in the line), or absent for none. It is set under Lines in the view's inspector.
- New projects' views and the samples use `arc`. Existing views keep drawing none until the person chooses, so no file changes.
- The line that jumps is the one later in the view's order of lines. The jump's size is 6 units, scaled down on a run shorter than three jumps.
- Lines that share an end, and a line crossing its own trunk, do not jump.

**Where jumps are drawn.**
- Jumps are found where routes are composed, in the worker with the routes, and drawn by the canvas, the read-only page, the SVG and the PDF.
- Far out, below `ROWS_FROM`, no jump is drawn.
- The canvas keeps its frame budget at 10,000 elements (recorded, not held).

## Considered options

- **Storing ELK's routes in the view file**, so that they survive a reopen: rejected. A route stored is a route by hand (ADR 0039), and storing layout's routes as automatic ones would add a second kind of stored route to every file and every merge. One router is simpler, and section 4's crossing cost brings back what ELK's routes gave.
- **No pinning on drag, layout keeping places instead**: rejected for now. Layout from scratch still needs a way to keep what the person placed, and ADR 0009's pins are that way. Making them visible and easy to undo answers what went wrong.
- **ELK's interactive layering or `elk.position` hints**: ADR 0080's clarification of 2026-10-30 found them unread, refused or worse in crossings. Model order is a different mechanism, which ELK applies after crossing minimization weighs it.
- **Porting draw.io's code.** It is Apache-2.0, so porting would need its notice kept beside the ported files. Nothing here needs it: the clear actions, `followTerminals` and line jumps are short and are written from their behavior, and draw.io's libavoid glue serves a router ADR 0080 removed. Should a later task port code, it keeps the Apache-2.0 header and the notice in `THIRD-PARTY-NOTICES.md`, and never uses the draw.io name or the LGPL libavoid or EPL ELK files it bundles.
- **Placeholders in labels (`%attr%`), hover arrows that clone and connect, and dropping a shape on a line to split it**: worth having, and left to a milestone after this one. They add ways of working, where this ADR fixes the ones there are.

## Consequences

- The view file gains two optional keys, `layout` and `lineJumps`. The format stays at version 1. Builds older than this refuse a view that sets them, and the live protocol's version goes up.
- `keptRoutes.ts` and the "ELK's routes until something moves" of ADR 0080, section 1, are superseded by section 4. ADR 0080's clarification "Layout … is a request to arrange afresh" is superseded by section 3 for the Layout button, and holds for Layout from scratch.
- ADR 0039's "the corner next to each end that moved moves along its axis" is superseded by section 5.
- The user decided on 2026-11-03 that v0.1 does not need it: milestone A7 is built after R1.
