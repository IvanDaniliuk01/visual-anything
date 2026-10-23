---
status: accepted
---

# Two-tier components: declarative and programmable

A component is either declarative (appearance, attributes and connection points, creatable from the canvas without code) or programmable (extends a declarative one with its own code to draw itself or simulate). We chose this so anyone can create their own components without programming, without giving up the simulate interaction, which needs domain-specific code.

## Considered options

- **Code only**: rejected. Excludes people who want to build their own representations without programming.
- **No code only**: rejected. Makes simulation impossible, since every simulation is logic specific to its domain.
