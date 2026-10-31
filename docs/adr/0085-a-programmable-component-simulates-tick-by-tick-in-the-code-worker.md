---
status: accepted
---

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions. The research was done with the user's medical-audit model in mind, reading only its shape: a Postgres model of about 70 tables whose state columns list their states in checks, triggers that move a record from one state to the next, and a rule engine and workflows that assign and run audits. Two behaviors are worth simulating there: an audit moving through its states, and a rule engine under load. -->

# A programmable component simulates tick by tick in the code worker, from parameters kept by the tab

ADR 0002 kept programmable components so that a person can simulate, and CONTEXT.md defines Simulate as computing a behavior from parameters the person changes. ADR 0054 runs package code in QuickJS in a worker, approved by its hash, through three hooks. M12 adds the fourth and the app around it.

The user's model shows the two shapes a simulation takes:

- **A process through its states.** One thing moves from state to state along the model's own relations: an audit going from draft to review to closed, with a chance of going back. What the viewer wants to see is where it is now, which way it went, and how long it stayed.
- **A system under load.** Numbers change together over time: items arriving, workers taking them, a queue growing. What the viewer wants to see is the curve, and the moment it goes past what the system can hold.

Both are a state that moves forward one tick at a time, from parameters, with chance in it. So one hook covers both.

## The hook

- **`simulate(element, context)`** is a fourth export of a package's code. It is called once for each tick and answers the next tick:
  - `context` holds what the other hooks get (ADR 0054), and also:
    - `parameters`, the run's values;
    - `state`, what the previous tick answered, or `undefined` at tick 0;
    - `tick`, from 0;
    - `time`, the tick times the declared length of a tick;
    - `random()`.
  - It answers:
    - `values`: the declared simulated values, by name;
    - `state`: any plain data the next tick needs, up to 64 KiB written as JSON;
    - `marks`: up to 64 ids among the element, its relations, their ends, its containers, its contents and the relations between its contents, to show on the canvas this tick, so that a case moving through the states it holds marks the way it went;
    - `done`: `true`, or a short sentence, when the behavior has ended by itself.
- **Chance repeats.** `context.random()` and `Math.random()` draw from one generator whose seed is made from the run's seed and the tick, so the same code, parameters, seed and model always give the same ticks. A tick can also be worked out again from the state before it, with nothing else kept. The clock stays off without `time` (ADR 0054), and `context.time` is simulated time, never the clock's.
- **The input is read once.** A run reads the element's context when it starts. An edit to the model while it runs ends the run, which says that the model changed. The ticks it holds are kept, and Run again starts it afresh.

## What a component declares

A component gains `simulation`, plain data in its package, inherited whole like its other parts and replaced whole by a component that redefines it:

- `parameters`, 1 to 32 of them. Each has a name, a type (`number`, `boolean` or `choice`), a default, and optional `min`, `max`, `step`, `unit`, `choices` and `description`.
- `values`, 1 to 64 of them. Each has a name, a type (`number`, `string` or `boolean`), and optional `unit`, `choices` and `description`. A number's optional `min` and `max` are its **limits**.
- `tick`, how long one tick stands for, as a length and a unit such as `1 s` or `1 day`. It defaults to one tick of no unit.
- `ticks`, how many a run plays unless the person asks for more: 100 by default, at most 10,000.

A component with `simulation` whose package code does not export `simulate`, or whose code is not approved, shows its Simulation section with that said and nothing to play.

## The run

- **Where it runs.** In the app's code worker, in the package's own runtime (ADR 0054), never in the program. Work goes in the worker's slices, so the canvas keeps drawing while a run plays. A tab runs at most 16 simulations at once, one for each element.
- **What stops it, cleanly.** A run stops at the tick that:
  - answers `done`;
  - reaches its ticks;
  - puts a number past its limits, a value not among its choices, or a number that is not finite;
  - throws, takes over 50 ms, goes past 32 MiB, answers a state over 64 KiB, or answers what the core's checks reject.

  The stop names its reason, the value and the tick. The ticks before it stay, and the tick that failed is not shown. Only failures, the last group, count towards turning the package off after three in a row (ADR 0054). Ending, reaching the ticks and a limit are the behavior's, not the code's fault.
- **Parameters** are checked against their declaration before a run starts: a value out of range or of the wrong type is refused, and controls never offer one. Changing a parameter starts the run again from tick 0 with the same seed, and plays it up to the tick shown. So what the viewer sees is the same moment under the new parameters.
- **Going back.** Every tick's values and marks are kept, up to 16 MiB for each run, so going back a tick, or to any tick on the run's chart, shows it at once. States are kept at every tick while they fit, then at every 100th. Run from here drops the ticks after the one shown and plays on from it, working out its state from the nearest one kept.
- **Nothing is saved.** Runs, parameters and seeds live in the tab, like scenario choices (ADR 0031) and live values (ADR 0057). They never enter a file, the model or the history. A view state can carry one simulation, its element, parameters, seed and tick, so a view address or a tour step can show a moment of it.

