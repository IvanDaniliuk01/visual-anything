---
status: accepted
supersedes: ADR-0005
---

# Programmable code in TypeScript, run in an interpreter inside WebAssembly

The code of programmable components and programmable relation types is written in TypeScript or JavaScript and runs inside a JavaScript interpreter compiled to WebAssembly, itself inside a Web Worker. It has no access to the network, files or the page except the capabilities the app grants, which its package must declare and the user must approve. The code computes and returns what to draw; the app draws it. Execution is cut off if it exceeds memory or time limits. We chose this because packages are shared in an open-source project and their code is not trusted, and an interpreter inside WebAssembly isolates that code from the browser's own JavaScript environment while letting authors write the same language as the rest of the project.

This decision is complemented by: declarative components are data only and their drawing is stripped of scripts and external references; project files never run code and are validated against the schema when opened; code Claude writes through MCP goes through the same sandbox and needs the user's approval before it is activated.

## Considered options

- **Rust compiled to WebAssembly** (ADR-0005): superseded. Strong isolation, but authors would need Rust and a second toolchain.
- **Plain JavaScript in a Web Worker**: rejected. A Worker still has network access and the full browser runtime, which is hard to restrict reliably.
- **Code in the same page, or one sandboxed iframe per element**: rejected for the reasons recorded in ADR-0005.

## Consequences

Interpreted code runs slower than native JavaScript; heavy simulations may later need a faster path for code the user explicitly trusts.
