---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# A launch address that works once; project files and Claude's records only as regular files where they belong

The local program keeps three things out of reach of other websites, other programs and other accounts on the computer: the session token, the project folder's files, and the record that lets Claude attach (ADR-0029). It does so in these ways, which `docs/designs/components.md` §4.5 and §5.6 first described.

## The session token never leaves the program

- The program keeps the session token (32 random bytes). It never prints it, never puts it in an address and never hands it to another process; `RunningServer.token` exists for code in the same process only.
- It opens the browser, or with `--no-open` prints, a launch address, `http://127.0.0.1:<port>/#launch=<code>`. The launch code is 16 random bytes in base64url, works once within two minutes, and only one is open at a time: making one ends the one before. The theme the person chose travels beside it as `&theme=light` or `&theme=dark`, which is no secret.
- The page takes the code out of the address and the tab's history, and opens `/live?launch=<code>`. The program compares it in constant time and ends it, and `project/opened` then carries the session token, which the tab keeps in session storage for reloads and reconnections through `/live?token=…`. The page never takes a token from an address. A new tab of the same browser can also get it from a tab that holds it, over this origin's `BroadcastChannel` (ADR-0043). Because React's StrictMode mounts the page twice in dev, a socket opened with a launch code is kept through a disconnect followed at once by a connect.
- A code used again, or late, is refused with 401; a code used twice also warns in the terminal: "The launch address was used twice; if your tab did not open the project, something else on this computer used it first."
- In a terminal, `o` opens a new tab and `a` prints a new launch address. The live protocol is version 3.

## Project files are read and written only as regular files inside the project folder

- The project folder is resolved with `realpath` once, when it opens, and everything is read and written through that path.
- `packages/`, `views/` and `scenarios/` must be real folders, not links; each project file must be a regular file within its kind's cap: `.vaproject` 1 MiB; `.vamodel`, `.vaview` and `.vascenario` 64 MiB; `.vapackage` 8 MiB. Links, junctions, devices, FIFOs and sockets are problems of their file, and nothing they point to is read.
- **Each read is bound to what was checked.** The name is looked at with `lstat` and must be a regular file; it is opened with `O_NOFOLLOW` and `O_NONBLOCK` where the platform has them; the open file, looked at through its handle, must have the device and file number `lstat` saw, compared as 64-bit numbers; the name's real path must lie inside the project folder and lead to that same file; and then exactly the bytes the file held are read through that handle. Anything that does not match is refused rather than read. The watcher and the session's check for changes on disk read the same way.
- **Each write is bound to what was checked.** At the start, the folder must be a real folder whose real path lies in the project folder; its device and file number are kept, and where the platform has `O_DIRECTORY` and `O_NOFOLLOW` it is also opened with them and must be that folder. Just before the rename, the folder must still be that folder and the target a regular file or nothing; a regular target gets a hard link beside it as a backup. After the rename, the target's real path must lie inside the project folder and be the file written. If not, the backup is put back over the name, or what was written is removed, and the write is refused.

## Claude's records are private, and trusted only where they belong

- On Windows, the runtime folder is `%LOCALAPPDATA%\Visual Anything\run`, from `LOCALAPPDATA` when it lies in the user's profile, or else `<profile>\AppData\Local\Visual Anything\run`: inside the profile, whose inherited access list admits only the user, SYSTEM and Administrators. A folder named by `VISUAL_ANYTHING_RUNTIME`, or reached through a link, is refused unless its real path lies in the profile, and the refusal says why. The program does not run `icacls` or change access lists.
- Elsewhere, the runtime folder is `~/Library/Application Support/Visual Anything/run` on macOS, and `$XDG_RUNTIME_DIR/visual-anything`, or `~/.local/state/visual-anything/run`, on other systems. It must belong to the user; one made by the program is 0700, and one other users may write in is refused. Each record is 0600, and one of another user, or readable by others, is not trusted.
- Everywhere, a record is trusted only when it is a regular file reached through no link, inside the runtime folder, read as project files are, and no older than the start of the program it names. A record whose process is gone is passed over, and the endpoint still checks the credential.

## What remains, notably on Windows

- **Windows has neither `O_NOFOLLOW` nor `O_DIRECTORY`.** Reads stay safe: the bytes come from a handle whose identity matched both the `lstat` and the real path inside the project folder. Writes keep a narrow window between the last check and the rename: a folder swapped for a junction in that moment makes the rename fail, or land outside, which the check after the rename detects and undoes. Until it is undone, another process could read the file where it landed; and a file of the same name there gets its bytes back only when the hard-link backup could be made, which needs the same volume and a file system with hard links, such as NTFS, not FAT or some network shares.
- **Hard links.** A file hard-linked into the project folder from outside is a regular file inside it, and is read as one. Making one needs write access to the project folder; git never creates them.
- **The record.** SYSTEM and Administrators can read the record on Windows, and root can elsewhere, as they can read anything the user owns. Any process the user runs can read it too: the credential guards against other accounts and websites, not against the user's own programs.
- **The launch address** passes through the command line of the process that opens the browser, which any local account can list, for at most two minutes and once.

We chose this because a cloned project is data from someone else: a link in it must never make the program read a key, hang on a FIFO, exhaust memory on `/dev/zero`, or write a copy of a secret into the repository; because a token printed in a terminal or kept in the browser's history could be replayed by any local program; and because a record that holds a credential must be neither readable nor plantable by another account.

## Considered options

- **The token in the address's fragment, as before**: rejected. It sat in the terminal, in the process list through `open()`, and in the browser's history.
- **A cookie set by a first request**: rejected. A request without an Origin passes the checks without a token, and cookies are shared with every web app on 127.0.0.1.
- **Trusting `lstat` alone**: rejected. On Windows, which lacks `O_NOFOLLOW`, a name swapped after the look is opened through the link.
- **Setting access lists on Windows with `icacls`**: rejected. A program that runs another program to change permissions is harder to trust than a folder whose inherited permissions are already the user's.

