---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Live values travel in protocol 6 from three senders, and package code fetches through the program

ADR-0057 decided that live values come from Claude, the command line and approved package code, that the local program keeps the latest of each in memory only, and that they read like attributes with a mark and an age. ADR-0054 left `network:<origin>` without a way to fetch. Building M8 (W37) needed what other builds of the app, the program and Claude's MCP entry point must agree on, and what package code is written against: hard to change once packages and scripts use them.

## The messages (live protocol 6)

- **To every open app:** `live/values`, with the values new or changed and the keys removed (cleared, dropped to make room, or of a target no longer in the model). An app forgets every live value on `project/opened`, and the program then sends those it keeps, a thousand to a message.
- **A live value** is `{ target, attribute, value, measuredAt?, sender, arrivedAt, freshFor }`: an element or relation id, an attribute name of one line of at most 64 characters, plain JSON of at most 1 KiB, when it was measured if known, who sent it (`claude`, `command-line`, or `package` with its id), when the program got it, and how long it stays fresh (a second to a week; a minute by default). Every reader rebuilds it from these parts only.
- **From Claude's endpoint:** `live/set` with `from` `claude` or `command-line`, answered with `live/kept` (kept, waiting, dropped, the unknown targets, the refused values by their place); `live/clear` of some targets or attributes, of one sender or everyone, answered with `live/cleared`.
- **From an app, for package code:** `live/fetch` of one address for one package, answered with `live/fetched` (status and text) or `command/rejected`; `live/set` with the package, answered with `live/kept`.

## Senders and their limits

- **Each sender on each connection has its own second:** twenty messages a second are kept at once; a message past that waits, merged with what waits, the latest of each target and attribute winning, and goes once the second has room. What waits is at most a thousand values; past that, and past a thousand in one message, the oldest go. The program keeps at most 100,000 values in all, dropping the oldest. Each of these is said once: on the program's standard error and as a notice to the apps.
- **Targets must be in the model** when the values arrive; others are named back as unknown. The values of a target that leaves the model go with it, and an undo that brings the target back does not bring them: the next value comes from its sender.
- **Package code sends values only of the elements its hooks run on,** and only while the person approved its code as it is now with at least one origin granted; the program checks both against the person's preferences, which it keeps.
- **The command line** sends through Claude's endpoint, with the credential of the program's record (ADR-0029), as `command-line`. It never starts a program: values with no app open would only be forgotten.

## Package code and the network

- **`context.fetched(url, { every })`,** in `attributes` only, for a package granted an origin: what the local program last fetched from that address, `{ status, text }`, frozen, or `undefined` until it has; and a request to fetch it every `every` seconds while the code reads it (5 s to an hour; 30 s by default). An address on no origin granted throws, and so does a seventeenth address of one package. `check`, `draw` and code granted no origin have no `context.fetched`, and Claude's `run_package_code` runs without it.
- **No fourth hook:** ADR-0054's three stay. A call of `attributes` that read an answer through `context.fetched` answers live values, every one of them, not computed values: the app sends them to the program as the package's, and every app shows them, as all live values, with the package named in the mark. They stay fresh for twice the longest `every` of the addresses the call read.
- **Who fetches:** the code worker says which addresses each package's code reads; the app asks the program to fetch each, at once and then every `every` seconds while it is read; the program checks the approval, the origin and where the address leads (ADR-0057's clarification on addresses), fetches with a plain GET, and the app hands the answer to the worker, which calls again the elements that read an address whose answer changed. Nothing fetches from the page or the worker, whose policy still allows no connection.

## How live values read

- **One lookup in the app,** in this order: a live value, then a value package code computed, then the stored value, then the definition's default, each with where it comes from. The inspector, the detail on the canvas and filters, and time ranges, read through it; overlays (ADR-0055) are to read through it too.
- **Marks.** The inspector names the sender and the age, and fades a stale value. The canvas writes `●` before a fresh live value, `○` and the age in parentheses after a stale one, as its fade, and `ƒ` before a computed one, in the detail's own text, so that the renderer draws nothing new. Ages count from when a value was measured, unless that is after it arrived.
- **The canvas's scene for live values** is the view's scene with only the shapes whose detail reads otherwise replaced, in the same places; every other part of the app reads the view's scene. The app hears of changes at most four times a second, and once more when a value goes stale or its age moves on.
- **Keep as attribute** is one action of the person's, `Keep the live value of “…” as an attribute`, an `update-element` or `update-relation` in a labelled batch.

## Considered options

- **A fourth hook, `live`, for what to fetch and what to make of it:** rejected. It would supersede ADR-0054's three hooks for something `attributes` does already, given one more way to read.
- **The program fetching on a schedule a package declares as data, the code only reading:** rejected. It needs a schema change, and the code knows best which addresses its elements need.
- **Package code's live values kept in the app that made them:** rejected. ADR-0057 has the program keep every live value and send it to every app; other tabs and Claude's clear see them the same way.
- **Fading a stale value's text on the canvas by its alpha:** rejected for now. The renderer draws a detail as one text; a mark in the text needs no change to it, and reads in exports and screen readers too.
- **Refusing what comes past the rate:** rejected. With live values the newest matter most, so the oldest give way.

## Consequences

- `PROTOCOL_VERSION` is 6; an app, a program or an MCP entry point of another version refuses to talk, as before.
- The core has `packages/core/src/live/`: the checks, the store, the gate, the messages and the reading; the program has `live.ts`, `live-fetch.ts`, `addresses.ts` and `live-command.ts`; the app has `live-values/` and `code/network.ts`.
- What package code fetches is the program's work, within its caps; a package that wants more is refused there and says so in the app once.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W45): **Claude's endpoint reads live values back.** It takes `live/list`, of some `targets` or `attributes` or all of them, everyone's, and at most `limit` (1 to 1,000; 1,000 when left out). The program answers with `live/listed`: the values that match, the latest first, each as a live value is sent (`{ target, attribute, value, measuredAt?, sender, arrivedAt, freshFor }`) and read back from those parts only; `total`, how many match; `at`, the program's time, which ages count to; and, when more match than came, a `summary` of all of them (ADR 0057's clarification of this date). Reading changes nothing, and nothing else of the endpoint changes: an app never gets these messages.
