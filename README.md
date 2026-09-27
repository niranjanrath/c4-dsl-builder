# C4 DSL Builder

C4 DSL Builder is a local-first guided architecture modelling application that helps architects
capture software architecture information through structured questions and generates Structurizr
DSL without requiring the user to learn the DSL syntax.

It is **not** a diagramming tool — it does not render C4 views. The generated `.dsl` file is meant
to be opened with [Structurizr](https://structurizr.com) or the Structurizr CLI, which is
responsible for producing the actual diagrams.

## Stack

- HTML / CSS / vanilla JavaScript (ES modules) — no framework, no build step, no backend
- IndexedDB via [Dexie.js](https://dexie.org) (loaded from cdnjs) for local-first persistence

## Running it

No build step is required. Because the app uses ES modules (`type="module"`), it must be served
over `http://` rather than opened via `file://`. From this folder, run any static server, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project structure

```
c4-dsl-builder/
├── index.html          Shell page, loads Dexie + js/app.js
├── css/style.css        All styling
└── js/
    ├── app.js            Entry point / routing (dashboard ↔ wizard ↔ settings)
    ├── db.js             Dexie schema + save/load/list/delete
    ├── model.js          Architecture model shape + helpers (source of truth)
    ├── questions.js      Wizard copy: step titles + "what this means / example" help text
    ├── validation.js     Completeness/consistency checks → errors, warnings, info
    ├── dsl-generator.js  Model → Structurizr DSL text (the only file that knows DSL syntax)
    ├── dsl-importer.js   Structurizr DSL text → model (best-effort reverse of dsl-generator.js)
    └── ui.js             All DOM rendering: dashboard, wizard shell, settings, per-step editors
```

## Architecture

```
Guided Questions → Architecture Model → Validation → Structurizr DSL Generator → Download .dsl
```

The architecture model (see `model.js`) is the single source of truth. The wizard steps only ever
write into this model; `dsl-generator.js` only ever reads from it. The two are never coupled
directly, so the model can be persisted, re-validated, or re-exported independently of the wizard
that produced it.

## Wizard steps

1. Workspace — name, description, author, tags
2. People — actors who interact with the system
3. Software Systems — internal/external systems in scope
4. Relationships — how people and systems interact
5. Containers *(optional)* — decompose a system into containers
6. Container Relationships *(optional)*
7. Components *(optional)* — decompose a container into components
8. Component Relationships *(optional)*
9. Dynamic Scenarios *(optional)* — sequences of interactions
10. Deployment *(optional)* — environments, nodes, and instances
11. Views Configuration — which Structurizr views to generate
12. Validate & Generate — errors block download, warnings don't; copy or download the `.dsl`

Every question has an ⓘ help icon showing what the field means and a clearly labelled **Example**
answer, so users are never unsure what's expected or mistake the sample for their own data.

## Element colors (Settings)

The ☰ button in the wizard's top bar opens **Settings**, where you can set a default color per
element type (Person, Software System — Internal/External, Container, Component) and override the
color of any individual element. These are written into the generated DSL as Structurizr element
styles: type-level defaults use Structurizr's built-in `Person` / `Software System` / `External` /
`Container` / `Component` tags, and each individually-colored element gets its own generated tag
(e.g. `Style_orderApi`) with a matching style rule emitted after the defaults — later rules win per
Structurizr's tag-based styling, so per-element overrides always take priority.

## Importing an existing DSL

The **⭱ Import DSL** button on the project dashboard lets you start a new project from an existing
`.dsl` file (or pasted text) instead of building it up through the wizard. It's implemented in
`js/dsl-importer.js` as the reverse of the generator: people, software systems (internal/external),
containers, components, relationships, deployment environments/nodes/instances, view selections,
and element colors are all reconstructed into the same model the wizard edits, so an imported
project is fully editable afterward — round-tripping DSL exported by this tool reproduces it
byte-for-byte.

It's a best-effort importer, not a full Structurizr DSL parser: anything it doesn't recognize (or
can't unambiguously map onto the wizard's model — the full grammar supports things this tool
doesn't capture, like nested infrastructure nodes or implied relationships) is skipped with a
warning rather than guessed at, so a partial or hand-written file never corrupts the rest of the
import.

## A note on Structurizr DSL syntax

The DSL emitted by `dsl-generator.js` (workspace / model / person / softwareSystem / container /
component / relationships via `->` / deploymentEnvironment / deploymentNode / containerInstance /
views / systemLandscape / systemContext / container / component / dynamic / deployment / theme)
follows the general shape of the Structurizr DSL language. Before relying on it for a real
Structurizr CLI run, cross-check the generated output against the current official Structurizr DSL
documentation and language reference, since DSL syntax can evolve.

## Extending it

- Add a new field: extend the relevant array in `model.js`'s `createEmptyModel()`, add a form field
  in the matching `render*Step` function in `ui.js`, add help copy in `questions.js`, and (if it
  should appear in the DSL) handle it in `dsl-generator.js`.
- Add a new validation rule: add a check to `validation.js` — it only needs to read `model` and
  push onto `errors`, `warnings`, or `info`.