## Consequences

- An older build's address, with `#token=`, no longer opens the app: it is removed from the address and the tab says how to open the app again.
- Every read of a project file costs an `lstat`, a `realpath` and two `stat`s more, and every write a hard link and a few looks more; a project has few files, so this does not show.
- CLAUDE.md's rules on project files and on the server should say this; the main session makes those edits.

## Addendum 2026-10-25: view addresses

<!-- Decided by Claude on 2026-10-25, building W21, under the user's standing delegation of design decisions. -->

The second benchmark's R26 asks for addresses that open a project at a view state. They are built on this ADR's launch addresses and keep its rule: the session token never leaves the program.

- **One view state.** The core's `view-state.ts` defines it: the view; the camera, as the point of the view at the middle of the canvas and the zoom, so that an address shows the same place in any window; the selection; the filters (ADR-0025); focus mode, with what it starts from when that is not the selection; and the scenario open and the step it is on, by the step's id, so that an address survives steps added before it. Everything is named by id, so an address survives renames.
- **Its fragment.** `#view=…&camera=…&select=…&filters=…&focus=…&scenario=…&step=…`, written and read by the core. Reading refuses anything malformed with a message and never throws; writing and reading give back exactly the same value, also after another page re-encodes the fragment as `URLSearchParams` does. Reading leaves out `launch`, `theme` and `token`, and writing never writes them, so a view address holds no secret.
- **A launch address can carry one**, after its code and theme: `http://127.0.0.1:<port>/#launch=<code>&theme=dark&view=…&select=…`. The page takes the code out at once, as before, and keeps the rest. The state applies only once the code is redeemed: the shell mounts only when `project/opened` has come, and applies the state then.
- **The app keeps its own address in step**, a moment after the view state last changed, by replacing the history entry, never adding one, so that Back still leaves the app. A reload therefore comes back to the same view state, and Copy address, in the header, copies it. An address pasted into the tab's address bar applies as one opened.
- **The command line.** `visual-anything [open] <folder> --view <id> [--select <id>]…` opens the browser at, or with `--no-open` prints, a launch address that carries the view state; so does every launch address of that run, from `o` and `a` too. A view or an id the project does not hold stops it before it starts, with exit code 2.
- **Claude.** `get_view_address` answers the fragment of a view state, never a launch address: a launch code in Claude's transcript would let whatever reads it open a whole session, which can undo and change the person's preferences, as Claude's endpoint may not (ADR-0029). Since ADR-0044 it answers the full address while the program runs, and `open_app` opens a tab at a view state; neither gives a launch code.

### Options considered for view addresses

- **The view state in the query string**: rejected. A query reaches the program and its logs; a fragment never leaves the browser.
- **The view state as JSON in the fragment**: rejected. It is long and unreadable, and it has to be encoded twice over anyway.
- **A new history entry for each change**: rejected. Back would step through every pan and zoom.
- **Steps by their index**: rejected. Adding a step before it would make an address show another one.

### What remains of view addresses

- ~~A view address opened in a new tab finds no session there: the tab says how to open the app again. A new tab opens a view state only through a launch address, from `visual-anything open`.~~ Settled by ADR-0043: a new tab joins the session of a tab of the same browser that has the project open; with none open, it says how to open the app again, as before.
- The port changes from one run to the next unless `--port` fixes it, so what lasts of a view address is its fragment.
- A selection of more than 500 things is left out of the address, and Copy address says so.
- Tours (R45), comments (R46) and the read-only page (R32) are to reuse the same value.

## Addendum 2026-10-25: sessions and running programs

<!-- Decided by Claude on 2026-10-25, building W26, under the user's standing delegation of design decisions. -->

- **Tabs share the session.** A tab with neither a launch code nor a token asks the other tabs of its browser for the token over this origin's `BroadcastChannel`, and a tab whose live connection is open gives it (ADR-0043). The token still goes into no address and no log, and nothing outside this origin hears it.
- **One program per project.** `visual-anything open <folder> --view …` while a program runs on that folder asks that program to open a tab at the view state, through the Claude endpoint's `open-app`, and starts no second program; with `--no-open` it prints the running program's view address (ADR-0044).

## Clarifications

<!-- Decided by Claude on 2026-10-28 under the user's standing delegation of design decisions. -->

- 2026-10-28 (M11c, ADR 0078): **a view address carries the alternatives chosen** at the decisions of its scenario, last, as `choices=<decision>:<alternative>,…` in the order of the decisions' ids: `#view=system-overview&scenario=patient-books-appointment&step=join-waiting-list&choices=free-slot:week-full` opens step 6 in the alternative "No, the week is full". Ids hold neither `:` nor `,`, so nothing more is encoded. Choices need `scenario` and are left out when there are none; an address written before them reads as it did. A launch address carries them as it carries the rest, and what they name that the scenario no longer has is left out and said, as other missing ids are.

<!-- Decided on 2026-11-04 from GitHub issue #8, under the user's standing delegation of design decisions. -->

- 2026-11-04 (ADR 0099): **the session token survives a restart.** It is no longer made anew on every start: the program keeps it in a private record beside Claude's, guarded as that record is, and reuses it on the next start on the same folder and port within a day, so that an open tab reconnects by itself, after the program proves it holds the token. It is still never printed, logged or put in an address. When Claude opens the app while a tab is connected, that tab comes forward; with no tab and no browser, as in a container, `open_app` answers a launch address for the person, which supersedes "neither gives a launch code" above for that case alone. `visual-anything address` prints a new launch address from any terminal. ADR 0099 says how, and what remains.
