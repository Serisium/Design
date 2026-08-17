# Sanzō Wada Palette — plugin spec

Status: **built; first live run 2026-08-17** — imports, initialises, and the panel renders
in Figma desktop. Individual UI flows are still unverified; see
[Verification](#verification) for exactly what is proven and what is not.

## Goal

Assign Sanzō Wada colour combinations to semantic roles in a Figma document, deliberately
and reversibly, without routing every change through an agent.

## Non-goals (v1)

- **Shuffle / randomise assignment.** Deliberate assignment is the point. *Try later.*
- **Per-role locks.** Only meaningful alongside shuffle. *Try later.*
- **Jump-to-id search.** Removed — the grid is only ever 108–120 cells and is browsed
  visually, not by id.
- **Publishing the plugin.** Private team plugins require Organization/Enterprise. This runs
  in development mode (Plugins → Development → Import from manifest), which is **not**
  plan-gated. Do not conflate this with Code Connect, which genuinely is unavailable.

## Architecture: three levels of aliasing

```
Role/Header  ──┐
Role/Button  ──┼──▶  Slot/1..4  ──▶  Sanzō Wada Base (159 colours, published)
Role/Surface ──┤      members of
Role/Text    ──┘   active combination
```

**Designs bind to `Role/*`. Slots are plumbing and are never edited by hand.**

| Operation | Writes | Note |
|---|---|---|
| Swap combination | N slot aliases | Constant cost regardless of role count |
| Reassign one role | 1 role alias | Combination untouched |

The two operations are fully orthogonal, and **the assignment lives in Figma as an alias** —
inspectable in the Variables panel, surviving without the plugin, travelling with the file.

### Collections

**One local collection, `Sanzō Wada Palette`:**

| Variable | Type | Purpose |
|---|---|---|
| `Slot/1` … `Slot/4` | COLOR | Members of the active combination (alias → Base) |
| `Slot/Empty3` | COLOR | Holder for a role orphaned from slot 3. Dark grey `#2B2B2B` |
| `Slot/Empty4` | COLOR | Holder for a role orphaned from slot 4. Dark grey `#2B2B2B` |
| `Role/<Name>` | COLOR | User-defined semantic roles |
| `Count` | STRING | `"2"` / `"3"` / `"4"` — also drives the `Swatch` variant |
| `Source` | STRING | Active combination id, e.g. `"4-017"` |

### What publishes, and what deliberately does not

| Collection | Publishes | Why |
|---|---|---|
| `Sanzō Wada Base` | **Yes** | 159 fixed historical colours. Stable, so republish cost is ~zero |
| `Sanzō Wada Palette` | **No** — `hiddenFromPublishing = true` | Working state, per-file |

1. **Name collision.** The plugin creates a *local* `Sanzō Wada Palette` in every consuming
   file. If the library also shipped one, each file would show two same-named collections —
   one local (the real working state) and one remote.
2. **Republish friction.** Slots change constantly during exploration, and anything published
   needs republish-and-accept in every consuming file to propagate.

Consuming files get base colours *from the library* and slots/roles *locally*.

*Try later:* splitting roles into their own collection so they can be published as a shared
contract. One collection for now.

## Role state — three states, no separate memory store

A role is in exactly one of three states, distinguished purely by its stored value:

| Stored value | State | Behaviour on count change |
|---|---|---|
| alias → `Slot/N` | **assigned** | parked if `N` > count |
| alias → `Slot/EmptyN` | **parked** | restored to `Slot/N` when count ≥ `N` |
| raw `#2B2B2B`, no alias | **unassigned**, no memory | ignored entirely |

**The alias carries the memory.** There is no `setSharedPluginData`, no side table.

Only two holders are needed: count is always 2, 3 or 4, so slots 1 and 2 can never be
orphaned.

**A newly created role is written as raw grey, never as a holder.** This matters — if new
roles were parked on `Slot/Empty3`, the first time the count reached 3 they would
"restore" to `Slot/3`, inventing an assignment the user never made. Creation is the only
writer of raw grey: there is **no unassign control**, deliberately — reassignment covers
every real case, and deleting the role is how memory is cleared.

### Rules

| Event | Effect |
|---|---|
| Count drops below 3 | every role aliasing `Slot/3` → `Slot/Empty3` |
| Count drops below 4 | every role aliasing `Slot/4` → `Slot/Empty4` |
| Count rises to ≥ 3 | every role aliasing `Slot/Empty3` → `Slot/3` |
| Count rises to ≥ 4 | every role aliasing `Slot/Empty4` → `Slot/4` |
| User assigns role → slot `S` | alias → `Slot/S`; any holder pointer is overwritten and lost |
| Combination changes, count unchanged | nothing — slots stay `1..N` |

Rules run on every count change **and** every combination apply.

### Why this is correct

Three intents, each asserted by the battery in [Verification](#verification):
**4 → 2 → 4 restores**; **a deliberate reassignment wins** (a pointer no longer on a
holder never restores); **partial restores are independent** (separate holder variables,
so one role can restore while another stays parked).

### Why a visible holder rather than a stale colour

Parked roles render dark grey rather than keeping their last colour. A stale colour is
indistinguishable from a chosen one, so the failure would be silent. Both holders share the
same grey — visually identical, structurally distinct. The difference exists for restore,
not for the eye; the UI labels which is which.

## UI

```
┌────────────────────────────────────────┐
│  Count   ( 2 )  ( 3 )  [ 4 ]   Active 4-017
├────────────────────────────────────────┤
│  Combinations                           │
│   ▓▓▓▓▓▓   ▓▓▓▓▓▓   ▓▓▓▓▓▓             │  3 across, ~133px cells
│    4-001    4-002    4-003              │  active ringed
│   ▓▓▓▓▓▓   ▓▓▓▓▓▓   ▓▓▓▓▓▓             │  click = apply (1 click)
├────────────────────────────────────────┤
│  Active members                         │
│    ①▓      ②▓      ③▓      ④▓          │
├────────────────────────────────────────┤
│  ROLES          [+ add role] [scan colors]
│   Header      ①  [②]  ③  ④   −         │
│   Surface    [①]  ②   ③  ④   −         │
│   Text        ⚠ parked @4     −         │
├────────────────────────────────────────┤
│  ★ 4-017  2-093  3-011                 │  one-click recall
└────────────────────────────────────────┘
```

`scan colors` swaps the combination grid for the unassigned-colour list, in place:

```
┌────────────────────────────────────────┐
│  Unassigned colours   (sel)(page)[doc] ×│
│  7 colours not on a Sanzō Wada variable │
│  · 3 pages · skipped 4 already on roles │
│  ⚠ 2 bound directly to base colours     │
│  ▓▓ [ Hero            ]        [+ role] │  swatch click = select on canvas
│     #123456 · 12 uses · ≈ Dark Tyrian   │
│     Blue Δ8 · Hero, Card · Cover        │
│  ▓▓ [ Burnt Sienna    ] slot 1 [+ role] │  exact match → adopting assigns it
│     #ae5224 · 3 uses · = Burnt Sienna   │
│  ▓▓ ✓ added as Surface                  │  stays listed: still unbound in the doc
└────────────────────────────────────────┘
```

### Display trims to the active count

At count 2 or 3, out-of-range slots are **not rendered at all** — not dimmed, not disabled.
This applies to both the **Active members** strip and every role's segmented control. A
count-2 combination shows two members at full width and two slot buttons per role.

### Indicators

| Marker | Meaning |
|---|---|
| `parked @N` | Role is on a holder; returns to slot `N` when the count reaches `N` |
| `on N!` | Role points at slot `N`, which exceeds the current count |

`on N!` should be unreachable — the count rules park anything out of range. It is reachable
only if the variables are edited by hand in the Variables panel. Because the buttons are
trimmed to the count, such a role would otherwise render with nothing highlighted and look
unassigned while actually pointing somewhere. Surfacing it prevents a silent lie.

### `+ add role`

Inline input (not `window.prompt`, which is unreliable inside the plugin iframe). Creates
`Role/<Name>`, unassigned. Names may not contain `/`.

### `scan colors`

Adopts an existing design into the system. Sits to the right of `+ add role`. Opens a
scrolling list of every colour in scope that is **not** already on a Sanzō Wada variable,
one click per row to turn it into a role.

While the list is open it **replaces the combination grid** rather than squeezing it — the
two are never both useful at once, and the roles list below stays visible so an adopted role
appears where you can immediately assign it. `×` returns to the grid.

**Scope** is a chip in the panel header — `sel` / `page` / `doc`, default `doc`:

| Chip | Roots |
|---|---|
| `sel` | current selection and its descendants; **falls back to the page** if nothing is selected, and the summary says so |
| `page` | current page |
| `doc` | every page in the file — `loadAllPagesAsync()` first, guarded by a `typeof` check so it also works on the non-dynamic-page manifest |

**Collection** follows Figma's own Selection colors: solid fill and stroke paints only,
skipping hidden paints, hidden *layers*, and image/video/gradient/pattern. Text with
per-character fills reports `figma.mixed`, so `TEXT` nodes fall through to
`getStyledTextSegments(['fills'])` — otherwise every multi-colour text layer in the file is
invisible to the scan.

**Deduplication** is by bound variable id when a paint has one, by hex otherwise.

**Classification** resolves each bound variable to its *collection*, cached per scan — a
document scan hits the same few ids thousands of times.

| Where the variable lives | Verdict |
|---|---|
| `Sanzō Wada Palette`, named `Role/*` | assigned — not a candidate |
| `Sanzō Wada Palette`, named `Slot/*` (incl. both holders) | assigned — not a candidate |
| `Sanzō Wada Palette`, any other name | **orphan** — a candidate, adopted by rename |
| `Sanzō Wada Base` | not a candidate, but counted and called out (see below) |
| anywhere else | a candidate, labelled with the variable it is bound to |

**Membership of the collection is not membership of the system.** Only those two name
shapes mean anything. A colour variable in the palette collection called `card_punchout` is
an *orphan*: bound to layers, sitting between the slots in the Variables panel, and
invisible to every other part of this plugin — `buildState` lists roles by the same prefix,
so it appears in neither the roles list nor the scan. Treating every non-`Role/` variable in
the collection as a slot is exactly the bug that made them vanish.

An orphan adopts by **rename** — `card_punchout` becomes `Role/card_punchout` — because
Figma preserves bindings across a rename. Every layer already using it joins the system in
that one step. It is the only case where adopting repairs the document rather than just
naming a colour, and it is why the orphan row reads `adopt ↻` instead of `+ role`.

Two consequences worth knowing:

- **A library orphan cannot be renamed from a consuming file.** The row is disabled and
  tagged `library`; the fix is to rename it in the library file and republish. Detected up
  front from `Variable.remote`, so the button never fails on click.
- **A renamed orphan keeps its raw colour** rather than being reset to the unassigned grey.
  It reads as unassigned (no alias, so `roleTarget` returns `slot: null`), but the design
  goes on looking the way it did until a slot is chosen. Resetting it to `#2B2B2B` on
  adoption would flip every one of those layers to dark grey for the sake of tidiness.

Bound straight into `Sanzō Wada Base` is not a candidate — it *is* on a Sanzō Wada variable,
which is what the list is about — but it is counted and called out in the summary as
breaking the invariant: it renders correctly once and then never follows another palette
change.

**Each row** is a swatch, an editable name field pre-filled with a suggestion, and
`+ role`.

- The **suggested name** comes from the first layer name that isn't generic
  (`Rectangle 4`, `Frame 12`, `Group`, …) and falls back to the nearest base colour's name.
  Roles are semantic; `Role/Rectangle 4` is worse than nothing. An orphan keeps its own
  name — its author already chose one — minus any group path, since role names cannot
  contain `/`. `Cards/card_header` → `Role/card_header`.
- **Exact matches auto-assign.** If the colour is *exactly* the base colour in an active
  slot, the row shows a `slot N` tag and adopting assigns the role there in the same step. A
  near match (Δ > 0) is displayed but never mapped — a suggestion is not a measurement.
- **Clicking the swatch** selects every layer using that colour, switching pages if needed.
  Where a colour is used is usually what tells you what to name it. Capped at 100 nodes, and
  the tooltip says so when it bites.
- **Name collisions never fail.** `Header` against an existing `Role/Header` becomes
  `Header 2`, and the toast reports the name actually created. A one-click list is no place
  for a modal error.

**Adopting a raw colour creates the role; it does not rebind the layers.** (An orphan is the
exception — see above.) The scanned colour is still a raw hex in the document, so the row
stays in the list, marked `✓ added as <name>`, rather than vanishing and implying work that
didn't happen. The marker is verified against live
state each render — delete the role and the row returns to its addable form. Rebinding is
still the eyedropper's or Selection colors' job (see `CLAUDE.md`).

The list is capped at 300 rows; the summary reports the total and how many are shown.

## Staleness — the plugin cannot be told about variable edits

**`documentchange` reports six types and none of them are variables** ✅ — `CREATE`,
`DELETE`, `PROPERTY_CHANGE`, `STYLE_CREATE`, `STYLE_DELETE`, `STYLE_PROPERTY_CHANGE`
([figma.on](https://developers.figma.com/docs/plugins/api/properties/figma-on/)). Styles are
covered; variables are not, and there is no `variablechange` event. Rename a role in the
Variables panel and the panel has no way to hear about it.

Nothing is cached, so this is purely a question of *when* to re-read — `buildState` rebuilds
from the file every time it runs. Two triggers:

- **`↻` in the top bar**, next to the active-combination label. Always available.
- **Window focus.** Editing a variable means leaving the panel and coming back, so regaining
  focus is the one reliable signal the file may have moved. Coalesced on a 400 ms guard —
  focus fires more than once per return trip — and silent, so it doesn't chatter in the
  status bar.

Focus does **not** re-run a scan: a document-scope scan is far too expensive to fire on
every click back into the panel. The scan has its own scope chips for that.

A rename that drops the `Role/` prefix doesn't just go stale, it changes *state* — the
variable becomes an orphan (see `scan colors`), vanishing from the roles list because that
list is the prefix filter. `scan colors` is where it resurfaces.

## Window placement — floating only

`ShowUIOptions` is the entire surface: `visible`, `title`, `width`, `height`,
`position {x,y}`, `themeColors`. There is **no dock, pane, or sidebar option**, and nothing
in the manifest registers a panel in Figma's left rail. Docking has been an open feature
request since 2021.

**Dev Mode does dock** — a Dev Mode plugin's iframe fills the whole Inspect panel and can be
pinned to the top of the sidebar. It is **incompatible with this plugin**: Dev Mode is
read-only, and "any method or operation in the plugin API that creates new nodes, deletes
existing nodes, or modifies an existing node isn't available." This plugin writes variable
aliases on every action. `editorType` is therefore `["figma"]` only — deliberately not
`"dev"`.

**`position` is deliberately left unset.** It defaults to the last position of the iframe,
so Figma remembers where the user dragged it. Setting it explicitly would override that
placement on every run.

## Presets

Roles are **per-file**. Presets are per-user, in `figma.clientStorage`:

- *Save current roles as preset* — captures role names only, not assignments
- *Apply preset* — creates missing roles, leaves existing ones alone

Favourites (up to 24 combination ids) also live in `clientStorage`.

**`clientStorage` needs a plugin id.** Without one, every access throws — so all access
goes through `storageGet`/`storageSet`, which fall back to defaults and report
non-persistence in a toast instead of failing: a storage failure must never take down
init. The manifest's slug id (`sanzo-wada-palette`) imports fine even though
Figma-assigned ids are numeric; whether `clientStorage` persists under it is unconfirmed —
if not, mint a numeric id via Plugins → Development → **New plugin…** and copy it in.

**The import picker silently ignores a non-manifest JSON** — selecting
`wada-combinations.json` instead of `plugin/manifest.json` produces no error and no
plugin.

## Base colour resolution

**Resolve by name, not id.** Ids differ between a local collection and an imported library
one — an imported variable's id is composite (`VariableID:<libraryKey>/<localRef>`).

Import **lazily**: a combination needs at most 4 of the 159.

### Two hard requirements for the library path

1. **`manifest.json` must declare the permission**, or every `teamLibrary` method throws:
   ```json
   { "permissions": ["teamlibrary"] }
   ```
2. **The user must enable the library in each file, via the Figma UI.** `teamLibrary` only
   sees libraries *enabled for the current file*, and there is no Plugin API to enable one.
   A file with nothing enabled returns `[]` — which reads exactly like "nothing published"
   and is not.

Bootstrap must distinguish three states and say which one it hit:

| State | Detection | Behaviour |
|---|---|---|
| Base collection is local | `getLocalVariablesAsync()` finds it | proceed |
| Library enabled | `getAvailableLibraryVariableCollectionsAsync()` returns it | proceed, import by key |
| Published but not enabled | both empty | Banner: **"Enable *Sanzō Wada Palette Library* in this file: Assets panel → book icon → Teams."** Never report this as missing or unpublished |

Also known: `teamLibrary` can return **stale** descriptors after a republish while the
Variables UI shows current data. If names don't match expectations, suspect staleness first.

## Bootstrap

On first run in a file: find or create the local `Sanzō Wada Palette` collection with
`Slot/1..4`, `Slot/Empty3`, `Slot/Empty4`, `Count`, `Source` and zero roles. The lookup
excludes remote collections (`!c.remote`) so a library collection of the same name can never
be mistaken for the local one. Then resolve base colours per the table above.

## Files

```
figma/color/
  SPEC.md
  wada-combinations.json        full 266KB dataset (source of truth)
  plugin/
    manifest.json               editorType figma, permissions teamlibrary, no network
    build.sh                    regenerate data + compile TS + concatenate → code.js + all static checks
    build-data.py               266KB → 36KB; fails if any combo references an unknown base
    package.json                dev toolchain: typescript + @figma/plugin-typings (npm install once)
    tsconfig.json               strict; ES2018; no DOM lib (main thread has no document)
    src/data.js                 GENERATED
    src/main.ts                 bootstrap, base resolution, holder rules, scan
    src/wada.d.ts               declares the WADA global that data.js defines
    ui.html                     panel (referenced directly; not part of the build)
    build/                      tsc output (gitignored)
    code.js                     GENERATED — never edit
```

Figma has no module loader without a bundler, so `code.js` is `src/data.js` + compiled
`build/main.js` concatenated. `src/main.ts` is global-scope TypeScript — no
`import`/`export`, which SES would reject (below) and which would force a bundler in.
Comments attached to type-only declarations are erased with them, so `code.js` is missing
some of the prose in `main.ts`; read the source, not the artefact. **Edit `src/`; the next
build overwrites `code.js`.** `ui.html` is loaded directly by the manifest and needs no
build step; its inline script is still plain JS.

**Figma's sandbox censors import-like expressions.** `code.js` is evaluated under SES
lockdown, which rejects the *entire file* (`SyntaxError: possible import expression
rejected around line 1`) if the word `import` is followed by optional whitespace and `(`
or a comment delimiter — even inside a comment or string, and **across newlines**. A
comment that ended in "…a development import" with the next line starting `//` was enough.
`build.sh` fails on the pattern; `node --check` cannot catch it because it is legal JS.
(`importVariableByKeyAsync` is safe — the censor requires the bare word.)

## Verification

API feasibility was probed against the live published library (`Sanzō Wada Sandbox`, no
local base collection, so the library import path was exercised) before building; every
durable fact from that pass lives in the design sections above. The holder state machine
was asserted end-to-end:

```
assign H=3               H = Slot/3
count 4→2                H = Slot/Empty3     parks
count 2→4                H = Slot/3          restores
assign H=1 while parked  H = Slot/1
count 2→4                H = Slot/1          does not resurrect 3
H=4, count→2             H = Slot/Empty4
count 2→3                H = Slot/Empty4     stays parked (4 > 3)
count 3→4                H = Slot/4          restores
```

A second role on `Slot/1` was untouched throughout.

**First live render: 2026-08-17** — the plugin imports (slug id accepted), initialises,
and the panel comes up in Figma desktop. The grid, segmented controls, add-role flow,
favourites and presets have not been individually exercised against the real app; whether
`clientStorage` persists under the slug id (favourite → restart → still there?) is the
open question.

`build.sh` runs on every build: the data integrity check, `tsc` (strict — the type check
is the build; there is no emit-despite-errors path), the SES censor scan,
`node --check code.js`, `new Function()` over the `ui.html` script block, and a
DOM-reference check that every `$('id')` resolves to an element — the last added after a
removed element left an orphaned handler that would have thrown at init and taken down the
whole UI. Syntax checking alone does not catch that class of bug.

The scan logic was exercised against **stubs** — a fake `figma` object over a two-page
document, a fake DOM for the `ui.html` script. Stubs prove the logic, not the API
contract: the cases they covered (hidden layers/paints, mixed text fills, cross-page
dedup, exact-match auto-assign, name collisions, orphan rename and its `remote` refusal,
the grid/list swap, the `✓ added` marker reverting) double as the checklist for verifying
the scan live.

## Perceptual lightness — tones

Status: **designed, not built.** Everything below extends the built system and is additive;
nothing in it is implemented.

### Why a numbered ladder

`Blue/800`-style numbering encodes **perceptual lightness decoupled from hue** — in
Material's HCT the number is literally CIE L\* (tone). The number buys three things:

- **Contrast becomes arithmetic.** Lightness distance predicts WCAG contrast regardless of
  hue (USWDS magic numbers: Δ40 grades → 3:1, Δ50 → 4.5:1, Δ70 → 7:1; Material guarantees
  3:1 at Δtone 40). A text-on-surface pairing is audited once for every hue family.
- **Cross-hue interchangeability.** Two roles at 600 carry the same weight whichever slots
  they follow; hover/pressed states become offsets.
- **Dark mode is approximately a reflection** of the ladder — see Try later.

The 159 base colours are unusually good seeds: they span L\* 5.7–100 (median 55), occupying
every rung from 50 to 950, with median OKLCH chroma ≈ 0.10 — ramps grown from them keep the
muted, ink-on-paper character. **Seeds, not rungs:** one base colour anchors one generated
ramp. Never string different base colours together as the rungs of a ramp — the historical
family grouping is not a hue axis (Cobalt Green lives in Blue; the Blue 500s are teal, the
800s navy).

### The ladder

Snapping targets in CIE L\* (tunable; roughly a Material/Tailwind midpoint):

| Rung | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L\* | 97 | 92 | 84 | 74 | 64 | 54 | 45 | 36 | 27 | 18 | 11 |

A colour's natural rung is the nearest target to its measured L\*. Generation must pass
through the seed **exactly** at its natural rung — Burnt Sienna's 600 *is* `#ae5224`, not a
regenerated approximation of it. (The `=seed` tag compares rung *numbers*, not hexes —
gamut clamping can make two adjacent rungs share a hex at the dark end.)

### Naming — three layers

| Layer | Where | Shape | Notes |
|---|---|---|---|
| Ramp data | plugin — `wada-tones.json` → `data.js` | seed × rung → hex | Generated at build time; not a Figma collection |
| Slot grid | `Sanzō Wada Palette`, local | `Slot/2` (seed, unchanged) · `Slot/2/600` | Seed aliases into Base; rungs hold raw computed values, rewritten on apply |
| Roles | `Sanzō Wada Palette`, local | `Role/Header` — semantic, tone-free | Tone lives in the alias, never the name |

- **Tones are plugin data, not a published collection.** A role's alias only needs
  `Slot/N/T` to *exist*; nothing requires that variable's value to be a library alias.
  Rung values are deterministic from seed + rung — not precious state — and publishing
  1,749 tone primitives would mostly mint 1,749 new ways to violate the invariant, while
  making every ramp retune cost a republish-and-accept in each consuming file. A rebuild
  and the next apply cost nothing. Consequences, accepted: rung values in a file reflect
  the plugin build that last applied there (files drift until re-applied), and
  hand-editing a rung variable silently diverges from the ramp — covered by the standing
  rule that slots are plumbing, never edited by hand.
- **The plugin does no colour math.** `wada-tones.json` is generated by the build — one
  implementation, reviewable diffs — and the plugin ships the hexes verbatim. On apply it
  also stamps each rung's resolved name (`Burnt Sienna 600`) into the variable's
  description, written in the same pass as the value so it can never go stale.
- **`Slot/N` still means the seed** — an alias into Base, so the hop with historical
  meaning stays inspectable — and every existing role alias keeps its meaning.
- **`Role/Header/600` is the mistake to avoid**: the number duplicates state the alias
  already carries, and a label that can disagree with the truth is worse than none. Two
  weights of one hue are two roles on the same slot at different tones — swap the
  combination and both follow with their weights intact.

### Follower vs pinned — two alias shapes

| Stored value | State | On combination apply |
|---|---|---|
| alias → `Slot/N` | **following the seed** | authentic printed colour; its rung jumps to wherever the new seed sits |
| alias → `Slot/N/T` | **pinned to tone T** | stable weight; a derived colour Sanzō Wada never printed |

When `T` equals the seed's current rung the two render identically and diverge on the next
apply — the same hazard class as a stale colour or a holder-invented assignment. The alias
shape stores the distinction; the UI must always display it.

### Role row

```
 Header    ① [②] ③ ④    ▁▂▃▄▅̲▆▇█     seed          no ring; underline only
 Accent    ①  ② [③] ④    ▁▂▃▄[▅̲]▆▇█   500 · =seed   ring on the underlined rung
 Muted     ①  ② [③] ④    ▁▂▃▄▅̲▆[▇]█   700           ring and underline apart
```

The tone strip renders the ladder in the assigned slot's current hue. The **underline marks
the true seed rung**; a ring marks a pinned tone; a follower has no ring. There is no
separate seed cell — the slot button already *is* the seed swatch.

| Gesture | From | Result |
|---|---|---|
| Click unselected slot ③ | any | move slot; tone state carried (follower stays follower, pinned 500 stays 500) |
| Click selected slot ② | pinned | → follower (`Slot/2/500` → `Slot/2`) |
| Click selected slot ② | following | no-op |
| Click a rung | any | pin there — the underlined rung included, which freezes the current weight |

Rung clicks only ever pin; the slot re-click is the only way back to following. Never label
the coincident-pinned state bare `500` — the `=seed` tag is where the difference shows.

### Holders generalise

`Slot/Empty3` parks followers; `Slot/Empty3/T` parks pinned roles (~24 holder variables in
all). The alias still carries the entire memory — now (slot, tone) — so the no-side-table
design survives, and every rule in the state machine has a tone-preserving analogue.
Indicators: `parked @3 (seed)` vs `parked @3 · 600`. The verified assertion battery must be
re-run with tones; this is the riskiest part of the extension.

### Costs and scan

- Apply writes 4 seed aliases + 44 rung values (with their descriptions) — still constant
  in role count. Lazy library import stays at most 4 of 159; tones never touch the
  library.
- `scan colors` nearest-match resolves against rungs (`≈ Vandar Poel's Blue 700 Δ4`), and an
  exact rung match can tag slot *and* tone. Exact-match auto-assign creates a **follower**,
  never a pin — the scanned design used the printed colour, and an inference is not a
  decision.

## Try later

- Let `scan colors` rebind the layers it adopts, not just create the role
- Compact mode via `figma.ui.resize()` — collapse the combination grid once a combination is
  chosen, leaving members and roles. Better fit for the real usage pattern: browse
  occasionally, adjust roles constantly
- Shuffle assignment, with per-role locks
- Roles in their own publishable collection
- Detecting roles automatically rather than via an explicit scan
- Contrast checking between roles — trivial once tones exist; Δtone predicts the band
- Promoting tones to a published collection, if they ever need to be usable outside the
  slot system — switch rung writes from values to aliases; roles never notice, because
  roles only ever point at `Slot/N/T`
- Light/dark modes on the palette collection remapping tones per role
  (`Role/Header` → `Slot/1/700` in light, `Slot/1/300` in dark) — well within the
  10-mode plan budget
