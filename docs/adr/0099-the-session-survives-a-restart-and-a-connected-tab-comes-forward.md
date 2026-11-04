---
status: accepted
---

<!-- From GitHub issue #8, "A tab can't rejoin after the program restarts", and the user's later word on Docker: the address "dura 2 minutos y no te da tiempo a nada". Options 1 and 3 of the issue were chosen by the main session under the user's standing delegation of design decisions; the details below were decided by Claude while building them. Supersedes parts of ADR 0030 and ADR 0093, and takes up the subcommand ADR 0094 deferred. -->

# The session survives a restart, a connected tab comes forward, and a new address is one command away

ADR 0030 made the session token anew on every start and kept it only in memory. Every restart therefore left every open tab dead: the person needed a new launch address, which works for two minutes, and a new tab. In Docker (ADR 0094) a new address meant `docker attach`, and Claude's `open_app` failed there (no `xdg-open`) or, on a desktop, opened yet another tab each time. Claude restarts the container on purpose sometimes, to write many files, and that killed the session too.

## Decision

### 1. The kept session

- **What is kept.** When the program starts, it keeps a private record of its session: the session token, the port it listens on, what it started on (home and its projects folder, or a project folder), at home the project open now, when the token was made and when the record was last kept. It keeps it again whenever home opens or closes a project, and as it stops. `packages/server/src/kept-session.ts`.
- **Where.** In the runtime folder beside Claude's record (ADR 0029), checked exactly as that folder is (ADR 0030): in the profile on Windows, the user's own and 0700 elsewhere, each record 0600 and trusted only as a regular file of this user reached through no link. Its name is `session-<hash of the key>.json`, so it never mixes with Claude's records. An absolute `VISUAL_ANYTHING_SESSIONS` names another folder, checked the same way; the image sets it to `/data/preferences/sessions`, on the volume, so that it survives `docker restart`, `docker compose up` after `down`, and `docker run --rm`.
- **When it is reused.** The next start on the same key reuses the token only:
  - on the port it had. With no `--port`, the program asks for that port first. If the port is taken, it listens on any free port **with a new token**, so that a token a tab may have sent to whatever took the port is worth nothing. With a `--port` other than the one kept, a new token too;
  - within a day of the record being last kept, and 30 days of the token being made. Otherwise a new token.
  
  Another projects folder or project folder has a key, a record and a token of its own.
- **At home, the project comes back.** A home program that reuses its session opens again the project that was open when it stopped, unless another program has it open (ADR-0044) or it no longer holds a project; then it stays at home and says so. So after `docker restart` the tab reconnects to the project it showed.
- **Rotation.** There is no "End all sessions" in the app today, so nothing rotates on it; deleting the record, starting on another folder or port, or a day without running, makes a new token. A control that ends every session is left to a later change.
- **Nothing changes on the wire for the token.** It still travels only as ADR 0030 says: handed to a tab in `project/opened` for a launch code, kept in session storage, sent in `/live?token=…`. It is never printed, logged, or put in an address. The terminal says only that the program "keeps the session of its last run".

### 2. A tab reconnects by itself, once the program proves it holds the session

- When a tab's live connection closes while it shows a project, home or a start screen, it says so and tries to reconnect: after 1 s, then doubling up to every 10 s, as long as the tab lives. It never retries with a launch code, which works once.
- **Proof first.** Before each try it asks `GET /session/proof?challenge=<32 random hex digits>`. The program answers `{ "proof": HMAC-SHA256(token, "visual-anything session proof\n" + challenge) }` in base64url, never cached (`sessionProof` in `security.ts`). The tab computes the same with Web Crypto and sends its token over `/live` only when they match. Nothing answering: it waits and tries again. A wrong proof, or a refusal: it stops and says that Visual Anything runs again with another session, and how to get a new address. The route is behind the same Host and Origin checks as every request; a challenge gives nothing that opens the session, and a random challenge makes a proof seen once useless.
- When the program greets the tab again it says "Visual Anything restarted; reconnected." (for a connection that went away, close codes 1001 and 1006), or "Reconnected to Visual Anything; this tab shows the project as it is now." for any other close.

### 3. Opening the app when a tab is connected brings that tab forward

