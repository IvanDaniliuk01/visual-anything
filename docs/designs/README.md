# Designs

The detailed designs behind milestones and tracks, written before their code. The spec says what each milestone delivers and the ADRs record the decisions; these files hold the detail a milestone's plan builds from: exact texts, rules, interfaces, costs and tests.

- `stacking-and-nesting.md`: stacking order per view, and putting shapes inside containers from the canvas (M2, ADR 0021).
- `look-and-feel.md`: Track A, themes, colors, the grid, rulers and snapping, and polish. Its ADR numbers were drafts: they take the next free numbers when Track A starts.
- `components.md`: tables (M3), component configuration (M3), images and SVG (M3b), and package code (M7). Its ADR numbers were drafts too.

Each was checked against the branch it names at the time it was written, and paths are relative to that worktree. When a milestone starts, its plan checks the design against the code as it stands and follows the code where they differ.
