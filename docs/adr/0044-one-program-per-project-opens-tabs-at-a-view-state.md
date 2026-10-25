---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# One program per project, which opens tabs at a view state for the command line and for Claude

ADR-0030's addendum gave the command line `--view` and `--select`, and Claude `link_to`, which answered only an address's fragment. Running `visual-anything open <folder> --view …` while a program already ran on that folder started a second program on the same files, and Claude could open the app only where it opens by default. This settles how a view state reaches a program that runs.

## The interface for opening an app takes a view state

- The Claude endpoint's `open-app` message (ADR-0029) takes an optional `state`, a view state as the core's `checkViewState` reads it. A state that is not one is refused with `invalid-command`, as an unreadable message is; one that names what the project does not hold, by the core's `viewStateProblems`, is refused with each problem, and nothing opens. Otherwise the program opens the browser at a launch address that carries the state after its code and theme, `#launch=<code>&theme=dark&view=…`, which the tab applies once the code is redeemed (ADR-0030's addendum). It answers `app/opened`, never with the address: a launch code stays out of every answer.
- **Claude.** `open_app` takes the same view state as `link_to` (a view, the camera, a selection, filters, focus, a scenario and its step), all of it optional; parts without a view are refused, and without any it opens the app as before. `link_to` answers the full address while the program runs, `http://127.0.0.1:<port>/#view=…`, the port taken from the program's record, with the fragment beside it as `fragment`. Neither ever gives a launch code or the token.

## A program that runs on the folder opens the tab

- `visual-anything [open] <folder>` first looks in the runtime folder for the record of a program running on that folder, as Claude's MCP entry point does (ADR-0029), and attaches to its Claude endpoint with the record's credential, starting nothing. When one answers, the command checks the view state against that program's project, asks it through `open-app` to open a tab at that state, says so, and exits with 0: `Visual Anything already runs on "<project>" at http://127.0.0.1:<port>/, so it opens a new tab there.` A view or id the project does not hold stops it with exit code 2, as before.
- With `--no-open`, it opens nothing and prints the running program's view address, `http://127.0.0.1:<port>/#view=…`, which opens in the browser where the project is open (ADR-0043), and says how to get an address that works once: run it again without `--no-open`, or press `a` in the program's terminal.
- When no program runs, or the record names one that is gone or does not answer, the command starts the program as before. When the program that runs comes from another build, it says so and exits with 1, rather than start a second program on the same files.
- `--port`, `--dev` and `--stop-when-idle` matter only to a program that starts. A program Claude's entry point started that finds another already running exits at once; the entry point then attaches to the one running, as it looks for a record before it looks at whether what it started has exited.

We chose this because one program must own a project's files and history (ADR-0016), so a second one on the same folder can only lose changes; because the interface Claude already uses to open the app, behind its own credential, is the one place a process of the person's account can ask a running program for a tab; and because the launch code never leaving the program keeps ADR-0030's rule for Claude's transcript and the terminal alike.

## Considered options

- **The running program prints a launch address on behalf of `--no-open`**: rejected. Through the Claude endpoint it would hand launch codes to whatever holds Claude's credential, which ADR-0030's addendum refused for Claude's transcript.
- **A second program on its own port, as before**: rejected. Two programs on one folder each keep a history and write the same files.
- **A lock file in the project folder**: rejected. It would sit in the repository's folder, and the runtime folder's record already says which program runs.
- **`link_to` without the port**: rejected now. With ADR-0043 a full address opens in a new tab, which a fragment alone does not.

## Consequences

- The command line attaches to the Claude endpoint, so the running program counts it as one more connection for a moment, as it counts Claude.
- A full address from `link_to` names this run's port; once the program starts again elsewhere, its fragment still opens the same view state from a tab of the new run.
- The CLI's usage, the MCP instructions and the tool descriptions say this.
