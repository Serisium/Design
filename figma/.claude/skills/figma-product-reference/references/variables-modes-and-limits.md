# Variables, modes, and plan limits

> Read `../SKILL.md` first.
> Provenance legend: ✅ = verified against Figma docs or empirically, with source.
> ⚠️ = believed correct from experience but not re-verified. Treat ⚠️ as a hypothesis.

## Modes per collection, by plan ✅

Verified 2026-08-07 — [Modes for variables](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables)

| Plan | Modes per collection |
|---|---|
| Starter / Free | 1 |
| Professional | **10** |
| Organization | **20** |
| Enterprise | Higher; not stated precisely in current docs (older forum posts say 40) |

**The bundled `figma-use` and `figma-generate-library` references say Professional = 4 and
Organization = 40. Both are stale.** Limits were raised around Schema 2025.

This is almost always the binding constraint on "toggle between N themes/palettes"
architectures. Establish it *before* designing, not after.

### What to do when you need more modes than the plan allows

Modes are the only mechanism that natively re-resolves bound values from a dropdown. When
N exceeds the cap:

1. **Shortlist + loader.** Keep the cap's worth of modes as "currently under
   consideration"; use a plugin or `use_figma` script to swap other options in.
2. **Alias indirection.** Give the design a small collection of semantic slots
   (`Slot/1..n`) whose values are aliases into a large primitive collection. Repointing an
   alias updates every bound layer at once, with only one mode. This scales to any N.
3. **Do not** split across many collections hoping to sum the modes. A given layer binds to
   one collection; extra collections do not compose into more switchable states.

## Collections, variables, aliases ✅

- A variable belongs to exactly one collection. Collections own the mode list.
- A variable's value in a mode can be an **alias** to another variable:
  `{ type: 'VARIABLE_ALIAS', id: otherVar.id }`. This is how semantic tokens reference
  primitives, and how the slot pattern above works.
- Colour **variable values** use `{r,g,b,a}`; **paints** use `{r,g,b}` with opacity at the
  paint level. Mixing them up is a common bug.

## Publish visibility ✅

Verified empirically 2026-08-07 via the Plugin API.

- `hiddenFromPublishing` exists on **`Variable` and `VariableCollection` only**.
- It does **not** exist on `COMPONENT` or `COMPONENT_SET` — reading it throws
  `TypeError: no such property 'hiddenFromPublishing' on COMPONENT_SET node`.
- If a collection is hidden, its variables are hidden regardless of their own flag.

## Applying a mode ✅

Select a layer/frame → right sidebar **Appearance** → **Apply variable mode** → hover a
collection → pick a mode. Everything bound beneath that frame re-resolves. This is
edit-time and immediate.

Source: [Modes for variables](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables)

## Variables can drive variant properties ✅

A `STRING`/`NUMBER`/`BOOLEAN` variable can be bound to an instance's variant property, so
the variant is variable-controlled rather than hand-set:

```js
instance.setProperties({ Count: figma.variables.createVariableAlias(countVar) })
```

Verified empirically 2026-08-07 — the instance then reports:

```json
"Count": { "value": "4", "type": "VARIANT",
           "boundVariables": { "value": { "type": "VARIABLE_ALIAS", "id": "…" } } }
```

`setProperties` accepts `string | boolean | VariableAlias` (see `InstanceNode` in the
Plugin API typings). This lets you make *every* piece of component state a variable, so
the component reads state rather than owning it.

Scope note: no `scopes` value describes "drives a variant property". Leaving such a
variable at `ALL_SCOPES` works; narrowing it to a fill/text scope has not been tested and
may break the binding.

## Renaming and restructuring ⚠️

- Variables have stable internal IDs, so **renaming updates all bindings automatically**.
  Group structure is part of the name path, so regrouping is also just a rename.
- **Deleting** and recreating breaks bindings, and breaks consumers of a published library.
- Changing the *number* of semantic slots is the expensive decision, not the names.

Not re-verified against docs on 2026-08-07 — consistent with observed behaviour, but
confirm before relying on it for a destructive migration.
