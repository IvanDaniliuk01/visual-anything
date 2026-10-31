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
    - `marks`: up to 64 ids among the element, its relations, their ends, its containers and its contents, to show on the canvas this tick;
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

  It also gains `simulate` among the hooks, the view state's `simulation`, and guidance `simulation` in protocol 8.
- The app gains the worker's simulation messages, the tab's simulation store, the inspector's section, simulated values in its attribute lookup, and a tick's marks on the canvas and in the panel.
- Claude gains `get_simulation`, `run_simulation` and `show_simulation`.
- CONTEXT.md gains Simulation, Simulation run, Tick, Parameter, Simulated value and Simulation limit.