- `open-app` on the Claude endpoint, which `open_app`, `visual-anything open <folder>` and a destination to another project send, now answers how it opened the app (`app/opened` with `how`):
  - **`tab`**: while a tab is connected and no new tab is asked for, the program opens no tab. It sends every connected tab the new live message **`app/shown`**, with the view state, if any. Only the tab the person used last (ADR-0029's W49 clarification) acts on it. It calls `window.focus()` (browsers mostly let a page come forward only within its own window), puts the view state in its address, where it applies as an address brought to the tab does, and shows "Visual Anything was asked to show this tab."
  - **`browser`**: with no tab connected, or `newTab: true`, the browser opens a launch address, as before.
  - **`address`**: when the browser cannot be opened, as in a container, or the program has no way to, the program prints the launch address in its own terminal, as it does when it starts, and the answer says why. `visual-anything open` prints it too. `open_app` never carries it: it tells Claude that no tab opened and that the person can open the printed address or run `visual-anything address`. ADR 0030's "neither gives a launch code" holds, since whoever opens a launch address acts as the person, not as Claude: their actions are recorded as the person's, and only the person approves package code (ADR 0054).
- `open_app` takes `newTab: true` for when the person asks for a separate tab.
- `app/shown` is a new server message, so **the live protocol becomes version 10**; v0.1.1 shipped 9. The Claude endpoint's `app/opened` gains optional fields, read as `browser` when absent.

### 4. `visual-anything address`

- `visual-anything address [folder]` asks the program running on the folder, or the only one running, for a new launch address and prints it. It works at home too. This is the subcommand ADR 0094 deferred. In a container: `docker exec visual-anything visual-anything address`. It never starts a program.
- **How it reaches the program.** The way `visual-anything mcp` does: Claude's record (ADR 0029) and the Claude endpoint, with a new message `launch-address`, answered with `launch/address`. Claude's tools never send it. Making the address ends the one before, as `a` does.
- **At home there is a record now.** This supersedes ADR 0093's "at home there is none". A home program writes Claude's record with the projects folder as its `folder` and `home: true`. When a project opens, that record gives way to the project's, and comes back when the program goes home. The endpoint greets Claude at home with `project/closed`. The MCP entry point attaches there, refuses every project tool with that sentence, as it does after "Projects…", and still opens the app and makes addresses. So in Docker, Claude can bring the app up before any project is open.
- The refusal of an address used twice or too late, and the app's "how to open it again", now name `visual-anything address`, with the Docker form.

## What still holds from ADR 0030

- **Other websites.** Every request still names 127.0.0.1 or localhost at the program's port, and comes from the app's own origin when it names one. The proof route and `/live` sit behind the same checks.
- **Other local accounts.** The kept record is guarded exactly as Claude's record, which already held a credential on disk for the same user.
- **Addresses, history and the terminal.** The token is in none of them. Launch addresses still work once, within two minutes.

## What remains

- **A program that squats the port in a restart gap.** It cannot get the token by answering the tab's reconnection, since the tab sends it only after the proof. If the person *reloads* the tab while another program of another account serves that origin, that program's page can read the origin's session storage. Before, the token it read was dead after the restart; now it lives until the program restarts on another port or the record expires. Taking the port makes our program choose a new port and token. But a squatter that releases the port before our program starts again would hold a live token. This needs another account to bind the exact loopback port in a gap of seconds and the person to reload during that gap. Every credential kept by a `127.0.0.1:<port>` origin across restarts shares the risk; the day's limit bounds it.
- **The port in a tab's origin.** A tab reconnects only to the same port. With no `--port`, a restart asks for the kept port first, so it is usually the same. If the port is taken, the tab is told to get a new address.
- **Who holds the record.** Any process of the same user can read it, as it can read Claude's record or the browser's profile.

## Considered options

- **A reconnect secret per tab, swapped once for a new token (option 2 of the issue).** Rejected for now: it needs a second secret in session storage, as exposed to a squatter's page as the token, plus more protocol, and gives nothing option 1 with the proof does not.
- **The tab sending its token without a proof.** Rejected: a tab that retries by itself would hand a living token to whatever answers on the port while the program is down.
- **Keeping the session in the preferences file.** Rejected: the preferences file is not private (ADR-0032 keeps no secrets), and two programs merge into it.
- **Giving Claude the launch address when no browser opens, or the session token.** Rejected: a launch address opens a tab that acts as the person, so a model that saw one, or text that led it astray, could act as them. The address goes to the program's terminal and to the person's own command, and the token goes nowhere.
- **`app/shown` carried by `notice`.** Rejected: every tab would show it, the tab used last could not apply the view state, and no tab could come forward.

## Consequences

- `ServerOptions.token`, `CommandEnvironment.sessionsFolder`, `HomeSession.resume`, `ProgramRecord.home`, `Program.openApp`'s answer (`AppOpening`) and `ProgramBridge.launchAddress` are new.
- `compose.yaml`, the Dockerfile (`VISUAL_ANYTHING_SESSIONS`), the README's "Run it in Docker" and the guide say how reconnection and new addresses work.
