# Plugin API surface missing from the `use_figma` sandbox

> Read `../SKILL.md` first.
> All entries ✅ verified empirically 2026-08-07 by calling them and reading the error.

The Figma Plugin API typings shipped with the `figma-use` skill describe the **full** API
available to a locally-installed plugin. `use_figma` runs in a more restricted sandbox, so
**a symbol existing in `plugin-api-standalone.d.ts` does not mean you can call it.**

This trips you up in a specific way: the typings confirm a capability, you write a script
around it, and the script fails atomically at runtime. Check this list first.

## Confirmed unavailable

| API | Error |
|---|---|
| `figma.root.name` (setter) | `in set_name: Setting the document name is currently not supported` |
| `node.getDevResourcesAsync()` | `"getDevResourcesAsync" is not a supported API` |
| `node.addDevResourceAsync()` | `"addDevResourceAsync" is not a supported API` |
| `figma.notify()` | throws `not implemented` |
| `figma.loadAllPagesAsync()` | unsupported (per the `use_figma` tool description) |
| `node.setPluginData()` | unsupported (per the `use_figma` tool description) |
| `figma.createImageAsync()` | unsupported (per the `use_figma` tool description) |

**Consequence:** dev resources cannot be scripted at all. Attaching links to layers is a
manual Dev Mode action. If a workflow depends on them, plan for a human step.

## `figma.teamLibrary` — scoped to *enabled* libraries, not published ones ✅

Not a sandbox limitation. Documented behaviour that is easy to misread as one.

[figma.teamLibrary](https://developers.figma.com/docs/plugins/api/figma-teamlibrary/):

> The TeamLibrary API is designed to work with library files and assets **enabled for the
> current file**. These libraries must be **enabled manually via the UI**.
>
> `getAvailableLibraryVariableCollectionsAsync()` — Returns a descriptor of all
> VariableCollections that exist in the **enabled libraries of the current file**… This
> requires that users enable libraries that contain variables **via the UI. Currently it is
> not possible to enable libraries via the Plugin API.**

Two consequences that bite:

1. **An empty result means "no library is enabled for this file", not "nothing is
   published."** A brand-new file has nothing enabled, so it always returns `[]`.
2. **`teamlibrary` must be in the plugin manifest's `permissions` array**, or the methods
   throw:
   ```json
   { "permissions": ["teamlibrary"] }
   ```

There is no Plugin API path to enable a library. Any workflow depending on library variables
needs the user to enable it in the UI first — plan for that as an explicit bootstrap step
with a clear message, not a silent empty state.

Related known issue: the API is reported to return **stale** collection/variable descriptors
after a library is republished, while the Variables UI shows current data. Don't treat it as
a live view.

### Verifying that a library actually published ✅

`teamLibrary` cannot answer this — it only sees enabled libraries. Neither can `get_libraries`
(`libraries_available_to_add` is documented as community + **organization** libraries, and
stays empty on Professional).

Use **`search_design_system`** with the consuming file's `fileKey`. It searches design
libraries directly and returns library name, keys, and publish timestamp:

```
search_design_system(query: "Burnt Sienna", fileKey: <consumer>, includeVariables: true)
→ { name: "Red/Burnt Sienna",
    libraryName: "Sanzō Wada Palette Library",
    variableCollectionName: "Sanzō Wada Base",
    key: "38dc2ca4…" }
```

**Methodological note:** before trusting a negative from an API, read its contract and
validate it against a known-positive. An empty array from a method whose preconditions you
have not checked is evidence of nothing.

## Available but type-validated more strictly than the typings suggest

### `node.annotations`

`AnnotationProperty` lists ~30 property types (`fills`, `padding`, `cornerRadius`, …), but
each is validated **against the node type** at assignment:

```
Error: in set_annotations: Invalid property "fills" for a COMPONENT_SET node
```

A `COMPONENT_SET` is a container and has no fills, so `{ type: 'fills' }` is rejected —
even though the type union permits it. `COMPONENT` and `FRAME` accept it.

**Pattern:** wrap the annotation assignment in try/catch per node and fall back to a
label-only annotation. Since `use_figma` is atomic, one bad node otherwise discards the
entire script's work.

```js
try {
  node.annotations = [{ label, properties: [{ type: 'fills' }] }]
} catch (e) {
  node.annotations = [{ label }]
}
```

### `hiddenFromPublishing`

Exists on `Variable` and `VariableCollection` only. Reading it on a component throws:

```
TypeError: node.hiddenFromPublishing: no such property 'hiddenFromPublishing' on COMPONENT_SET node
```

Components control publish visibility through the publish dialog, not a node property.

## Things the API cannot do at all (not sandbox-specific)

- **Publish a library.** UI-only.
- **Move a file between Drafts and a project.** UI-only, and required before publishing.
- **Rename a file.** See `figma.root.name` above. Note it may *report* `"Document"` for a
  newly created file regardless of the real name — don't trust it either way.

## How to probe safely

Because scripts are atomic, probe unknown APIs in a `try/catch` that returns the error text
rather than letting it throw. One call then tells you what's available without losing the
rest of the script's work:

```js
let status
try { await node.someUncertainApi(); status = 'ok' }
catch (e) { status = 'FAILED: ' + String(e && e.message ? e.message : e) }
return { status }
```
