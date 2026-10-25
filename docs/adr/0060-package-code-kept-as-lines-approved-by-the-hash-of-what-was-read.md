---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Package code is kept as lines, and approved by the hash of what the person read

ADR-0054 decided that package code is approved by the SHA-256 of its text and its capabilities, in the person's preferences. Building it (M7) needed three things the files and the preferences keep for good: how the code is written in a package file, what exactly the hash is of, and what an approval records. They are hard to change once projects and preferences hold them.

## In the package file

- **`code` is a list of lines.** `PackageFile.code` holds one module of JavaScript, one item per line, without line endings (a line holds no CR or LF, and at most 10,000 characters; at most 20,000 lines). Project files are written one array item per line, so a change to the code shows in git as the lines it changed, not as one line of escaped text.
- **`capabilities` is a list,** each `model:read`, `time` or `network:` with one web origin as browsers write it: small letters, no path, no default port. The core keeps them sorted. A capability this build cannot read is kept in the file, warned about, and never granted.
- **Caps.** The code's text, its lines joined by line feeds, is at most 256 KiB; code past that is kept, warned about, and never runs, approved or not.

## The hash

The hash is the SHA-256, in lowercase hexadecimal, of the UTF-8 of `[text, capabilities]` written as JSON: the text is the lines joined by line feeds, and the capabilities are every one the file declares, readable or not, sorted and each once. The core works it out itself, synchronously, so the app, the program and Claude's tools always agree on it. Any change to a line or to a capability changes it; the order the capabilities are declared in does not.

## An approval

- **What it records.** `{ hash, package, capabilities }`: the hash the person approved, the package it was approved in, to name it, and the capabilities granted, a subset of those declared. The preference `codeApprovals` holds them newest first, one per hash, at most 256; approving one more forgets the oldest.
- **Of what was read.** The dialog shows the code and the capabilities, and approves the hash of what it showed. When the package's code is other code by the time the person approves, nothing is approved, and the dialog shows the new code and says it changed. The code worker loads a package's code only when its own hash, of its text and declared capabilities, is the hash approved.
- **Read leniently, checked strictly.** The preferences file is read as ADR-0032 says: keys a later version adds to an approval are left out, and a list with any approval this build cannot read approves nothing. A change an app sends must have exactly these keys, a hash of 64 hexadecimal digits, a package id and capabilities that are capabilities.
- **What Claude learns of it.** Claude's endpoint answers which code the person approved for the code the project holds now, and for nothing else, so that Claude's tools run only approved code. Claude can never approve code.

## Considered options

- **The code as one string:** rejected. A one-line change would show in git as a change to the whole module.
- **The code in a file of its own beside the package, such as `gauges.js`:** rejected. The project's files are JSON its loader validates (CLAUDE.md), and a `.js` file in a repository is code that tools and editors run.
- **The hash of the code alone, with the capabilities approved apart:** rejected. ADR-0054 asks again when either changes, which one hash of both says plainly.
- **Approvals by package id:** rejected. Another project's package of the same id, or the same package changed, would be approved without the person reading it.

## Consequences

- The schema has `CodeLine` and `Capability`; the core has `codeHash`, `packageCodeOf`, the approvals' checks and `set-package-code`.
- Changing how the hash is made would ask everyone to approve every package again; changing the form of `code` needs a new schema version.
