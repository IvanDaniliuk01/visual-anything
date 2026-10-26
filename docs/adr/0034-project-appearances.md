---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# A project gives the definitions it cannot change an appearance of its own

A project can change how it draws a component or a relation type that it uses but cannot change: one of a built-in package, Essence or "relates to". It keeps such a **project appearance** in its `.vaproject` file, under `appearances.components` or `appearances.relationTypes`, keyed by the definition's id; an entry sets only the traits it lists, in the same form as a definition's appearance, and is read by own key only. When an appearance is worked out, each trait comes from the element's or relation's own appearance first; then from the nearest definition in the derivation chain that sets it, a built-in definition counting with its project appearance over its own traits, each part of the detail on its own; then from Essence or "relates to", with theirs. A project appearance therefore reaches everything that derives from the definition without setting the trait itself, and nothing that sets it. The core says where every trait comes from: the element's or relation's own appearance, or a definition, through the definition itself or through its project appearance, and whether that definition is built in; a built-in color takes its dark shade (ADR-0033) only while it comes through the definition itself.

The commands `set-component-appearance` and `set-relation-type-appearance` change one definition's appearance at the level the project can change, so that each trait is set in one place: the project appearance for a definition the project cannot change, in one change to the project file; the definition itself, in its package file, for one of the project's own, where an entry the project file kept for it goes in the same action. Each takes either a whole `appearance`, where `null` removes it and `{}` is none, or `appearanceTraits`, changed trait by trait as ADR-0022 changes definitions, so that the app and Claude do not undo each other's changes. An appearance already stored records nothing. An entry for one of the project's own definitions, or for a definition no package in use defines, has no effect and is reported as an `appearance-not-used` warning in the project file when the project opens; `null` for such an id forgets the entry. When the project stops using a package, the entries for its definitions go in the same action. This sits beside ADR-0018: no package is copied, replaced or redefined, and no id is reused.

We chose this because most of a project's elements come from built-in components, because recoloring elements one by one does not reach the ones created later, and because deriving a component of one's own changes the model only to change a color.

## Considered options

- **Particularities only**: rejected. New elements do not follow, and the model file fills with the same colors.
- **Deriving a project component, such as `clinic.service` from `systems.service`, and moving every element to it**: rejected as the way to recolor. It changes elements' components, shows both in the component palette, and cannot re-derive the built-in components that derive from the original.
- **Colors per view**: rejected for this. They would be repeated in every view; coloring by attribute belongs to a later perspective.
- **Colors per person**: rejected. Collaborators and Claude would see other colors than the person.
- **Editing a built-in package in place, or a project package with a built-in id**: rejected by ADR-0018.
- **Only a whole appearance in the commands, as first designed**: rejected. A copy the app holds would undo a trait Claude just set; trait-by-trait changes are kept beside it, as ADR-0022 does for definitions.

## Consequences

Older Visual Anything programs refuse a project file with `appearances`, because the schema accepts no unknown keys; format version 1 stays additive in one direction only. Empty maps are refused on open, as empty stacking orders are, and commands never write them. "Improving a built-in package improves every project" (ADR-0018) now holds for every trait a project does not set. Elements and relations with their own trait, and built-in definitions that set the trait themselves, such as AI agent's fill under Service, do not follow; the inspector says so. Everything that draws, checks or changes a project works its definitions out with `definitionsIn(project)`, which applies the project appearances; `definitionsOf(packages)` alone means the packages as they define themselves, for reset values.

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

- 2026-10-25 (W42): Claude reaches both commands through one tool, `set_appearance`, which names either a component or a relation type and takes `appearance` or `appearanceTraits` as the commands do. Its answer says where the appearance is kept, by the core's `editableAppearanceOf`: the project file for a definition the project cannot change, or the definition's own package, with the appearance kept there after the change. `update_component` no longer tells Claude to recolor a built-in component's elements one by one.
