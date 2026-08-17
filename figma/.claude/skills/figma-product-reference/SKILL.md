---
name: figma-product-reference
description: "Answers questions about how the Figma PRODUCT behaves — plan limits, variable modes, publishing and libraries, applying colour (eyedropper, Selection colors), and what can change a design reactively at edit time vs prototype time. Use when the question is 'what does Figma do / allow / cost' rather than 'how do I script it'. Do NOT use for Plugin API scripting — that is figma-use. Do NOT use for design-to-code — that is figma-design-to-code."
compatibility: Complements the figma-use and figma-generate-library skills; overrides their stale plan-limit claims.
metadata:
  mcp-server: figma
  verified: 2026-08-07
---

# Figma product reference

Figma's **product and UI** behaviour — the things that constrain what you can build
before you write a line of Plugin API code.

## What already exists — check these first

The installed Figma skills (`figma-use`, `figma-generate-library`, …) document the
**Plugin API**.

The Figma MCP server also serves ~24 `file://figma/docs/*` resources, and a good chunk of
them are **official agent guidance** — read them rather than re-deriving:

| Resource | Why you'd read it |
|---|---|
| `add-custom-rules` | Figma's recommended `CLAUDE.md` rules, incl. a ready-made "Figma MCP Integration Rules" block and a meta-prompt to generate your own |
| `structure-figma-file` | Seven rules for making a file legible to agents (components, Code Connect, variables, semantic names, Auto Layout, annotations, dev resources) |
| `mcp-vs-agent` | Division of labour — the server supplies context, the agent writes the code. Sets expectations |
| `write-effective-prompts`, `tools-and-prompts`, `trigger-specific-tools` | Prompting and tool selection |
| `avoid-large-frames`, `variables-vs-code`, `code-to-canvas`, `write-to-canvas` | Task-specific practice |
| `create-skills` | Authoring skills for the Figma MCP server |
| `rate-limits-access` | Tool-call limits by plan and seat |

List them with `ListMcpResourcesTool`, read with `ReadMcpResourceTool`.

**What none of them cover is Figma's product and UI behaviour** — plan gates, mode limits,
what the eyedropper does, the scope of Selection colors, publishing constraints. They are
also uniformly oriented design→code. That gap is this skill's job.

## When to use

- A plan/tier limit is about to shape an architecture ("how many modes can I have?")
- The user asks what a UI affordance actually does or how far it reaches
  ("what's the scope of Selection colors?", "does the eyedropper keep my variable?")
- Something needs to update reactively and you must pick the mechanism
- Publishing, libraries, or update propagation are involved
- You are about to answer a Figma product question **from memory** — read the relevant
  reference first instead

## When NOT to use

- Writing Plugin API scripts → `figma-use`
- Building a design system in Figma → `figma-generate-library`
- Implementing a Figma design as code → `figma-design-to-code`
- MCP setup, auth, or troubleshooting → the server's `file://figma/docs/*` resources

## ⚠️ Known-stale claims in the bundled skills

Verified 2026-08-07. **Prefer these numbers over the ones in the installed skills.**

| Claim | Bundled skills say | Actually |
|---|---|---|
| Modes per collection, Professional | 4 | **10** |
| Modes per collection, Organization | 40 | **20** |

Stale in `figma-use/references/variable-patterns.md:33` and
`figma-generate-library/references/token-creation.md:103`. This matters: mode count is
usually the binding constraint on any "toggle between palettes/themes" architecture, so
being 2.5× off changes the design.

## Plan-gated features

Check the plan **before** designing around a feature. `whoami` on the Figma MCP server
returns every plan the user belongs to and their seat on each; tier and seat gate
independently.

| Feature | Starter | Professional | Organization | Enterprise |
|---|---|---|---|---|
| Variable modes / collection | 1 | 10 | 20 | higher (unstated) |
| **Code Connect** | ✗ | **✗** | ✓ (Full/Dev seat) | ✓ (Full/Dev seat) |
| MCP tool calls | 6/month | 200/day, 15/min | 200/day, 20/min | 600/day |

**Code Connect on Professional is a hard no** — and Figma has stated there are no plans to
change it. Do not write `.figma.ts` templates for a Professional-plan user; they cannot be
published. Source:
[Code Connect](https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect).

Code Connect additionally requires the components to be **published to a team library**
first, so a draft file fails this twice over.

Verified 2026-08-07 —
[Figma plans and features](https://help.figma.com/hc/en-us/articles/360040328273-Figma-plans-and-features),
`rate-limits-access` MCP resource.

## Instructions

1. **Identify which reference covers the question** using the table below. Read it before
   answering — do not answer Figma product questions from memory.
2. **If the reference does not cover it, search `help.figma.com`** rather than guessing.
   Figma ships product changes continuously; anything undocumented here is unverified.
3. **When you verify something new, add it to the relevant reference** with the source URL
   and the date. This file is only useful if it stays current.
4. **Cite the source URL** when reporting a limit or behaviour to the user, so they can
   check it themselves.
5. **Distinguish "not possible" from "not possible natively."** Most Figma limits have a
   plugin-shaped escape hatch. Say which kind of "no" you mean.

| Reference | Covers |
|---|---|
| `references/variables-modes-and-limits.md` | Mode limits per plan, collections, aliasing, what modes can and cannot do |
| `references/applying-colour.md` | Eyedropper (incl. Shift), Selection colors scope, drag-and-drop, what preserves a variable binding |
| `references/libraries-and-publishing.md` | Drafts constraint, publish flow, what publishes, update propagation, Assets panel scope |
| `references/reactive-controllers.md` | The three ways to drive a design from variables, and what each costs |
| `references/mcp-sandbox-limits.md` | Plugin API surface that exists in the typings but is unavailable via `use_figma` — check before scripting an unfamiliar API |

## Examples

**"Can I have a dropdown of 348 palettes that re-colours my design?"**
→ Read `variables-modes-and-limits.md`. Answer: no — Professional caps at 10 modes per
collection. Offer the shortlist-plus-loader pattern, and name the plugin escape hatch.

**"Can I drag a colour from this board onto a layer?"**
→ Read `applying-colour.md`. Answer: not natively (open feature request), but `I` +
Shift-click transfers the **variable**, which is what you actually want. Plain eyedropper
would hardcode the hex and silently break reactivity.

**"Why do I only see 3 assets when I published 5 things?"**
→ Read `libraries-and-publishing.md`. Answer: the Assets panel lists components and styles
only; variables live in a separate system and appear in the Libraries/publish modal.

## Common edge cases

- **A limit differs from what's documented.** Figma changes tiers without much fanfare.
  Trust an empirical result from the file over any doc, including this one — then update
  this skill.
- **The user is on a tier you haven't confirmed.** Call `whoami` on the Figma MCP server;
  it returns every plan the user belongs to plus their seat on each. Seat and tier are
  independent, and both gate features.
- **A behaviour differs between the desktop app and the browser.** Note which you verified.
- **Something is possible only in prototype/present mode.** Always say so explicitly, and
  say whether the change persists back to the file — usually it does not.
