# design

## What's here

| Path | What it is |
|---|---|
| `figma/color/` | Sanzō Wada colour system — dataset, Figma library, plugin. Has its own `CLAUDE.md`. |
| `.claude/skills/figma-product-reference/` | Figma **product** behaviour: plan gates, publishing, applying colour, and API surface missing from the MCP sandbox. |

## Figma

### Which server to use

Two Figma MCP servers are configured. They are not interchangeable.

- **`figma-desktop`** (`127.0.0.1:3845`) — reads the file currently open in the desktop app.
  Takes **no `fileKey`**; `nodeId` is optional and falls back to the current selection.
  Free, no rate limit. Use for fast iteration on an open file.
- **`plugin:figma:figma`** (remote) — requires **both** `fileKey` and `nodeId`. The only one
  that can write (`use_figma`), search design systems, or reach a file that isn't open.
  Counts against the daily rate limit.

Rule of thumb: **selection in hand → desktop. URL in hand, or writing → remote.**

### Plan constraints (Professional, `seri@seri.dev`)

- **10 variable modes** per collection. Not 4 — the bundled Figma skills say 4 and are stale.
- **Code Connect is unavailable.** Requires Organization or Enterprise. Do not set it up or
  write `.figma.ts` files; they cannot be published.
- **Plugin *development* mode is fine** — Plugins → Development → Import from manifest is not
  plan-gated. Only publishing a private plugin to a team needs Organization. Do not conflate
  this with Code Connect.
- 200 remote MCP tool calls/day, 15/min.

### Rules for Figma-driven work

Adapted from Figma's own `add-custom-rules` guidance.

1. Load the `figma-use` skill before **every** `use_figma` call. It is a hard prerequisite.
2. Read `get_design_context` first for design→code work; if the response truncates, use
   `get_metadata` to get the node map and re-fetch only the nodes you need.
3. Work incrementally — at most ~10 logical operations per `use_figma` call. Validate with
   `get_metadata` or a screenshot between steps.
4. `use_figma` is **atomic**: a failed script changes nothing. On error, stop and read the
   message before retrying — do not blind-retry.
5. Never hardcode a colour. Bind fills to variables.
6. Prefer Auto Layout over absolute positioning.
7. Give layers semantic names, ideally matching the variable they bind to.

### Before answering a Figma product question

Read `.claude/skills/figma-product-reference/` rather than answering from memory. Figma ships
continuously and the bundled API skills contain stale numbers.

Two of its references earn their keep repeatedly:

- `mcp-sandbox-limits.md` — APIs that exist in the typings but are unavailable or
  differently-scoped via `use_figma`. **Check it before scripting an unfamiliar API.**
- `applying-colour.md` — eyedropper semantics and Selection colors scope.

**Validate an instrument before trusting a negative from it.** An empty array from a method
whose preconditions you have not checked is evidence of nothing. This has cost real time.
