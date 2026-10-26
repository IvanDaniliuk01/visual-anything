---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Live values come from outside, are kept only while the app is open, and are never saved

A model of a running system reads better with its numbers:
- a service's latency now;
- a queue's depth;
- a neuron population's firing rate.

Those numbers change every second, and saving them would fill the files and the undo history. Benchmark R41 asks for a channel of live values. This decision is modelled on ADR-0031's playback, which is derived and kept per tab.

## The channel

- **Who sends live values:**
  - Claude, through a tool, `set_live_values`, with values it read from its other MCP servers;
  - after M7, package code with an approved `network:<origin>` capability (ADR-0054);
  - the command line, `visual-anything live <folder> < file.jsonl`, so that a script can pipe values in.
- **What one is.** A target (element or relation), an attribute name, a value, and the time it was measured, if given.
- **Where they go.** The local program keeps the latest value of each target and attribute in memory, and sends them to every open app on the live connection. A new message kind is added, so protocol version 6.
- **Limits.**
  - At most 1,000 values per message, and 20 messages a second from one sender. Past that, the program drops the oldest, and says so once.
  - At most 100,000 live values in all.
  - A value is JSON of at most 1 KiB.

## How they show

- **Never saved, never in the history.** Live values are not commands, and the core never sees them as changes. Closing the project, or the program, forgets them.
- **They read like attributes.** Live values show in the detail, in overlays (ADR-0055) and in filters as the attribute they name, over its stored value. Each carries a mark and the time it arrived, so a live value is never mistaken for a stored one.
- **They age.** A value older than its sender's stated freshness (one minute by default) fades, and says how old it is.
- **Keep as attribute.** In the inspector, this turns the live value into an ordinary, undoable edit of the stored attribute.

## Considered options

- **Writing them as attributes:** rejected. Every second would be an action in the history and a change in git.
- **Package code fetching directly from the page:** rejected by ADR-0012 and ADR-0054. Network access goes through the local program, which checks the origin.

## Consequences

- The live protocol gains the live values message, so version 6, and the local program keeps the latest values.
- The app's attribute lookup takes live values over stored ones where they exist, with their mark.
- Claude gets `set_live_values` and `clear_live_values`.
- CONTEXT.md gains **Live value**.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- **2026-10-25, where package code's fetches may go (W37, after a security review).** Checking the origin is not enough: a granted name could resolve, or rebind between the check and the connection, to this computer, the person's network or a cloud's metadata address. So the local program, which fetches for package code (ADR 0063), follows these rules:
  - **A name is resolved by the program,** and every address it resolves to must be public. A name never leads to `0.0.0.0/8`, `127.0.0.0/8`, `::1` or `::`; to `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` or `fc00::/7`; to `169.254.0.0/16`, the metadata address `169.254.169.254` among them, or `fe80::/10`; nor to multicast, broadcast or reserved addresses. IPv6 forms that carry an IPv4 address (mapped, compatible, NAT64 and 6to4) are read as that IPv4 address.
  - **The connection is pinned** to the address checked: the request is sent with a lookup that answers only that address, on a connection of its own, so that the name cannot lead elsewhere between the check and the connection. It uses Node's own `http` and `https` with that lookup rather than an undici `Agent`, which would be a new dependency; TLS still checks the certificate against the name.
  - **An address written in the grant is reached as written,** when it is an address of this computer or of the person's network, such as `network:http://192.168.1.20:8080`, which the person granted on purpose. A name that resolves to such an address never is. Link-local, unspecified, multicast and broadcast addresses are never reached, even written in a grant.
  - **Only `https:`,** but for an address of this computer or of the person's network written in the grant, which may use `http:`.
  - **Never the local program itself:** its own port on this computer is refused whatever is granted.
  - **The rest stays:** a plain GET with no body, cookie or credential; no redirect followed; ten seconds, the name's resolution included; 256 KiB at most; four fetches of one package under way at once.
