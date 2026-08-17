# Sanzō Wada colour system

Always write the full name — **`Sanzō Wada`**, never shortened to "Wada".

| Path | What it is |
|---|---|
| `wada-combinations.json` | 159 base colours and all 348 combinations, each resolved to a Figma variable name. Source of truth; regenerable (see below). |
| `SPEC.md` | Plugin spec — architecture, role states, holder mechanism, verification record. |
| `plugin/` | The Figma plugin. `./build.sh` regenerates `src/data.js`, compiles `src/main.ts` (TypeScript — run `npm install` once for the toolchain), and concatenates them into `code.js`. **Edit `src/`, never `code.js`.** `ui.html` is loaded directly and needs no build. |

## Figma files

| File | Key | State |
|---|---|---|
| Sanzō Wada Palette Library | `sydXSa81k3sM3vXiQqTd7V` | Published |
| Sanzō Wada Sandbox | `6iUGKvIA0vDdoTokJBwb4j` | Consumer/test; library enabled |

## The two collections

- **`Sanzō Wada Base`** — 159 colour variables, English names grouped by hue family
  (`Red/Burnt Sienna`). Fixed historical values; these essentially never change.
  **Published.**
- **`Sanzō Wada Palette`** — `Slot/1–4` (aliases into the base collection), `Slot/Empty3`
  and `Slot/Empty4` (dark-grey holders for parked roles), `Role/*`, `Count`, `Source`.
  Working state. **`hiddenFromPublishing = true`, deliberately** — every consuming file gets
  its own local copy, and publishing it would both collide by name and force
  republish-and-accept on every slot change.

Consuming files get base colours *from the library* and slots/roles *locally*.

To use the library elsewhere it must be **enabled in that file via the UI**
(Assets → book icon → Teams). There is no Plugin API to enable a library, and
`figma.teamLibrary` only sees libraries enabled for the current file — **an empty result
means "not enabled here", never "not published".** Verify publication with
`search_design_system`, not `teamLibrary`.

## The invariant

**Designs bind to `Role/*`, never to `Sanzō Wada Base` directly.**

That indirection is the whole system: repointing an alias re-colours everything bound to it
at once. Binding a layer straight to a base colour looks identical on canvas and silently
drops it out of the system — it will render correctly once and then never follow another
palette change.

The chain is `Role/<Name>` → `Slot/N` → base colour. Roles are semantic and stable; slots
are the members of whichever combination is active. See `SPEC.md` for the three role states
and the park/restore rules.

## Applying a combination

**Use the plugin.** Figma desktop → Plugins → Development → Import plugin from manifest →
`plugin/manifest.json`. Run it in a file where the library is enabled.

`Source` (a string variable) names the active combination, e.g. `4-001`. The plugin writes it
on every apply, and the `Slot Demo` readout binds its `characters` to it. **Anything that
changes the slots must also update `Source`** — a stale provenance label is worse than none.

Doing it by hand is the fallback, not the intended path: look the id up in
`wada-combinations.json`, then in one `use_figma` call set each `Slot/N` to
`{ type: 'VARIABLE_ALIAS', id: <base variable id> }` for the matching `slots[N].variable`,
and set `Source` to `<id>`.

## Working with colour by hand

- **Shift-eyedropper, not plain eyedropper.** Select the **target** layer first → press `I`
  → hover the source swatch → **Shift**-click. Shift is held at the *click*, not with `I`;
  `Shift+I` is not a chord and does nothing. A click without Shift copies the raw hex and
  breaks reactivity with no visible symptom.
- **The eyedropper is page-scoped** — it samples only the current page. The boards live on
  `Components`, so to eyedrop while working on another page, place an **instance** of
  `Palette Board` on that page first. This is why the boards are components.
- **Selection colors edits bindings, not meaning.** Use it to move a subtree from one slot or
  role to another. Never use it to point a role at a base colour — that breaks the invariant.
- **`Count` drives the `Swatch` variant** via a bound variant property, so 2/3/4 is
  variable-controlled rather than hand-set.

## Regenerating the data

`wada-combinations.json` was built by extracting layer fills from the Figma community file
(`kxB0pwOwAIFpAUGXVjxWVC`) and matching each combination chip back to a base colour by
nearest max-channel distance.

Two facts to preserve if you rebuild it:

- The **English colour name lives in the `hex` text layer**, not `colour-name` (which holds
  the Japanese). Parse line 1 of the `hex` label.
- The **printed hex label disagrees with the actual fill** on a few entries (`Raw Sienna`
  reads `#bb7125`, fills `#bb7025`). The fill is authoritative — it is what the combinations
  are drawn against.

Matching result: 952/1032 chips exact, 80 within delta ≤4, **0 misses, 0 ambiguous**. Every
near-match beat its runner-up by ≥3, so nothing was snapped to a coin-flip neighbour.

After editing the JSON, run `plugin/build.sh` — it regenerates `plugin/src/data.js` and fails
loudly if any combination references a base colour that no longer exists.
