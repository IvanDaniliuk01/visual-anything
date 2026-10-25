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