- **2026-10-25, what the build settled (W37).** ADR-0063 records the messages of protocol 6, each sender's limits, how package code fetches through the program, and how live values read and are marked. The values of a target that leaves the model are forgotten with it, and an undo that brings it back does not bring them back. On the canvas, a stale value's fade is the mark `○` and its age, written in the detail.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->
- 2026-10-25 (merging W37): **what follows.**
  - Protocol version 6 also carries following a destination to another project (ADR 0056); no version shipped between them, so they share it.
  - Overlays (ADR 0055) and the element list read attributes through the app's lookup, live and computed values over stored ones, as filters and the inspector already do.
  - A view state gains the time range, as it holds the filters, so that view addresses and tours carry it.
  - Claude's read tools show live values with their sender and age, and `filter_view` sets a time range.
  - A stale value keeps its `○` mark and its age; it is not faded.
  - A live update that comes during a layout animation does not cut it short.
  - Each of these is a task in the spec's M8 section.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W45): **what Claude's read tools show of live values.** Claude reads them; `filter_view`'s time range comes after the view state carries it (W44).
  - **Beside the stored attributes.** `get_item`, for an element or a relation, and `find_elements`, for each element it finds, answer `liveValues` right after `attributes`, by attribute name, when there are any. `find_relations` answers no attributes, so no live values either.
  - **What each says:** its `value`; its `sender`, `claude`, `command-line` or `package` with its `package`; `ageSeconds`, in whole seconds, counted as the app counts it (from when it was measured, unless that is after it arrived); `stale`, whether it is older than its sender's freshness; `freshForSeconds`; and `measuredAt`, as an ISO 8601 date-time, when its sender gave it.
  - **`find_elements` still finds by stored values.** Its attribute filter is a question about the model, as `set_scope`'s conditions are; the live values show beside what it finds.
  - **`get_live_values` lists them,** everyone's, of some targets or attributes or all of them, the latest first: 100 by default and 500 at most, with how many match (`total`) and how many did not come (`more`). Past that, a summary of every value that matches: how many targets, how many stale, and by attribute how many values and how many stale, the most first, at most 50 attributes and the rest counted. Each value names its target and its kind, and the attribute's stored value when the target has one. Targets that are not elements or relations are named back, as `set_live_values` names them.
  - **From the program's store, never a copy.** The tools ask the program through Claude's endpoint each time (ADR 0063's clarification of this date), so that a value is never older than the program says, and the MCP entry point keeps none of them. Ages count to the program's clock.
  - **Nothing is stored by reading.** Live values are the person's data shown to Claude, as attribute values are: data, never instructions.
- 2026-10-25 (W44): **overlays, the element list and the layout's moves with live values.**
  - **Overlays on the canvas read through the lookup.** The canvas's scene is the view's scene with the details and the overlays of its shapes and lines read through the app's lookup, live and computed values over stored ones (`sceneWithValues`); it equals the view's scene built from nothing with those values stored, but for the marks the details write. A live value colors, sizes, marks and fades as a stored one would; an overlay's size from it moves nothing that layout reads, grows what holds the shape, and routes again only the lines on it. Every other part of the app, and every export, reads the view's own scene: a file never carries a live or computed value, so a PNG, an SVG, a PDF or the outline draws overlays by what is stored.
  - **What a live update costs.** The overlays' cache for a shape or a line is keyed by the values they read, so it changes when one of those values changes, and only then; a shape whose overlays read what is stored is the view scene's own object. The live values book says, for each view, which targets read otherwise than in an earlier view of the same book (`changedSince`): those whose values changed, and those whose stale values' age, as the canvas writes it, moved on; it keeps that for the last 32 publishes, and copies only the targets a publish changed. The lookup adds the targets package code answered otherwise for. The canvas's scene is then made from the last one for the same view scene by working out again only the shapes of those elements, what sits in those whose colors changed, and the lines of those relations; while an overlay sizes shapes, their extents, the routes on them and the bounds are worked out over the view, as a layout's. When what changed cannot be told, everything is read again.
  - **The element list reads through the lookup** too. A cell writes a live value with `●`, a stale one with `○` and its age, and a computed one with `ƒ`, as the canvas writes them, and says who sent it, or which package computed it, when pointed at. The list sorts and filters by what its cells show, marks and all, and Copy copies the values shown, without their marks. Editing, clearing and pasting change the stored value: a cell edited shows what is stored, under the live value. An attribute only live values or package code give an element has a column of its own, after the elements' own.
  - **A layout's move goes on through a live update.** What the layout hook compares is where shapes and lines are, not the scene: a scene with the same shapes in the same rectangles and extents and the same routes takes the move's place as where it ends, from where it is, so a live update that changes only values, details or colors neither cuts the move short nor starts it again. One that moves or sizes a shape shows the view as it is now, as any change does.
  - **The budget.** The benchmark's `?live` adds a phase in which 1,000 of 10,000 values change at a time under an overlay that colors every shape by them, timed from the values to the frame drawn, whose mark is one frame at 60 a second. Measured in Node on the builder's machine, under load, such an update cost about 2 ms for the book, 10 to 18 ms for the canvas's scene and 1 to 3 ms for its index, against 84 ms for the scene before it was made incremental; the browser's run, with the frame, is what judges it.