## How it shows

- **The inspector's Simulation section** holds:
  - the parameters as controls: a slider with its field for a number with a range, a list for choices, a check box for a boolean;
  - the seed, with New seed;
  - Play, Pause, Back a tick, Forward a tick, Run from here, Reset, and the speed (1, 5, 20 or 60 ticks a second, or as fast as it goes);
  - the tick and its simulated time, and the stop and its reason;
  - each value with its limits, and a chart of each number over the run's ticks with the tick shown marked, where a click goes to that tick.
- **On the canvas,** a simulated value whose name is also one of the element's attributes is read in place of it, over live, computed and stored values. So shapes' detail, badges, overlays and filters show it with the mark `∿`. A tick's marks draw like a scenario step's: highlighted shapes, and travelling markers along relations from their from end. The physical-space panel shows them as it shows playback (ADR 0076).
- **Reduced motion** keeps the markers still at their ends, as playback does.

## Claude

- `get_simulation`: a component's or an element's declaration, and whether its code is approved.
- `run_simulation`: runs an element's simulation in Claude's own process, in the app's sandbox, as `run_package_code` does (ADR 0054), with parameters, a seed, ticks and an optional tick to start from. It answers the stop and its reason, and each value's first, last, lowest and highest, with at most 200 ticks sampled evenly and the stop's tick always among them. It runs only code the person approved.
- `show_simulation`: guidance. It opens an element's Simulation section in the app with parameters, a seed and a tick, and plays or pauses it. It never changes the model, and the person can change or end it.

## Considered options

