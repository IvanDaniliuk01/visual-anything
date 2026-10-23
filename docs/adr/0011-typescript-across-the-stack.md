---
status: accepted
supersedes: ADR-0006
---

# TypeScript across the whole stack

Everything is written in TypeScript: the core (model, changes and undo, layout, routing, spatial search), rendering, the React UI, the local server with the MCP server (Node, using the official MCP SDK), and programmable components and relation types. We chose this because the priority is to ship as simply and quickly as possible as a solo author working with Claude: one language, one toolchain, and no boundary to cross between the core and the UI.

## Considered options

- **Rust core compiled to WebAssembly with a TypeScript UI** (ADR-0006): superseded. Better raw performance and a chance to learn Rust, but two languages and a slower path to a first version.
- **Rust only for the layout engine**: rejected. Mixing languages for one module costs more than it saves.

## Consequences

The performance targets (10,000 elements rendering smoothly on the canvas, over 100,000 points on the GPU) have to be met with GPU rendering driven from TypeScript. If a measured hot spot cannot meet them, that piece can move to Rust and WebAssembly later.
