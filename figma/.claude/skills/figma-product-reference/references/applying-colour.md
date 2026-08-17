# Applying colour, and what preserves a variable binding

> Read `../SKILL.md` first.
> Provenance legend: ✅ verified with source. ⚠️ believed but not re-verified.

The central question for any token system: **which gestures keep a layer bound to a
variable, and which silently replace it with a raw hex?** A gesture that hardcodes the
colour looks identical on canvas and breaks reactivity invisibly.

## Eyedropper ✅

Verified 2026-08-07 —
[Sample colors with the eyedropper tool](https://help.figma.com/hc/en-us/articles/27643269375767-Sample-colors-with-the-eyedropper-tool),
[Apply variables to designs](https://help.figma.com/hc/en-us/articles/15343107263511-Apply-variables-to-designs)

**Exact sequence — order matters:**

1. Select the **target** layer first
2. Press `I` (or `⌃C` on macOS) to toggle the eyedropper
3. Hover the source layer to preview
4. Click — or **Shift**-click

| Gesture | Result |
|---|---|
| click | Applies the sampled **raw colour**. Any variable/style binding is lost. |
| **Shift**-click | Applies the **variable or style** carried by the sampled pixel. Binding preserved. |
| `⌘⇧` / `⌃⇧` then Enter or click | Opens the create-variable/style modal |

**Shift is held at the click step, not with `I`.** `Shift+I` is not a chord and does
nothing — a very easy misreading of shorthand like "`I` + Shift-click". Write the sequence
out when explaining it.

## The eyedropper is page-scoped ✅

> "Sample and apply colors from any layer or background of **the current page**"

It cannot reach another page. A palette board on a `Components` page is unreachable while
you work on a different page — the gesture will appear broken with no error.

**Fix:** make the board a **component** and place an instance on whatever page you're
working on. This is a concrete reason to componentise reference boards rather than leaving
them as frames.

Platform note: the macOS desktop app (126.2.10+) can sample anywhere on screen with Screen
Recording permission. Windows desktop and browser cannot sample outside the canvas.

Shift-eyedropper is the important one. It turns any on-canvas board of variable-bound
swatches into a working control surface: point at a swatch, Shift-click a layer, and the
layer is now bound — not merely coloured.

Corollary: for this to work the *source* pixel must itself carry a variable. A palette
board built with hardcoded fills gives you nothing to transfer.

## Drag and drop ✅

**Not supported.** Dragging a variable from the Variables panel, or a style from the Design
panel, onto a layer to apply it is an open feature request, not shipped behaviour.

Source: [Drag and drop variables and styles to apply fill and stroke color](https://forum.figma.com/suggest-a-feature-11/drag-and-drop-variables-and-styles-to-apply-fill-and-stroke-color-31459)

If a workflow genuinely needs drag-and-drop, it has to be a plugin — see
`reactive-controllers.md`.

## Selection colors ✅

Verified 2026-08-07 —
[View and adjust colors in a mixed selection](https://help.figma.com/hc/en-us/articles/360042553434-View-and-adjust-colors-in-a-mixed-selection)

**Scope: the current selection and all its descendants.** Not the page, not the file.

- Appears when the selection contains objects with mixed fills.
- Includes solid colours and gradients on **layer fills and stroke fills**.
- Excludes pattern, image and video fills, hidden fills, and masks.
- Groups by variable / style / raw fill, deduplicated — each fill listed once.
- Ordering follows traversal order, not alphabetical or numeric. Read no meaning into it.
- **Boolean groups:** only colours on the combined group appear; child-layer colours do not.

### The footgun

Selection colors edits **which variable the layers point at**. It does *not* edit what a
variable means. Those are different operations that look identical when you start them:

| | Selection colors | Repointing a variable's value/alias |
|---|---|---|
| Scope | Selected subtree only | Whole file, plus consumers once published |
| Changes | Which variable each layer binds to | What the variable resolves to |
| Use for | "This card should use Slot/3, not Slot/2" | "Slot/2 is now Cerulean Blue" |

In a semantic-slot system, using Selection colors to swap a slot for a **primitive** colour
drops those layers out of the system entirely. It renders correctly once, then never
follows another palette change. Keep Selection colors pointed at other semantic tokens.

## Other transfer gestures ⚠️

- **Copy/paste properties** (`⌘⌥C` / `⌘⌥V`) transfers fill among other properties. Whether
  it preserves variable bindings was not verified — test before relying on it.
- **Instance swap** by dragging from the Assets panel onto an instance exists, but applies
  to instances, not to fills.
