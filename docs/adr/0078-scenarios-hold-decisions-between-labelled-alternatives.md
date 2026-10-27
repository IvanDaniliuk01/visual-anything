---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Scenarios hold decisions between labelled alternatives

A scenario is a concrete example played step by step, and ADR 0031, CONTEXT.md and the spec say it has no branches: an alternative path is a separate scenario. Real processes decide: a booking finds a free slot or puts the patient on a waiting list; a request is cached or fetched. Mermaid's and PlantUML's `alt`, `opt` and `break`, Structurizr's and LikeC4's dynamic views, and every log of a process that went one way one day and another the next, are split today into scenarios that repeat their common start. The research on conditional processes looked at BPMN gateways and token simulation, UML activity and sequence diagrams, IcePanel flows, Ilograph sequences, statecharts and Stately's simulation, Petri nets, DMN and workflow tools. The tools that explain let the viewer choose the alternative; conditions written as expressions belong to tools that run. This supersedes ADR 0031's "no branches", and the signature of its timeline.

## Decision

### Where the structure lives

- **`steps` stays a flat list** holding every step of every alternative, in reading order. A new optional key, **`blocks`**, groups stretches of it by id. A scenario without `blocks` is exactly what it is today, and is written byte for byte as now.
- Broken steps, comparisons and merges by id (ADR 0070, ADR 0072), Claude's step numbers, tours' step ids and every reader that only reads `steps` keep working: they see all the steps, in reading order.

### Decisions, first

- A **Decision** is a block `{ id, kind: "decision", question, alternatives, default? }`.
- An **Alternative** is `{ id, label, steps: [step ids], ends?: true }`:
  - its steps are a contiguous stretch of `steps`, and the alternatives of a decision follow one another;
  - an alternative with no steps is the path where nothing happens, as `opt` has it;
  - `ends: true` ends the scenario after it, as `break` or an error path does.
- **Rules the core checks:** 2 to 8 alternatives, at least one with steps; `default` names one of them, and the first plays without it; a step belongs to at most one alternative at each depth; blocks nest or stay apart, never cross; at most three deep; the ids of blocks and alternatives are unique and never a step's. A command that would break them is refused; a file that breaks them warns on open and plays its steps in order.
- **Every step can be reached** by some choice of alternatives (a property test).

### Playing a decision

- **The timeline depends on the choices:** `scenarioTimeline(project, scenario, view, choices?)`, with `choices` mapping a decision's id to an alternative's id. Without blocks or without choices, it is exactly today's (a property test).
- **Choices belong to the tab**, as playback does (ADR 0031): they are never written to a file or kept in the history.
- **Playing never stops at a decision by default.** It plays the alternative chosen, or the default. A **decision card** beside the steps shows the question and the alternatives as buttons, numbered, with the one playing pressed; the digits choose while the card has focus. The tab's option **Stop at each decision** pauses there for the person to ask "what do you think happens?".
- **Changing the alternative** recomputes the timeline and goes to the first step of the new alternative, or stays on the step when the new timeline still holds it.
- **Going to a step of an alternative not chosen**, from the list or with `go_to_step`, makes the choices that reach it (`choicesToReach`) and says so.
- **On the canvas**, while a decision lasts, the relations that only the alternatives not chosen use are drawn dimmed and dashed, never hidden; hovering or focusing an alternative of the card shows its relations as a preview. The sets involved hold at most the scenario's relations and change only when the step or the choices do, never per frame.
- **The steps' list** shows a decision as a header with a tab for each alternative: the one chosen open, the others folded and grey, their broken steps marked all the same. Steps keep their numbers in reading order.

### Broken steps, still never deleted

- A broken step stays in its alternative, plays only when its alternative does, and is marked in the list whichever alternative is chosen. Deleting a relation says which decision and alternative its steps are in. An alternative whose steps are all broken is kept and marked.
- Deleting a step takes it out of its alternative in the same action; a block left with no steps at all goes in that action too.

### Recording and editing

- Recording stays one `update-scenario` for each click, in a labelled batch, each undone on its own:
  - **Add an alternative here**, from a step's menu or the recording bar: after the current step, a decision with two alternatives, the first holding the steps that followed and the second empty, where recording goes on; or one more alternative for a decision already there;
  - **Rejoin here**, on a step of an alternative: that step and those after it leave the decision and become the common continuation;
  - **End the alternative** brings recording back after the decision.
- `update-scenario` takes `blocks`, checked by the core.

### Tours, view states and addresses

