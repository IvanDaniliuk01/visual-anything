---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# A launch address that works once; project files and Claude's records only as regular files where they belong

The local program keeps three things out of reach of other websites, other programs and other accounts on the computer: the session token, the project folder's files, and the record that lets Claude attach (ADR-0029). It does so in these ways, which `docs/designs/components.md` §4.5 and §5.6 first described.

## The session token never leaves the program

- The program keeps the session token (32 random bytes). It never prints it, never puts it in an address and never hands it to another process; `RunningServer.token` exists for code in the same process only.
- It opens the browser, or with `--no-open` prints, a launch address, `http://127.0.0.1:<port>/#launch=<code>`. The launch code is 16 random bytes in base64url, works once within two minutes, and only one is open at a time: making one ends the one before. The theme the person chose travels beside it as `&theme=light` or `&theme=dark`, which is no secret.
- The page takes the code out of the address and the tab's history, and opens `/live?launch=<code>`. The program compares it in constant time and ends it, and `project/opened` then carries the session token, which the tab keeps in session storage for reloads and reconnections through `/live?token=…`. The page never takes a token from an address. Because React's StrictMode mounts the page twice in dev, a socket opened with a launch code is kept through a disconnect followed at once by a connect.
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
