---
status: superseded by ADR-0011
---

# Rust core compiled to WebAssembly; React and TypeScript UI

The core (model, changes and undo, layout, routing, spatial search, programmable component host and GPU rendering) is written in Rust and runs in the browser as WebAssembly. Panels, menus and text editing are built with React and TypeScript. We chose this for performance (10,000 elements rendering smoothly on the canvas and over 100,000 points on the GPU), because it fits the WebAssembly component sandbox, and because the author wants to learn Rust; the UI stays on web technology because text input, accessibility and panels are already solved in the browser, and React offers the largest ecosystem of ready-made UI components.

## Considered options

- **All Rust, including the UI** (Leptos, Dioxus, egui): rejected. Text editing, accessibility and panels are much more expensive to get right.
- **Rust only for the heavy parts**: rejected. Leaves the model in TypeScript and forces crossing the language boundary on every edit.
- **All TypeScript**: rejected. Does not reach the required performance and does not meet the goal of learning Rust.
- **Svelte instead of React**: considered as the simpler option; React was preferred for its ecosystem.
