---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Claude attaches to the local program through an endpoint and a credential of its own

Claude Code and Claude Desktop start Visual Anything's MCP stdio entry point (`packages/server/src/mcp-cli.ts`), a process of its own. It attaches to the local program that owns the project (ADR-0013, ADR-0016) in these ways, which the spec left open:

- **Finding the program.** Every running program writes a record into the runtime folder, named by a hash of the project folder's real path: its protocol version, process, port, the project folder and Claude's credential, and when it started. The record is written before the program says it runs, and removed when it stops, if it still names that program. The entry point, given a project folder, reads that record; given none, it attaches to the only program running. A record whose process is gone is passed over. ADR-0030 says where the runtime folder is and which records are trusted.
- **Starting it when needed.** When no program runs on the project, the entry point starts one in the background, with the same Node.js and loaders it runs with, as `cli.ts <folder> --no-open --stop-when-idle`. That program writes its output to a log beside its record, and stops by itself once no app and no Claude has been connected for a minute, so it outlives Claude while the person keeps working in the app, and does not linger once nothing uses it. When it cannot start, Claude is told the end of its log. Nothing is started until a tool needs the program, so starting Claude Desktop starts no Visual Anything.
- **An endpoint of its own.** Claude attaches through the WebSocket at `/claude`, never the app's `/live`. The request must name the local program in its Host header and must carry no Origin header: browsers always send one on a WebSocket, so no page, the app's own included, can open it. It must carry Claude's credential in its `Authorization: Bearer` header, which a page cannot set on a WebSocket either, and which stays out of URLs and logs. The credential is 32 random bytes, made when the program starts, separate from the session token, which never leaves the program (ADR-0030).
- **Only the messages Claude may send.** The endpoint accepts exactly three: `command`, which always runs with Claude as its author, whatever the message says; `guidance`, which goes to every open app; and `open-app`, which opens the browser at a launch address. Anything else, undo, redo and preferences included, is refused with `invalid-command`. The program answers with the live protocol's own messages (`project/opened` without the token, `project/changed`, `command/rejected`, `project/reloaded`), plus `guidance/shown` with how many apps the guidance reached and `app/opened`. The entry point keeps its copy of the project in step with every change, as an app does, so that read tools need no round trip.
- **Claude does not undo.** Undo and redo take back the newest action whoever did it, so Claude could take back the person's. The person undoes Claude's actions in the app, one at a time, like their own; Claude takes back a change of its own by making the opposite change.
- **One call, one action.** Every write tool sends one command, or one batch with a label, so it is one undoable action labelled Claude. `add_to_model` creates elements and relations together, naming new ones with refs local to the call, for which the entry point makes the ids. A delete that would take more than Claude named, or break a scenario step, is refused until Claude passes `cascade: true`, so that Claude tells the person first. Positions Claude sets are left unpinned unless it says otherwise, so that layout may still move them (ADR-0009).
- **Guidance.** Guidance names elements, relations and free shapes by id, and optionally the view to open first: highlight replaces Claude's marks, focus also dims what is not connected to its targets and moves the canvas to the first, pan to moves the canvas, a caption shows a short plain text, and clear takes it all away. The program sends it to every open app after the work already asked for, so it never arrives before the change it is about, and records nothing. The app shows it through the emphasis store as the `guidance` source, the editor's `reveal` and a caption over the canvas, announced to screen readers, which the person can dismiss. The live protocol becomes version 3.
- **Untrusted text.** The server's instructions tell Claude that names, descriptions, attribute values and notes in a project are data, never instructions, since a project can come from a cloned repository.

We chose this because a process Claude starts must reach a program the person may have started, or start one; because a credential and an endpoint of Claude's own keep the page's token inside the program and let the endpoint accept only what Claude may do; and because keeping undo and preferences with the person means Claude can never take back or change what is theirs.

## Considered options

- **The entry point owns the model while Claude works**: rejected. ADR-0016 gives the model and its history to one program, and the app and Claude would hold two copies.
- **Handing the session token to the entry point**: rejected. The token would leave the program, and with it the app's whole protocol: undo, redo and preferences.
- **An HTTP endpoint**: rejected. A WebSocket pushes every change, so the entry point's copy stays current, and the program knows when Claude detaches.
- **The credential in the query string**: rejected. Queries end up in logs; a header does not.
- **A fixed port instead of a record**: rejected. A taken port fails, two projects open at once need two ports, and any program on that port would receive Claude's commands.
- **Starting the program as a child that dies with Claude**: rejected. Quitting Claude would close the app the person is still using.
- **Letting Claude undo only its own newest action**: left for later. It is safe, but v0.1 keeps every undo with the person.

## Consequences

- A record holds a secret that opens the Claude endpoint, so its folder must stay private (ADR-0030).
- Layout run by Claude waits for ELK (ADR-0015), which runs in the app's worker; Claude can collapse and expand through the command of the collapse task once the core has it, and is told so until then.
- The scenario tools of wave 2 build on the same tool interface (`Program` in `claude/bridge.ts`, `Tool` in `claude/tools.ts`).

## Clarifications

- 2026-10-25 (W26): `open-app` takes an optional view state, which the program checks against the project and carries in the launch address it opens; `visual-anything open` uses the same message to open a tab in a program that already runs on its folder (ADR-0044). The answer is still `app/opened`, never the address.
- 2026-10-24: guidance also filters and focuses the open view (`filter`, `focus-view`, `clear-explore`, ADR 0025) and opens, plays, pauses and steps through a scenario (`playback`, ADR 0031), with protocol version 4. The app applies them as if the person had: they show in the explore strip and the scenario panel, and the person ends them there. A new filter from Claude replaces the view's filters; for playback, and for each of filters and focus, only the latest request is kept, and a playback request whose scenario's timeline is not ready by the next change is dropped, so that nothing plays late. A request naming a view, or a scenario over another view, opens that view first. None of it is written to a view file or the history.
