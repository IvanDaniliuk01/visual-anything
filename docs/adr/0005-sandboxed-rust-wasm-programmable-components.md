---
status: superseded by ADR-0012
---

# Programmable components in Rust compiled to WebAssembly, sandboxed by capabilities

Programmable component code is written in Rust, compiled to WebAssembly and run in a Web Worker, with no access to the network, files or the page except the capabilities the app grants, which its package must declare and the user must approve. The component computes and returns what to draw; the app draws it. Execution is cut off if it exceeds memory or time limits. We chose this because packages are shared in an open-source project and their code is not trusted, and because WebAssembly is isolated by default and fits a Rust core.

This decision is complemented by: declarative components are data only and their drawing is stripped of scripts and external references; project files never run code and are validated against the schema when opened; code Claude writes through MCP goes through the same sandbox and needs the user's approval before it is activated.

## Considered options

- **Code in the same page, unsandboxed**: rejected. A malicious package would have access to everything.
- **Sandboxed iframe running JavaScript**: rejected. One sandbox per element is not viable with thousands of elements, and isolation is weaker than WebAssembly's.
- **Also accepting JavaScript/TypeScript**: rejected for now, to avoid a second execution path; authors who do not know Rust use declarative components.

## Consequences

Writing a programmable component requires knowing Rust. The declarative tier is the entry point for people who do not program.
