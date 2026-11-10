---
label: wayfinder:grilling
title: How the person approves an explorable and its libraries
status: closed
assignee: claude
blocked_by: [03-sandboxing-an-explorable.md, 05-capturing-an-explorable.md]
---

# How the person approves an explorable and its libraries

## Question

Under the user's answer (approve once; Claude's later changes in that session run; changes from outside ask again), what does the person see before approving, where are approvals kept (a preference, as ADR 0060's are), what does "Claude's change in that session" mean precisely when the program restarts or git brings a change, and how does this read beside package code's approval, which Claude cannot give?

## Resolution

Grilled with the user on 2026-11-10 (Q36 to Q42); the user took every recommendation.

- **Q36, what the person sees.** A dialog with the explorable's name and description; who wrote it (Claude in this session, or "came from outside": an import, git, the person's editor); its script libraries with version, license and size; the code, behind "Show code"; and one plain sentence on the risk: it runs walled off and cannot see the person's files, session or the network, and the one thing no browser lets us block fully is sending data out over WebRTC, so approve it if you trust whoever wrote it.
- **Q37, kept as package code's are** (ADR 0060): a preference outside every project (ADR 0032), by the hash of the explorable's text and its script libraries' hashes, valid in any project that holds the same explorable; a list of its own, `explorableApprovals`, newest first, at most 1,024, since Claude's iterations make many hashes.
- **Q38, how Claude's changes run.** When Claude writes through `write_explorable` to an explorable whose current text is approved, the program approves the new hash in the person's name and records that it came from Claude, following an approved one. So a restart keeps it approved; undo returns to a text already approved; a text from the person's editor or from git is a new hash Claude did not write, and asks; a new explorable Claude makes asks the first time (Q9).
- **Q39, script libraries.** Downloading one asks before any byte is fetched, showing the package, version and address (ticket 04). Once downloaded with that consent, Claude adding it to an approved explorable runs under Q38 without a second approval.
- **Q40, the read-only page.** Only explorables the exporting person approved go in live, and they run there by themselves; the others go in as their card. A click would not protect a reader from a page whose whole file could be altered; what matters is that nothing unapproved is exported live.
- **Q41, revoking.** The approved explorables are listed where package code's approvals are, and can be removed; one removed shows its card again.
- **Q42, Claude never approves.** It can ask whether an explorable is approved, and `capture_explorable` answers `not-approved` when it is not; the only thing it does on its own is continue a chain the person started (Q38). ADR 0060's rule holds, with that one exception, which `CONTEXT.md`'s **Approval** now states.
