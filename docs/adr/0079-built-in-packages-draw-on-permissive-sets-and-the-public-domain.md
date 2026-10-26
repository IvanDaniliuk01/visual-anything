---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Built-in packages draw on permissive picture sets and the public domain

The user asked for more visual packages, beyond Systems, C4, Data modeling and Data science pipelines. The research on visual packages read the terms of some forty sources of pictures on their own sites. Two lines of earlier decisions stood in the way. ADR 0047 left out "icon sets whose terms differ from their code's", which, read to the letter, excludes sets such as Health Icons (pictures CC0, code MIT) and EBI's anatomograms (pictures CC-BY-4.0, code Apache-2.0). ADR 0051 rejected pictures from outside sets "for now". Its list of licenses also had no way to say public domain, although Gray's anatomical plates and Natural Earth are in it. This clarifies ADR 0047 and supersedes that line of ADR 0051.

## Decision

### What may ship

- **ADR 0047's list gains the public domain:** `CC-PDM-1.0`, the Public Domain Mark, and `LicenseRef-public-domain`, for a work its author dedicated to the public domain without a standard text. An image under either names in its `source` where the work was marked or dedicated.
- **A set ships under its pictures' terms.** ADR 0047's line on "icon sets whose terms differ from their code's" means sets whose terms *for the pictures* are not on the list. A set whose code is under one allowed license and whose pictures are under another allowed one ships under its pictures' license.
- **Built-in packages may draw pictures from outside sets** whose pictures' terms are on the list. This supersedes ADR 0051's "rejected for now". The sets the research checked and allows:
  - Tabler (MIT) and Lucide (ISC), whose style matches our own icons; IBM Carbon (Apache-2.0); Material Symbols (Apache-2.0); the Kubernetes community icons (Apache-2.0), in their unlabelled variant;
  - Health Icons (CC0-1.0); Bioicons, item by item, only where the item is CC0-1.0, CC-BY-4.0 or MIT;
  - EBI's anatomograms, SciDraw and Reactome's icons (CC-BY-4.0);
  - Gray's plates and other public-domain works (CC-PDM-1.0 or `LicenseRef-public-domain`).
- **Never shipped:** brand logos, whatever their license (Simple Icons, Carbon's `logo--*`); the AWS, Azure, Google Cloud and Cisco icons, CNCF artwork, ROS artwork and Docker's and HashiCorp's marks, whose terms restrict reuse or changes; anything non-commercial, no-derivatives or share-alike (the Allen Brain Atlas, KiCad's libraries, OpenMoji); CC-BY-3.0, until a package needs it. A person may still import any of these into their own project.

### How credit travels

- **Notices.** The program ships `THIRD-PARTY-NOTICES.md` with the license texts of the MIT, ISC and Apache-2.0 sets its built-in packages use. A test checks that every set a built-in image names is in it.
- **Each image's credit.** An image under CC-BY-4.0 names its author and address in its `source`. Exports write, besides each package's attribution (ADR 0047), the `source` of each CC-BY-4.0 image they draw, once each. A package's attribution lists its sets and the words "adapted: cleaned, simplified, ids renamed" where they apply.

### How an outside picture comes in

- At authoring time, never at run time: chosen (at most 128 images a package), recolored to the component's stroke or shown as a silhouette with `tint`, simplified below the cleaner's caps (ADR 0027: 64 KiB of output), its named parts' ids renamed to stable English ids (EBI's UBERON ids are kept, as external identifiers, ADR 0056), cleaned with `cleanSvg` and stored as the cleaner gives it. The caps do not change for large atlases: they are simplified, or split into several drawings.

### Names, and marks

- A package is named for what it describes, not for a mark: **Processes and state machines**, described as "in the style of BPMN"; **Container orchestration (Kubernetes)**, naming Kubernetes only to say what it is for. ArchiMate stays out while its terms for open-source tools are unclear.

### The packages, in order

- **Reserved ids** gain `machine-learning`, `process`, `networks`, `kubernetes`, `control-and-circuits` and `anatomy`, beside `neuroscience` and `physical-ai`.
- **First:** Machine learning (its `machine-learning.model` derives from `data-science.model`), Physical AI and robotics, and Processes and state machines. They use our own CC0 drawings, CC0 Bioicons and Tabler, and are the first built-in packages with free geometry and drawings with parts: a Transformer block, a six-axis arm and a mobile robot.
- **Then:** Neuroscience, with EBI's brain simplified, SciDraw and Gray's plates; then Networks and cloud with Carbon, and Container orchestration with the Kubernetes icons; then Control and circuits.
- **Anatomy stays with M13**, which also imports ontologies. A world map waits: disputed borders need their own decision.

