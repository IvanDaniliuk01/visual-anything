---
status: accepted
---

<!-- From GitHub issue #17, what Claude met while modeling a real project with 0.1.2. Decided by a task builder, as the user delegated. -->

# A component can have open attributes, and write answers name undefined attributes once

Claude modeled a component whose elements carry attributes it does not define on purpose: `cowork.fila`, cards that stand for the rows of a table, each holding its columns. Every `add_to_model` and `run_commands` on them answered with every element's list of those attributes (M3d, "Fixes from use"), some answers about 3,000 tokens, a dozen times in one session, repeating what Claude already knew and could do nothing about.

## Decision

- **A component may declare open attributes:** `openAttributes: true` in its definition says its elements may carry attributes it does not define, on purpose. Those attributes are then the elements' ordinary data, not particularities (CONTEXT.md): Claude's answers never name them as undefined, `get_item` says `openAttributes: true` instead, and the inspector does not mark them as particularities, noting that the component takes them. A value that differs from a default the component gives is still a particularity.
- **It is inherited** like `nests` on a relation type: the nearest component of the chain that sets it decides, `false` on a derived component closes it again, and Essence has none. `define-component` takes it, `update-component` sets it with `true` or `false` and inherits it again with `null`; anything else is refused. The component editor shows it as a checkbox, "Its elements may carry attributes it does not define", with where it comes from and the way back to the inherited value. `list_definitions` shows it on the components that have it.
- **A write's answer names undefined attributes once per component:** `undefinedAttributes` holds, for each component, how many of the elements the write touched carry them and their names, each once, at most 20 with a count of the rest (at most 20 components, the rest counted), never per element and never their values. It names only the attributes this write set: all of them on an element it created or gave another component, else those whose value is new or changed; those an element already carried, unchanged, are left out. `get_item` still names every one an element carries. The shared note is shorter and says how to declare open attributes.

For 20 elements with 10 such attributes each, the answer of `add_to_model` went from about 4,300 characters to about 900; changing one of them on all 20 from about 4,100 to about 630; with open attributes, the answers say nothing about them (about 250 and 60).

**What an answer names is worked out from two reads of the project**, one before the write and one after; another write between them, by the person or another of Claude's calls, can make it name an attribute this write did not set or leave one out. It only says more or less than it should, and the elements' attributes are always as written.

## Considered options

- **Dropping the list from write answers altogether:** rejected. An attribute set by mistake, such as a misspelled name, is still worth hearing about once, at the write that set it.
- **A list of attribute names a component takes without defining them:** rejected for now. The rows of a table have whatever columns the table has; a list would have to be kept in step with every element. A component that wants its attributes described still defines them.
- **Open attributes on relation types too:** left for when a model needs it; nothing names a relation's undefined attributes today.
