---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Each person's preferences live with the local program, outside every project

The theme (match the system, light or dark), whether the grid, snapping and the rulers are on, and the colors a person picked lately are that person's preferences. The local program keeps them in `preferences.json` in the person's configuration folder: `%APPDATA%\Visual Anything` on Windows, `~/Library/Application Support/Visual Anything` on macOS, and `$XDG_CONFIG_HOME/visual-anything`, or `~/.config/visual-anything`, elsewhere; an absolute `VISUAL_ANYTHING_PREFERENCES` names another folder, for tests and portable use, and a relative one is ignored with a warning. The program works the path out once when it starts and never takes one from a message.

- **Reading.** The file is read leniently, and a broken file never stops the program. A missing file gives the defaults (match the system, no grid, snapping on, no rulers, no recent colors) and creates nothing. A file that is not JSON, holds no object, is over 64 KiB or is not a file gives the defaults with one warning in the terminal, and is left as it is until the person changes a preference.
- **Versions.** The file names its format version. A file from a later version is used for what this program can read but never written: its preferences then last until the program stops. A value this program cannot read, such as a theme added later, is kept as found and written back unchanged unless the person sets that preference, and so is a name it does not know.
- **Writing.** Each change reads the file again and merges by name, so that two running programs keep each other's changes, then writes it atomically, as project files are written, with its keys in a fixed order. When the write fails, the change still applies until the program stops, and the app that asked is told it could not be saved.
- **Travel.** Preferences travel only over the live connection, which requires the session token. The program sends `preferences/changed` to every app when it connects and after every change, the app that asked with its request id; an app sends `preferences/set`, half a second after the person's last change, or at once when its tab is hidden. Changes are checked strictly: unknown names, wrong types, more than 8 colors or a color that is not `#RRGGBB` are refused with `command/rejected`, as an unreadable message is. These messages join the live protocol without a version of their own.
- **Not commands.** Preferences are never undone, carry no author, never enter the history, never wait behind the project's own work and are never written to a project. Claude's tools neither read nor change them, and Claude's endpoint does not accept `preferences/set`.
- **The first frame.** When the person chose a theme, the address the program opens carries it in its fragment beside the token (`theme=dark`), and each tab keeps the last one it applied in its session storage. A small script of the page's own origin, `theme.js`, reads them before the first paint and writes `data-theme` on the page, so the first frame is already drawn in the theme. Being a file and not an inline script, it needs no hash in the page's content security policy: `script-src 'self'` allows it. It only reads, accepts only the listed names, and a forged hint changes only that tab's first frame.
- **In the tab.** A change applies in the tab at once, and the tab keeps the person's latest choice over what the program sends until the program answers; a refusal puts back the program's value with a notice. While the tab is not connected, its theme applies to that tab only, and it says so.

We chose this because the app's address changes every session (any free port, and two host names), so the browser keeps nothing from one session to the next, and because a person's theme is theirs, not their collaborators'.

## Considered options

- **Browser localStorage**: rejected. It is keyed by origin, which changes every session; 127.0.0.1 and localhost are two origins; and neither the program nor Claude can see it.
- **A fixed port, then localStorage**: rejected. A taken port silently loses everything, two projects need two ports, and any later program on that port can read the storage.
- **The project or view files**: rejected. One person's look would be imposed on collaborators through git, and every toggle would become an undoable action and a file write.
- **Cookies**: rejected. They are shared with every web app on 127.0.0.1, whatever its port, and sent with every request.
- **An HTTP route**: rejected. A request without an Origin passes the checks without the token.
- **An inline script for the first paint**: rejected. The page's content security policy would have to allow it by its hash, which every change to the script would have to update.

## Consequences

This is the first file the program writes outside the project folder; tests always pass a folder of their own, or none, which keeps preferences in memory. Two programs open at once share the file, and the last change to a name wins. The read-only demo, which runs without the local program, follows the system and may keep a choice in its own origin's localStorage.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (A3): the grid, snapping and the rulers are turned on and off from the canvas toolbar, and the grid and the rulers with Shift+G and Shift+R on the canvas. Snapping applies only while the grid shows, so its toggle stays off until then, and the defaults (no grid, snapping on) keep M2's moves. A change of them while the tab is not connected says that the grid and the rulers apply to this tab only, as a change of the theme or the language says it of them.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M11b's plan): **`reviewClaude`**, a boolean, false by default: whether Claude's changes wait as a proposal for the person's review (ADR 0073).
  - It is set from the history panel.
  - Like every preference, it travels only over the live connection.
  - Claude's tools neither read nor change it. Claude learns only that a change of its own was proposed.

<!-- Decided by Claude on 2026-10-27 under the user's standing delegation of design decisions. -->

- 2026-10-27 (M11c's task "The stage", ADR 0077): **`motion`** and **`fades`**, how tours and scenario playback move.
  - `motion` is `"system"`, the default, `"reduced"` or `"full"`: as the system's reduced motion setting says, reduced whatever it says, or full whatever it says. Reduced, every camera change of a tour, of playback following a step and of the view state cuts, and travelling markers stay still. `fades` is a boolean, true by default: whether a tour's stages fade and its cuts cross-fade.
  - The file writes them after `author`, so that a file written before reads as it did and gains them with their defaults at the next change. A value this build cannot read, such as a motion added later, is kept as found, as every preference's is. A change to them is refused with `"motion" must be "system", "reduced" or "full", not …` or `"fades" must be true or false, not …`.
  - They are set in the tours panel, under the list of tours, and apply in the tab at once; while the tab is not connected it says that they apply to this tab only.
  - The read-only page, which has no program to keep them, follows the system's setting with fades on, and offers no choice of them.