- **Simulations as scenarios built by code:** rejected. A scenario is a concrete example the person can read in a file, and ADR 0078 keeps decisions from being made by code. A simulation is worked out, never stored, and its chance is the point of it. CONTEXT.md already keeps "simulation" off scenarios.
- **Parameters as attributes changed by commands:** rejected. Every slider moved would be an action in the history, and exploring would change the model. Keeping them in the tab, and in view states for sharing, follows guidance's rule that exploring never edits.
- **A generator kept in the state:** rejected. Seeding from the run's seed and the tick works a tick out again from the state before it with nothing more, and code cannot break it by forgetting to carry it.
- **Simulations that feed each other:** left for later. Each element runs alone, and reading another's values would need an order between runs and a way to break their cycles.
- **Running on the program or with native speed for trusted code** (ADR 0012's consequences): left for later. The interpreter in the worker is fast enough for the sizes above, and the benchmark records how fast.

## Consequences

- The schema gains `Component.simulation` and its types, and `simulation` in saved view states.
- The core gains `core/src/simulation/`:
  - reading a component's simulation with inheritance;
  - checking parameters and the hook's answers;
  - the generator for a tick;
  - the run's record: its ticks, its stop, going back and running from here, within its budgets.

  It also gains `simulate` among the hooks, the view state's `simulation`, and guidance `simulation`, in protocol 7, since no build of 7 has shipped.
- The app gains the worker's simulation messages, the tab's simulation store, the inspector's section, simulated values in its attribute lookup, and a tick's marks on the canvas and in the panel.
- Claude gains `get_simulation`, `run_simulation` and `show_simulation`.
- CONTEXT.md gains Simulation, Simulation run, Tick, Parameter, Simulated value and Simulation limit.

## Clarifications

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions. -->

- 2026-10-31 (M12's worker): what the ADR left open.
  - **The tick's generator in the sandbox.** The prelude makes the core's `TICK_RANDOM_SOURCE` before the package's code runs, on an `imul` of its own, so code that replaces `Math.imul` changes nothing it draws. `Math.random` is the prelude's own function, which code can neither replace nor get past: assigning to it throws. For each call of `simulate` it draws from a generator made afresh from the run's seed and the tick, in one sequence with `context.random()`; a `Math.random` taken at the module's top draws from the tick under way too. In the other hooks it draws as the engine does.
  - **Numbers that are not finite.** JSON cannot hold them, so `simulate`'s answer leaves the interpreter as `[answer, carried]`: a simulated value that is `NaN`, `Infinity` or `-Infinity` is written `null`, and `carried` names it with what it was, so that the core's check stops the run at that value's limit. Only values are carried: such a number in the state, or anywhere else, is not plain data, and fails.
  - **How long an answer may be.** 128 KiB as JSON, twice the state's cap, so that a state up to 64 KiB with the tick's values and marks reaches the core's check, which refuses a state past 64 KiB; past 128 KiB the interpreter refuses the answer before it leaves.
  - **Slices.** The runner takes the tab's requests in order, once the packages sent before them run. Runs' ticks are worked out in slices of their own, as long as the hooks' (40 ms); while both have work, a slice of each in turn, within a long round of hooks too, so neither waits on the other. The worker says it is idle only when neither has work, so its watchdog keeps watching while a run plays, and blames the package whose `simulate` it called last.
  - **What counts towards turning code off.** Each failure of a run counts one stop, as a stopped call of ADR 0054 does, and shows as the package's last problem, naming `simulate` and the element. A tick that answers ends no row of stops: a run calls `simulate` for every tick, so code failing at its fourth tick every time would otherwise never be counted, nor code that stalls the worker there, whose runs the tab starts again. A hook's call that does not stop ends the row, as ADR 0054 has it.
  - **Why a run cannot go on.** A run whose code is turned off, or no longer among the packages the app sends, ends as when the model changed, keeping its ticks, and also says why, as a run that cannot start does: `off`, `not-approved`, or `no-code` for code that does not export `simulate` or did not load.

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions, while building M12's inspector and canvas. -->

- 2026-10-31 (M12, the inspector and the canvas): **what the decision left open in the app.**
  - **A run opens when asked.** Selecting an element whose component simulates shows its Simulation section with what it simulates and Open the simulation; nothing runs until then, so selecting never sets the worker to work. Close the simulation ends the run, and the canvas reads its values as before.
  - **The simulation shown.** A view state carries one simulation: the run of the element selected alone when it has one, else the run opened last. Applying a view state opens its simulation paused at its tick and closes the tab's other runs; one without a simulation closes them all, as it closes the scenario and the physical-space panel. One already shown as the view state says is left as it plays, so a tour's step does not start it again.
  - **Guidance** opens the run as the person would: it selects the element, so that the inspector shows the section, opens the run, and plays it at the speed asked or leaves it paused. `close` closes the simulation shown.
  - **Marks.** A tick's marks highlight the elements and relations it names, and a marker travels along each relation the view draws as a line, from its from end, each time the marks change. It travels for a tick's time at the run's speed, at most 600 ms, then stands at its to end; as fast as it goes, and under reduced motion, it stands there at once. Marking a relation does not highlight its ends: a tick marks them itself when it means them.
  - **The stop is said when it shows.** The worker works ticks out ahead, so a run often holds its stop before the tick it stops at shows. The section says the stop once the run shows its last tick held, or whenever it is paused, and the app's announcer says it once the run shows it, naming the element.
  - **What could not run opens again** once the code of its package stands otherwise, as when the person approves it; a run refused as one too many waits for Reset.
  - **Controls.** A number with both a lowest and a highest has a slider beside its field; a number without both has its field alone. A number typed out of its range is refused in the field, with the reason, and changes nothing. New seed draws another seed at random. A chart is a slider over the ticks held: the arrow keys, Page Up, Page Down, Home and End go from tick to tick, as a click does.
  - **Where `∿` shows.** In shapes' detail on the canvas and in the element list, where `ƒ` shows, with the package named in the element list's tooltip, and beside each value in the Simulation section, which also says when a value is read on the canvas in place of an attribute. The Attributes section keeps showing stored values, as it does while package code computes.
  - **Words.** In Spanish a simulation run is a "corrida", a tick a "tic", a parameter a "parámetro", a seed a "semilla" and a simulated value a "valor simulado". "Simulación" is a term of its own now: the catalog test avoids it only for scenarios, and avoids the new terms' Avoid lists where they are not other terms.
  - **The store**, as the seam left it, but for one fix and one saving: opening, closing and the worker's restart drop what `simulated()` and `marks()` kept, so a closed run's values are never read; and a run whose tick shown stayed keeps its map of values, so the canvas works out again only the elements whose tick moved.
  - **The code worker's host** is made by the shell, which lends it to package code (`usePackageCode`'s `makeHost`) and to the tab's simulation store, through a port lent again whenever React mounts the shell's effects again.

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions, after M12's spec review. -->

- 2026-10-31 (M12's spec review): **a run reads its model once, and goes on from nothing else.**
  - **The model a run reads.** Code granted `model:read` reads, at every tick, the project the run started from, never the project as it is now. Since what such code reads cannot be told apart from the rest of the model, any edit to the model ends its run, as one to the element or what lies around it ends any run.
  - **No going on from a changed model.** Run from here and Play after a run played its ticks first check that the run can still go on as it started; when the model or the code changed, they answer the stop `changed` and work nothing out. The section disables Run from here on that stop: Reset plays the run again from the model as it is now.
  - **Words.** A limit's value is `limitValue` in a stop, in Claude's answers and in the app's templates, since the glossary avoids "bound"; tests and helpers name ticks, never steps.
  - **Left for later:** a past tick worked out again that answers otherwise is recorded as a failure at the next tick, not at the one worked again; and no property test bounds the text of the states a thinned run keeps, which the real limits bound at 100 states of 64 KiB.
