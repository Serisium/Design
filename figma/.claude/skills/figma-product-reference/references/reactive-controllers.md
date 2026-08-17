# Driving a design reactively: the three controllers

> Read `../SKILL.md` first.
> Provenance legend: ✅ verified with source. ⚠️ believed but not re-verified.

## The hard constraint ✅

**A component instance on the canvas cannot change anything while you are editing.**
Instances do not execute; clicking one selects it. There is no native way to drive variable
modes or values from a component instance outside of prototype interactions or selecting
layers directly.

Source: [Modes for variables](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables),
[Use variables in prototypes](https://help.figma.com/hc/en-us/articles/14506587589399-Use-variables-in-prototypes)

So "build me a clickable swatch panel on the canvas that re-colours my design while I work"
is not achievable natively, on any plan. What *is* achievable is below.

## Design for this: make every piece of state a variable

Do not let components own state. Give the system variables — colours, counts, flags — and
have both the controls and the design **read** them. Then any of the three controllers
below can drive everything, and you can switch controllers later without rebuilding.

## The three controllers ✅

| | Where it works | Persists? | Ceiling | Build cost |
|---|---|---|---|---|
| **Variable modes** | Edit time, native | Yes | Modes-per-plan (see `variables-modes-and-limits.md`) | None |
| **Prototype `Set variable`** | Present mode only | **No** | Unlimited | Medium |
| **Plugin** | Edit time | Yes | Unlimited | High |

### 1. Variable modes

Select a frame → Appearance → **Apply variable mode**. Everything bound beneath re-resolves
immediately. Zero build cost; the ceiling is the plan's mode limit. The "control" is a
right-panel dropdown, not a canvas object — which some people dislike, but it is the only
free option.

### 2. Prototype interactions

The `Set variable` action assigns a variable a new value; `Set variable mode` switches the
active mode for the page. Both run **only in prototype/present mode**, and **changes do not
persist back to the file** — close the prototype and you are back where you started.

Good for: an interactive explorer you can share with someone.
Bad for: committing a decision, or anything you want to keep.

Source: [Prototype actions](https://help.figma.com/hc/en-us/articles/360040035874-Prototype-actions),
[Variable modes in prototypes](https://help.figma.com/hc/en-us/articles/15253268379799-Variable-modes-in-prototypes)

### 3. A plugin

The only option that is simultaneously edit-time, persistent, and uncapped. A plugin panel
is an iframe, so it gets real HTML drag-and-drop, search, and arbitrary UI — everything the
canvas cannot do.

Figma officially supports drag from the plugin UI onto the canvas via `figma.on('drop', …)`.
Caveat from practitioners: computing the canvas insertion point requires accounting for
whether Figma's sidebars and toolbars are visible, which is fiddly.

Source: [drag-and-drop from plugin UI](https://github.com/jackiecorn/figma-plugin-drag-and-drop)

**Design tip:** if the plugin's job is to change *variable values* rather than create nodes,
keep the interaction entirely inside the panel. Dragging a chip onto a well in the plugin's
own DOM is ordinary HTML drag-and-drop and avoids the canvas-coordinate problem completely.

## Choosing

- Need it now, few states, designing inside one file → **modes**.
- Need to hand someone an interactive thing → **prototype**, and warn that it does not save.
- Need many states, real direct manipulation, or persistence → **plugin**.

Modes and a plugin compose well: modes give an immediate working toggle with no build, and
the plugin can write into those same modes later. The variables are the shared substrate,
so this work is never wasted.
