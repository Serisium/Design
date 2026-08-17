# Libraries, publishing, and update propagation

> Read `../SKILL.md` first.
> Provenance legend: ✅ verified with source. ⚠️ believed but not re-verified.

## A draft cannot be published ✅

Verified 2026-08-07 — [Publish a library](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library)

A file in **Drafts** cannot be published as a library. It must be moved into a team project
first. The file needs at least one component, style, or variable to be publishable at all.

This bites when a file is created via `create_new_file` on the Figma MCP server: **that
tool places the file in the user's drafts folder** unless a `projectId` is supplied. If the
end goal is a team library, pass a `projectId` at creation or expect a manual move later.

Moving a file between drafts and projects is not exposed to the Plugin API — it is a UI
action in the file browser (right-click → **Move to project**).

## What the Plugin API cannot do ✅

Verified empirically 2026-08-07:

- **Cannot publish.** No publish method exists; publishing is UI-only.
- **Cannot rename the file.** Setting `figma.root.name` throws
  `in set_name: Setting the document name is currently not supported`.
- Note `figma.root.name` may report `"Document"` for a newly created file even when the
  Figma-level file name is set correctly. Do not treat it as authoritative for the file
  name — check the UI.

The file name **is** the library name other people see, so it is worth getting right before
publishing.

## Assets panel vs variables ✅

The **Assets panel lists components and styles only.** Variables are a separate system and
never appear there — not in the authoring file, and not in consuming files, where published
variables surface in the colour picker's **Libraries** tab instead.

Practical consequence: a file with 3 components and 2 variable collections shows **3**
assets. That is correct, not a publishing failure. Variables appear in the Libraries/publish
modal, reachable from the book icon at the top-right of the Assets panel.

To view variables locally: deselect everything → right sidebar → **Local variables**.

## Updates are not live ✅

Library changes propagate only when you **republish**, and each consuming file must then
**accept** the update. There is no live link.

Source: [Guide to libraries in Figma](https://help.figma.com/hc/en-us/articles/360041051154-Guide-to-libraries-in-Figma)

### The architectural consequence

Split collections by how often they change:

- **Stable primitives** (a fixed palette, a type ramp) — publish them. They rarely change,
  so the republish cost is near zero.
- **Working state** (semantic slots you repoint while exploring) — think hard before
  publishing. If the slot collection lives in the library, every tweak becomes
  publish → accept-update in every consuming file. That friction destroys any workflow
  built on rapid iteration.

The usual resolution: publish the primitives, and give each design file its own **local**
slot collection aliasing the published primitives. Slot changes stay instant and local, at
the cost of a one-time setup per file (scriptable).

If all the design work happens inside the library file itself, this distinction is moot —
start simple and split only when cross-file updating starts to feel slow. Publishing is not
one-way; a local collection can override a published one later.

## Enabling a library ✅

Publishing does not automatically switch a library on everywhere. It must be enabled per
team/file, and **drafts need it enabled explicitly**.

Source: [Enable libraries in drafts, teams, and files](https://help.figma.com/hc/en-us/articles/360038743434-Enable-libraries-in-drafts-teams-and-files)

## Verifying what actually landed ⚠️

After publishing, `get_libraries` on the Figma MCP server reports the libraries attached to
a file and those available to add. That is a better check than trusting the publish dialog,
since it reflects what the API can actually resolve.