## Considered options

- **Keeping every built-in picture our own CC0 drawing:** rejected as the only way. It keeps exports free of credits, but it is too slow for neuroscience or networks, and the sets above ask little.
- **Reading ADR 0047's line to the letter:** rejected. It would exclude the CC0 and CC-BY sets it meant to allow.
- **Raising the cleaner's caps for atlases:** rejected. Every picture is drawn by every reader; simplifying once, at authoring time, keeps them all fast.
- **Provider icons under their own terms:** rejected; their terms forbid changing them or using them outside diagrams of their services.

## Consequences

- `SHIPPABLE_LICENSES` gains `CC-PDM-1.0` and `LicenseRef-public-domain`, and `RESERVED_PACKAGE_IDS` the new ids.
- `THIRD-PARTY-NOTICES.md` and its test, and the per-image credits in exports, come with the first package that uses an outside set under MIT, ISC, Apache-2.0 or CC-BY-4.0.
- The spec plans Track P, the visual packages, in the order above.
- ADR 0047 and ADR 0051 each gain a note pointing here.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (P1, W63): **the Physical AI and robotics package** (`physical-ai`, `core/src/builtin/physical-ai.ts`).
  - **Its pictures are all drawn for Visual Anything, under CC0-1.0**: an icon for every component but Link, and the two drawings with parts. It uses no outside set, so it adds nothing to `THIRD-PARTY-NOTICES.md`, which still waits for the first package that does.
  - **What nests.** "is part of" places anything in a robot, its `to` limited to Robot. "runs on" places a node on a compute unit and nests too, as C4's "runs in" does. "is attached to", the kinematic chain, does not.
  - **Limits, which only warn.**
    - "is attached to" limits only its `to`, to links and joints, so that a sensor or a gripper mounts on a link.
    - "commands" runs from a controller to an actuator or to another controller, since a policy gives a joint controller its targets.
    - "senses" limits only its `from`, to sensors, since what it measures can be anything around the robot.
    - "drives" runs from an actuator to a joint; "publishes to" and "subscribes to" from a node to a topic; "runs on" from a node to a compute unit.
  - **Attributes.** Those the spec names, and two more: Compute unit's `hardware` and Node's `middleware`, the one place "ROS 2" appears, as an example value. A joint's `lowerLimit` and `upperLimit` are in degrees for a joint that turns and in metres for one that slides, so they have no unit of their own. Rates are in Hz, mass in kg, length in m and torque in N·m.
  - **Colors.** The kinds of sensor and actuator set only their icon and take their parent's colors. Policy sets its own, so that the learned side reads apart from the controllers.
  - **The drawings.**
    - The six-axis arm is seen from the side. Its parts are in the order of the chain (`base`, `joint-1`, `link-1`, … `joint-6`, `link-6`, `gripper`), so that the keyboard and the outline follow the chain. A joint that turns about an axis across the page shows its axis as a hole; the roll joints are collars.
    - The mobile robot is seen from above, its front to the right and its left wheel at the top, its sensors set in wells cut into the chassis.
    - In both, parts lie 6 units apart, so that the background shows between them in both themes. Each is filled in one mid tone that reads at 3:1 or more on a robot's fill in both themes: links in the links' blue, joints in the joints' amber.
  - **No component shows a drawing.** A robot element shows one from its own appearance, placed with `parts`. Its links, joints and sensors name their part without `image`, so that the part is found in the drawing they sit in.
  - **Names.** "Link" names a component, as C4's "Deployment node" does: the glossary's words to avoid are about the model's own terms. In Spanish, Node is "Nodo de software", as C4's is "Nodo de despliegue", and the catalog's test allows both.
  - **The sample** is `examples/robot-arm`, "Pick-and-place arm": an arm drawn with its parts, its kinematic chain and its software, in three views, with the scenario "Reach and grasp" in the arm's view.
    - The arm's view leaves "is attached to" out (ADR 0064), since the chain's lines would cover the drawing; the "Kinematic chain" view shows it.
    - Layout on this branch lays a drawing's anchored parts out as boxes, so the arm's view is placed by hand: its other contents in a row below its picture, and no position for its anchored parts. The other two views are as layout lays them out.
  - **The command line** lists three samples or more as English does: "a, b and c".
