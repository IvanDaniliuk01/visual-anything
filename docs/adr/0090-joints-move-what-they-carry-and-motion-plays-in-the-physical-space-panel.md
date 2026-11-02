---
status: accepted
---

<!-- Agreed by the user on 2026-11-02, after opening the robot-arm sample: "las rotaciones en 3d no la veo, es como que no puedo ver la física del prototipo". Of three scopes offered (kinematics and motion; plus collisions and reach; a full physics engine), the user chose kinematics and motion. -->

# Joints move what they carry, and motion plays in the physical-space panel

M9 draws a solid inside its shape and M10 places elements in physical space with poses, but nothing moves: each pose stands on its own, and the Physical AI package's joints carry a kind, limits and an axis that nothing reads. A robot arm shows where its links are, not how they move.

## Decision

- **A joint's position is data.** The built-in Joint (`physical-ai.joint`) gains a number attribute, `position`: an angle in degrees for a joint that turns, a distance in meters for one that slides, 0 by default. Its `kind`, `axis` and limits, which it already has, say how it moves. A position outside the limits is pointed out, as every limit only warns (CLAUDE.md), and drawn clamped.
- **Joints move what they carry: forward kinematics in the core.** The chain is read from the model: a joint joins the link it hangs from and the link it carries, through the package's relations, and the carried link is posed in the joint's frame (M10's `Pose.in`). The pose of anything a joint carries, at any depth, is the joint's pose, turned about its axis by its position, or slid along it, composed with its own. One pure module, `core/src/space/kinematics.ts`, works it out, so the panel, Claude and the exports agree; a cycle of joints is refused, as containment's are. Elements without joints are posed as they are now.
- **Motion comes from four places, and none of them but the last changes the project:**
  1. **By hand:** the physical-space panel shows a slider for each joint of what it shows, and dragging moves the chain live. "Keep these positions" stores them as one action of the person's.
  2. **Tours and scenarios:** a step may give joints positions, as it gives a camera; between steps they glide over the step's time (ADR 0084's glides), so a tour plays the arm picking a part.
  3. **Simulation:** a programmable component's `simulate` (ADR 0085) may answer joints' positions each tick, and the panel follows the run.
  4. **Claude:** reads the chain with `get_kinematics` and sets positions with a command, as the person does.
- **Playing it.** The panel draws the moving chain at the 60 frames per second target with 200 joints and the M10 triangle budget, working the poses out in its worker. Reduced motion jumps to each step's positions. Relations attached to a moving part follow it, as they follow parts while turning (M9).
- **What it is not:** no gravity, no masses, no contact and no collision. A physics engine and a reach envelope stay possible later, each with an ADR of its own; the user chose kinematics first.

## Considered

- **Positions only in poses, without joints:** rejected. Moving a shoulder would mean moving each link by hand, and limits could not be checked.
- **Animations stored in the solid (glTF animations):** kept as M9 has them, played when asked; they are a file's own clip, not the model's joints, and they cannot follow a scenario or a simulation.
- **A physics engine now (Rapier in WebAssembly):** left for later by the user's choice, as heavier work and heavier for the laptop.

## Clarifications

- 2026-11-02 (M15.0, the seam, in the main session):
  - **The chain.** An element's parent in the chain is what it is attached to, through `physical-ai.is-attached-to` or a relation type derived from it (the robot-arm sample's "is mounted on" is one), when that is in physical space; otherwise what it is posed or anchored in. The first attachment an element starts counts. An attachment that closes a cycle is not followed, and opening warns (`attachment-cycle`).
  - **The motion.** Each element's matrix is the product, from the top down, of the motions of the joints above it, each worked out where that joint stands at rest, applied to where the element is at rest: a joint turns what it carries, not its own body. A joint's axis is read in its own frame, which for a joint anchored to a part of a solid is the solid's axes (glTF's, +Y up); its pivot is its origin, which for an anchored part is the part's point. `revolute` and `prismatic` positions are drawn within the limits, `continuous` turns without end, `fixed` and a joint without a readable axis move nothing. A position past its limits is warned about on opening (`joint-out-of-limits`).
  - **Where it lives.** `core/src/space/kinematics.ts`; `spaceOf(project, view, root, positions)` takes positions over the joints' own, as sliders and tours give them; `Space.motions` holds each moved element's motion, which the panel applies to an anchored part's node of its holder's solid, since a solid's parts are flat in the files seen so far (the robot-arm sample's are). `poseIn` measures from where things are once moved.
  - **Tours** give positions in a step's view state, `space.joints`, by joint id. Scenario steps take none in the seam; M15.2 plays them through the tour's stage and simulation, and may add them to steps with a clarification here.
  - **The sample's axes** are written as a robot's description would write them, with +Z up, while its solid is +Y up: M15.3 writes them in the solid's axes.