- A tour step's `play` takes `choices`, so that it plays a given alternative; `from` and `to` must lie on the timeline those choices give, or the step is kept and marked as one naming what was deleted is (ADR 0058).
- A saved view state, and an address (ADR 0044), carry `choices`, so that a link opens "step 6, in the alternative No".
- Tours themselves stay linear.

### Claude

- `read_scenario` gives the blocks, their alternatives and defaults, the broken steps with their alternative, and the combinations of choices, counted up to a cap.
- `create_scenario_from_steps` takes decisions among its steps, as a tree (`{ decision, alternatives: [{ label, steps }] }`), which the core stores as the flat list with blocks; `update_scenario` gains `add-decision`, `add-alternative`, `set-alternative`, `set-default`, `rejoin` and `remove-decision` (which keeps the default alternative's steps and takes the others out after a preview, since that deletes steps).
- Guidance gains `{ kind: 'playback', action: 'choose', scenario, decision, alternative }`, and `open_scenario`, `play_scenario` and `go_to_step` take `choices`. The choice is the tab's, and the person changes it at will. It travels in protocol 7, since no version has been released since it.
- Recipes: Mermaid's and PlantUML's `alt` and `opt` become decisions, `break` an alternative that ends; logs of the same process that differ become a decision where they differ.

### Never code

- Alternatives are chosen by the person, by Claude, by a tour or by an address. Nothing in a scenario file is an expression. When conditions come (below), they are closed data: the filters' tests on an attribute, compared as text, never interpreted.

### Later, each by a clarification of this ADR or an ADR of its own

- **Phase 2:** parallel tracks that play together, a fixed number of repeats (2 to 20), named cases that fix a set of choices, and the recipes of `par` and `loop`.
- **Phase 3:** conditions as data on attributes, live values included, evaluated once when playback enters the decision and fixed until it leaves.
- **Phase 4:** scenarios that call other scenarios.

## Considered options

- **Separate scenarios linked as variants of a base**: rejected. It keeps each file linear, but needs references between files, covers no parallel or repeats, and shows no single place where the alternatives meet.
- **Structure nested inside `steps`**, as Mermaid writes it: rejected. Every reader of `steps` would break, and nested lists do not merge by id.
- **A graph of steps with `next` links**, as BPMN or a state machine: rejected. It loses the reading order and the list, needs termination for loops and a meaning for joins, and a merge can make cycles.
- **Conditions as expressions**: rejected. They are code, which no project file stores.
- **Playing stopping at every decision by default**: rejected. Play must always reach the end; stopping is the tab's option.

## Consequences

- The schema gains `ScenarioFile.blocks` with `DecisionBlock` and `Alternative`; the schemas are regenerated and the format stays at version 1.
- The core gains the blocks' checks and their property tests, `scenarioTimeline` with choices, `choicesToReach`, `alternativeOf`, broken steps with their alternative, and the editing helpers that keep blocks whole when steps are deleted or moved.
- The app gains choices in the scenario session, the decision card, the grouped steps' list, dimmed alternatives and their preview, the recording actions, and the read-only page plays with the card.
- `SavedViewState`, addresses and tours' `play` gain `choices`.
- Claude's scenario tools and the recipes change as above.
- ADR 0031 gains a "Superseded in part" section; CONTEXT.md's **Scenario** and **Timeline** change and it gains **Decision** and **Alternative**; CLAUDE.md's rule on broken steps says "in any alternative too"; the spec's scenario row changes.
- The 10,000-element view keeps its budget while a decision plays (a phase of the benchmark).

## Clarifications

<!-- Decided by Claude on 2026-10-27 under the user's standing delegation of design decisions. -->

- 2026-10-27 (M11c's task "Decisions in the app"):
  - **Where playback meets a decision, and how long it lasts.** A decision is met on the last step that plays before playback reaches it (it comes *ahead*), on every step of the alternative it plays (it *holds* them), and, for one reached before any step plays, on the first step that plays. An aggregated step meets what comes after its last step. The card shows, and the canvas dims, exactly while a decision is met: so a decision whose alternative chosen is empty still shows, on the step before it. The core gives this as `decisionsAt(scenario, step, choices)`, each with its `place`: `holding`, `ahead` or `before` (property test: the decisions met on the steps that play are those playback reaches).
  - **Stop at each decision** pauses at the end of the step a decision comes ahead of, its marker at the far end, and says "Paused before “…”. Choose an alternative, then play on."; playing on passes that decision, and going to another step lets it stop there again. It is the tab's option, and the read-only page's, off by default and never stored, and it waits while a tour plays its own range.
  - **The card's keys.** The digits 1 to 8 choose while the card has focus; the arrow keys, Home and End go from one alternative to the next without choosing, since focusing an alternative previews it; Enter and Space press the one focused. The card takes one stop in the tab order, at the alternative playing. Choosing says "“No” plays at “Is every item in stock?”."; so does going to a step of an alternative not chosen, for each alternative it changed.
  - **Changing the alternative** keeps playback on its step while the new choices still play it; otherwise it goes to the first step of the alternative chosen that plays, else to the first that plays after the decision, else to the last that plays. Choices are the tab's for the scenario open: opening a scenario, the same one included, starts from every default.
  - **The canvas** draws the relations that only the alternatives not chosen of the decisions met use dimmed and dashed, as an emphasis source of its own (`decision`) with a new `Emphasis.dashed`; the renderer draws those lines dashed in their tiles, planning again only the tiles of the lines whose dashes change. The alternative pointed at or focused, on the card or in the list, is previewed: its relations drawn in full, still dashed. Pointing at an alternative in the list previews it even while its decision is not met.
  - **The steps' list** shows each decision as its question over its alternatives. Each alternative's button chooses it, pressed for the one playing; the one chosen is open, the others folded, greyed and dashed, each saying how many steps it holds, how many are broken, "Nothing happens" when it holds none and "Ends the scenario" when it ends. "Show its steps" unfolds one without choosing it; pressing one of its steps goes there and chooses what reaches it. Steps keep their numbers in reading order. A scenario without decisions, or whose decisions do not hold together, lists its timeline as before.
  - **Recording.**
    - **A click records after the current step, in every alternative that holds it** (the core's `insertStep`). Turning recording on goes to the last step that plays. Shift+click changes the current step only, as before.
    - **Add an alternative here**, from the recording bar or the step's details, first asks for its words: for a decision that starts right after the step, only the new alternative's label ("Alternative 3"); otherwise the new decision's question and two labels, "Yes" for the alternative that keeps the steps that follow and "No" for the new one. Nothing is written until the next click, which records the new alternative's first step and the alternative, or the decision, with it, as one `update-scenario` labelled "Add the alternative “…” after step 3 of “…”" or "Add the decision “…” after step 1 of “…”" (the core's `addAlternativeAfter`). The tab then chooses it, and recording goes on in it. An alternative is never written empty by recording: a new decision after the last step of its stretch would otherwise hold no step at all.
    - **End the alternative** writes nothing: the next click records after the innermost decision whose alternative holds the current step, outside it, and "Record after the step again" goes back. **Rejoin here**, in the details of a step in an alternative, is one `update-scenario` labelled "Rejoin at step 9 of “…”" (the core's `rejoinAt`).
    - A click whose decisions would not hold together, as one more than three deep, is not sent, and the panel says why in the core's words.
    - Move up and Move down move a step only among the steps of its own stretch: the alternative it is in, or none.
    - A scenario without decisions records its steps alone, `update-scenario` with `steps` only, as before.
  - **The core keeps alternatives inside others whole.** `addAlternativeAfter` adds the step recorded to every alternative holding the step it follows, and `rejoinAt`, `removeDecision` and `update-scenario` with steps alone keep each alternative's steps in the order the steps have (`inReadingOrder`), so that moving a step inside its alternative is kept, not refused (property tests over any scenario: recording after any step or decision, adding an alternative after any step and rejoining at any step of one keep the decisions whole and play the step).
  - **The delete preview says where each broken step is**: `DeletePreview.brokenSteps` gives each one's innermost decision and alternative (`within`), which the delete dialog writes as "An order: The order is cancelled… (in “No” at “Is every item in stock?”)", and which `preview_delete` returns as it is.
  - **For the tasks after this one**, the session takes a choice with `choose({ decision, alternative })`, which the `choose` guidance can call as the panel does, and `goToStep` already chooses what reaches the step it goes to.
- 2026-10-27 (the app task's questions, answered by the main session): **a scenario whose decisions do not hold together offers Remove the decisions** in its panel, one action that takes `blocks` away and keeps every step in order, since the core refuses every change of its steps meanwhile. Going to a step of an alternative not chosen chooses what reaches it, tours' ranges included, until view states and tours carry choices. Recording never writes an empty alternative, so a decision recorded after the last step of its stretch holds the step that comes next rather than an empty second alternative.
