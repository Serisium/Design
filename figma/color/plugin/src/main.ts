// Sanzō Wada Palette — main thread.
// Compiled by tsc, then concatenated after src/data.js by build.sh; the `WADA`
// global is defined there and declared in src/wada.d.ts.

const BASE_COLLECTION = 'Sanzō Wada Base';
const PALETTE_COLLECTION = 'Sanzō Wada Palette';
const SLOTS = ['Slot/1', 'Slot/2', 'Slot/3', 'Slot/4'] as const;
const EMPTY: Record<3 | 4, string> = { 3: 'Slot/Empty3', 4: 'Slot/Empty4' };
const GREY: RGBA = { r: 43 / 255, g: 43 / 255, b: 43 / 255, a: 1 };
const ROLE_PREFIX = 'Role/';
const SCAN_MAX = 300;    // candidates sent to the UI; the surplus is reported, not hidden
const SELECT_MAX = 100;  // node ids kept per colour, for "select every layer using this"

figma.showUI(__html__, { width: 440, height: 760, themeColors: true });

// ---------------------------------------------------------------- base colours

// Three states, and they are NOT interchangeable:
//   local        - a Sanzō Wada Base collection lives in this file
//   library      - published library is enabled here; import variables by key
//   not-enabled  - library exists but is not enabled in THIS file (UI-only fix)
type BaseMode = 'local' | 'library' | 'not-enabled';
let baseMode: BaseMode | null = null;
let baseByName: { [name: string]: Variable } = {};   // name -> Variable (resolved/imported)
let libKeyByName: { [name: string]: string } | null = null;

interface VarIndex {
  list: Variable[];
  byName: { [name: string]: Variable };
  byId: { [id: string]: Variable };
}

async function collectionVars(col: VariableCollection): Promise<VarIndex> {
  const list = (await Promise.all(
    col.variableIds.map((id) => figma.variables.getVariableByIdAsync(id))
  )).filter((v): v is Variable => Boolean(v));
  const byName: { [name: string]: Variable } = {}, byId: { [id: string]: Variable } = {};
  for (const v of list) { byName[v.name] = v; byId[v.id] = v; }
  return { list, byName, byId };
}

async function resolveBaseMode(): Promise<BaseMode> {
  baseByName = {};
  libKeyByName = null;

  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const local = cols.find((c) => c.name === BASE_COLLECTION);
  if (local) {
    baseByName = (await collectionVars(local)).byName;
    baseMode = 'local';
    return baseMode;
  }

  let libCols: LibraryVariableCollection[] = [];
  try {
    libCols = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  } catch (e) {
    // Missing `teamlibrary` permission, or the request failed outright.
    baseMode = 'not-enabled';
    return baseMode;
  }

  const lib = libCols.find((c) => c.name === BASE_COLLECTION);
  if (!lib) {
    // An empty list means "no library enabled for THIS file" — never "not published".
    baseMode = 'not-enabled';
    return baseMode;
  }

  const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(lib.key);
  libKeyByName = {};
  for (const lv of libVars) libKeyByName[lv.name] = lv.key;
  baseMode = 'library';
  return baseMode;
}

// Imported lazily — a combination needs at most 4 of the 159.
async function getBaseVar(name: string): Promise<Variable | null> {
  const hit = baseByName[name];
  if (hit) return hit;
  const key = baseMode === 'library' && libKeyByName ? libKeyByName[name] : undefined;
  if (key) {
    const imported = await figma.variables.importVariableByKeyAsync(key);
    baseByName[name] = imported;
    return imported;
  }
  return null;
}

// ---------------------------------------------------------------- palette collection

interface Palette {
  col: VariableCollection;
  mode: string;
  created: boolean;
  vars: VarIndex;
}

// ensurePalette guarantees the fixed names (slots, holders, Count, Source)
// exist, so a miss here is a real bug — name it instead of letting a
// TypeError swallow it.
function mustGet(vars: VarIndex, name: string): Variable {
  const v = vars.byName[name];
  if (!v) throw new Error('Palette variable missing: ' + name);
  return v;
}

async function ensurePalette(): Promise<Palette> {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  let col = cols.find((c) => c.name === PALETTE_COLLECTION && !c.remote);
  let created = false;
  if (!col) {
    col = figma.variables.createVariableCollection(PALETTE_COLLECTION);
    created = true;
  }
  const firstMode = col.modes[0];
  if (!firstMode) throw new Error('Collection has no modes: ' + PALETTE_COLLECTION);
  if (created) col.renameMode(firstMode.modeId, 'Active');
  const mode = firstMode.modeId;
  let vars = await collectionVars(col);

  const ensureColor = (name: string): void => {
    if (vars.byName[name]) return;
    const v = figma.variables.createVariable(name, col, 'COLOR');
    v.scopes = ['ALL_FILLS', 'STROKE_COLOR'];
    v.setValueForMode(mode, GREY);
  };
  const ensureString = (name: string, value: string, scopes?: VariableScope[]): void => {
    if (vars.byName[name]) return;
    const v = figma.variables.createVariable(name, col, 'STRING');
    if (scopes) v.scopes = scopes;
    v.setValueForMode(mode, value);
  };

  SLOTS.forEach(ensureColor);
  ensureColor(EMPTY[3]);
  ensureColor(EMPTY[4]);
  ensureString('Count', '4');
  ensureString('Source', '', ['TEXT_CONTENT']);

  vars = await collectionVars(col);
  return { col, mode, created, vars };
}

// ---------------------------------------------------------------- role state
//
// A role is in exactly one of three states, distinguished by its stored value:
//   alias -> Slot/N        assigned
//   alias -> Slot/EmptyN   parked; restores to Slot/N when count reaches N
//   raw GREY (no alias)    unassigned, no memory
//
// The alias IS the memory. Reassigning overwrites the holder pointer, which is
// exactly why a deliberate choice survives a count round-trip.

interface RoleTarget { slot: number | null; parked: 3 | 4 | null }

function isAlias(val: VariableValue | undefined): val is VariableAlias {
  return typeof val === 'object' && 'type' in val && val.type === 'VARIABLE_ALIAS';
}

function roleTarget(v: Variable, mode: string, byId: { [id: string]: Variable }): RoleTarget {
  const val = v.valuesByMode[mode];
  if (!isAlias(val)) return { slot: null, parked: null };
  const t = byId[val.id];
  if (!t) return { slot: null, parked: null };
  if (/^Slot\/[1-4]$/.test(t.name)) return { slot: parseInt(t.name.slice(5), 10), parked: null };
  if (t.name === EMPTY[3]) return { slot: null, parked: 3 };
  if (t.name === EMPTY[4]) return { slot: null, parked: 4 };
  return { slot: null, parked: null };
}

async function applyCountRules(n: number): Promise<{ role: string; to: string }[]> {
  const p = await ensurePalette();
  const moved: { role: string; to: string }[] = [];
  for (const v of p.vars.list) {
    if (!v.name.startsWith(ROLE_PREFIX)) continue;
    const { slot, parked } = roleTarget(v, p.mode, p.vars.byId);
    let dest: string | null = null;
    if (slot === 3 && n < 3) dest = EMPTY[3];
    else if (slot === 4 && n < 4) dest = EMPTY[4];
    else if (parked === 3 && n >= 3) dest = SLOTS[2];
    else if (parked === 4 && n >= 4) dest = SLOTS[3];
    if (!dest) continue;
    v.setValueForMode(p.mode, { type: 'VARIABLE_ALIAS', id: mustGet(p.vars, dest).id });
    moved.push({ role: v.name.slice(ROLE_PREFIX.length), to: dest });
  }
  return moved;
}

// ---------------------------------------------------------------- actions

async function applyCombo(id: string): Promise<{ role: string; to: string }[]> {
  const combo = WADA.combos.find((c) => c.id === id);
  if (!combo) throw new Error('Unknown combination: ' + id);
  const p = await ensurePalette();

  for (const [i, colourName] of combo.s.entries()) {
    const slotName = SLOTS[i];
    if (!slotName) throw new Error('Combination has more than 4 colours: ' + combo.id);
    const bv = await getBaseVar(colourName);
    if (!bv) throw new Error('Cannot resolve base colour: ' + colourName);
    mustGet(p.vars, slotName).setValueForMode(p.mode, { type: 'VARIABLE_ALIAS', id: bv.id });
  }
  mustGet(p.vars, 'Count').setValueForMode(p.mode, String(combo.n));
  mustGet(p.vars, 'Source').setValueForMode(p.mode, combo.id);
  return applyCountRules(combo.n);
}

async function setCount(n: number): Promise<{ role: string; to: string }[]> {
  const p = await ensurePalette();
  mustGet(p.vars, 'Count').setValueForMode(p.mode, String(n));
  return applyCountRules(n);
}

async function addRole(rawName: string): Promise<void> {
  const name = String(rawName || '').trim();
  if (!name) throw new Error('Role name required');
  if (name.includes('/')) throw new Error('Role names cannot contain "/"');
  const p = await ensurePalette();
  const full = ROLE_PREFIX + name;
  if (p.vars.byName[full]) throw new Error('Role already exists: ' + name);
  const v = figma.variables.createVariable(full, p.col, 'COLOR');
  v.scopes = ['ALL_FILLS', 'STROKE_COLOR'];
  v.setValueForMode(p.mode, GREY); // unassigned, no memory
}

async function assignRole(name: string, slot: number): Promise<void> {
  const p = await ensurePalette();
  const v = p.vars.byName[ROLE_PREFIX + name];
  if (!v) throw new Error('No such role: ' + name);
  const slotName = SLOTS[slot - 1];
  const target = slotName ? p.vars.byName[slotName] : undefined;
  if (!target) throw new Error('No such slot: ' + slot);
  v.setValueForMode(p.mode, { type: 'VARIABLE_ALIAS', id: target.id });
}

async function deleteRole(name: string): Promise<void> {
  const p = await ensurePalette();
  const v = p.vars.byName[ROLE_PREFIX + name];
  if (v) v.remove();
}

// ---------------------------------------------------------------- scan

function hex2(n: number): string { return Math.round(n * 255).toString(16).padStart(2, '0'); }
function toHex(c: RGB | RGBA): string { return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b); }

function nearestBase(hex: string): { name: string; delta: number } {
  const R = parseInt(hex.slice(1, 3), 16);
  const G = parseInt(hex.slice(3, 5), 16);
  const B = parseInt(hex.slice(5, 7), 16);
  let best = '', bestD = Infinity;
  for (const name in WADA.base) {
    const h = WADA.base[name];
    if (!h) continue;
    const d = Math.max(
      Math.abs(parseInt(h.slice(1, 3), 16) - R),
      Math.abs(parseInt(h.slice(3, 5), 16) - G),
      Math.abs(parseInt(h.slice(5, 7), 16) - B)
    );
    if (d < bestD) { bestD = d; best = name; }
  }
  return { name: best, delta: bestD };
}

// Layer names that say nothing about what the colour is *for*. A role named
// "Rectangle 12" is worse than one named after the colour it started as.
const GENERIC_LAYER =
  /^(rectangle|ellipse|polygon|star|vector|line|arrow|frame|group|component|instance|text|union|subtract|intersect|exclude|slice|image|mask|shape)\b/i;

function suggestRoleName(layers: string[], nearestName: string): string {
  for (const raw of layers) {
    const clean = String(raw).replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && !GENERIC_LAYER.test(clean)) return clean.slice(0, 24);
  }
  return (nearestName.split('/')[1] || 'Colour').slice(0, 24);
}

// A variable living in the palette collection is not automatically part of the
// system. Only these two name shapes mean anything; a colour variable that is
// neither is an *orphan* — inside the collection, outside the Role → Slot chain,
// and invisible everywhere else in this plugin. Assuming orphans were slots is
// what made them vanish from the scan.
function paletteKind(name: string): 'role' | 'slot' | 'orphan' {
  if (name.startsWith(ROLE_PREFIX)) return 'role';
  if (/^Slot\//.test(name)) return 'slot';   // covers Slot/1-4 and both Empty holders
  return 'orphan';
}

// Which of our collections a bound variable belongs to, if any. Cached: a
// document scan hits the same handful of ids thousands of times, and each miss
// is two async round-trips.
interface VarInfo {
  kind: 'base' | 'role' | 'slot' | 'orphan' | null;
  name: string | null;
  remote: boolean;
}

function makeVarClassifier(): (id: string) => Promise<VarInfo> {
  const cache: { [id: string]: VarInfo } = {};
  return async (id: string) => {
    const hit = cache[id];
    if (hit) return hit;
    const info: VarInfo = { kind: null, name: null, remote: false };
    try {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) {
        info.name = v.name;
        const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
        const cn = col ? col.name : '';
        info.remote = v.remote === true || (col ? col.remote === true : false);
        if (cn === BASE_COLLECTION) info.kind = 'base';
        else if (cn === PALETTE_COLLECTION) info.kind = paletteKind(v.name);
      }
    } catch (e) {
      // Deleted or otherwise unreachable — treat as foreign, not as ours.
    }
    cache[id] = info;
    return info;
  };
}

// An orphan already has the name its author wanted; keep it rather than guessing
// from layer names. Role names cannot contain "/", so only the leaf survives.
function leafName(name: string): string {
  const leaf = String(name).split('/').pop() || '';
  return leaf.replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Colour';
}

// Returns the *effective* scope alongside the roots: 'selection' with nothing
// selected silently becomes 'page', and the UI has to be able to say so.
interface ScanGroup { page: string; nodes: readonly SceneNode[] }
interface ScanRoots { scope: 'selection' | 'page' | 'document'; groups: ScanGroup[] }

async function scanRoots(scope: string): Promise<ScanRoots> {
  if (scope === 'selection' && figma.currentPage.selection.length) {
    return {
      scope: 'selection',
      groups: [{ page: figma.currentPage.name, nodes: figma.currentPage.selection.slice() }],
    };
  }
  if (scope === 'selection' || scope === 'page') {
    return {
      scope: 'page',
      groups: [{ page: figma.currentPage.name, nodes: figma.currentPage.children.slice() }],
    };
  }
  // Other pages may be unloaded under documentAccess: dynamic-page. Harmless if
  // they are already loaded; the method is absent on older API versions.
  if (typeof figma.loadAllPagesAsync === 'function') await figma.loadAllPagesAsync();
  return {
    scope: 'document',
    groups: figma.root.children.map((pg) => ({ page: pg.name, nodes: pg.children.slice() })),
  };
}

interface ScanRecord {
  key: string; hex: string; bound: string | null; count: number;
  layers: string[]; pages: string[]; nodeIds: string[];
}

interface OrphanRef { id: string; name: string | null; remote: boolean }

interface Candidate {
  key: string; hex: string; count: number;
  layers: string[]; pages: string[]; nodeIds: string[];
  variable: string | null; orphan: OrphanRef | null;
  nearest: string; delta: number;
  slot: number | null; suggested: string;
}

interface ScanResult {
  scope: 'selection' | 'page' | 'document';
  pages: number;
  total: number;
  truncated: number;
  skipped: { role: number; slot: number; base: number };
  orphans: number;
  candidates: Candidate[];
}

async function scanColors(scope: string): Promise<ScanResult> {
  const p = await ensurePalette();
  const roots = await scanRoots(scope);

  const found = new Map<string, ScanRecord>();
  const record = (paint: Paint, node: SceneNode, page: string): void => {
    // Matches Selection colors: solid only, skip hidden. No image/video/pattern.
    if (!paint || paint.type !== 'SOLID' || paint.visible === false) return;
    const bound = paint.boundVariables && paint.boundVariables.color
      ? paint.boundVariables.color.id : null;
    const hex = toHex(paint.color);
    const key = bound ? 'v:' + bound : 'h:' + hex;
    let rec = found.get(key);
    if (!rec) { rec = { key, hex, bound, count: 0, layers: [], pages: [], nodeIds: [] }; found.set(key, rec); }
    rec.count++;
    if (rec.layers.length < 3 && rec.layers.indexOf(node.name) < 0) rec.layers.push(node.name);
    if (rec.pages.indexOf(page) < 0) rec.pages.push(page);
    if (rec.nodeIds.length < SELECT_MAX) rec.nodeIds.push(node.id);
  };

  const visit = (node: SceneNode, page: string): void => {
    if ('visible' in node && node.visible === false) return; // hidden layers aren't in Selection colors either
    for (const prop of ['fills', 'strokes'] as const) {
      const paints = (node as Partial<GeometryMixin>)[prop];
      if (paints === figma.mixed) {
        // Mixed is per-character text; the segments carry the real paints.
        if (prop === 'fills' && node.type === 'TEXT') {
          for (const seg of node.getStyledTextSegments(['fills'])) {
            for (const pt of seg.fills) record(pt, node, page);
          }
        }
        continue;
      }
      // A truthiness check, not Array.isArray: isArray's `any[]` predicate
      // would erase the Paint type on its way into record().
      if (!paints) continue;
      for (const pt of paints) record(pt, node, page);
    }
    if ('children' in node) for (const child of node.children) visit(child, page);
  };
  for (const g of roots.groups) for (const n of g.nodes) visit(n, g.page);

  // Active members, to spot a scanned colour that is already in the palette.
  const active: (string | null)[] = [];
  for (const slotName of SLOTS) {
    const val = mustGet(p.vars, slotName).valuesByMode[p.mode];
    let name: string | null = null;
    if (isAlias(val)) {
      const bv = await figma.variables.getVariableByIdAsync(val.id);
      if (bv) name = bv.name;
    }
    active.push(name);
  }
  const count = parseInt(String(mustGet(p.vars, 'Count').valuesByMode[p.mode] || '4'), 10);

  const classify = makeVarClassifier();
  const skipped = { role: 0, slot: 0, base: 0 };
  const candidates: Candidate[] = [];
  let orphans = 0;
  for (const rec of found.values()) {
    let foreign: string | null = null, orphan: OrphanRef | null = null;
    if (rec.bound) {
      const info = await classify(rec.bound);
      // Already assigned to a Sanzō Wada variable — not a candidate.
      if (info.kind === 'role') { skipped.role++; continue; }
      if (info.kind === 'slot') { skipped.slot++; continue; }
      if (info.kind === 'base') { skipped.base++; continue; } // breaks the invariant; counted, not listed
      if (info.kind === 'orphan') { orphan = { id: rec.bound, name: info.name, remote: info.remote }; orphans++; }
      else foreign = info.name; // bound, but to somebody else's variable
    }
    const match = nearestBase(rec.hex);
    // Only an exact hit gets auto-assigned. A near match is a suggestion, not a mapping.
    const slot = match.delta === 0 ? active.indexOf(match.name) : -1;
    candidates.push({
      key: rec.key, hex: rec.hex, count: rec.count,
      layers: rec.layers, pages: rec.pages, nodeIds: rec.nodeIds,
      variable: foreign, orphan: orphan,
      nearest: match.name, delta: match.delta,
      slot: slot >= 0 && slot < count ? slot + 1 : null,
      suggested: orphan ? leafName(orphan.name || '') : suggestRoleName(rec.layers, match.name),
    });
  }
  candidates.sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));

  return {
    scope: roots.scope,
    pages: roots.groups.length,
    total: candidates.length,
    truncated: Math.max(0, candidates.length - SCAN_MAX),
    skipped, orphans,
    candidates: candidates.slice(0, SCAN_MAX),
  };
}

// Adopting never fails on a name collision — it disambiguates and reports the
// name it actually used. A one-click list is no place for a modal error.
//
// With `orphanId`, the existing variable is *renamed* into the Role group rather
// than a new one created alongside it. Figma keeps bindings across a rename, so
// every layer already using it joins the system in that one step — the only case
// where adopting fixes the document instead of just naming a colour.
async function adoptColour(
  rawName: string, slot: number | null, orphanId: string | null
): Promise<{ name: string; renamed: string | null }> {
  const p = await ensurePalette();
  let name = String(rawName || '').replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Role name required');
  if (p.vars.byName[ROLE_PREFIX + name]) {
    let i = 2;
    while (p.vars.byName[ROLE_PREFIX + name + ' ' + i]) i++;
    name = name + ' ' + i;
  }

  let renamed: string | null = null;
  if (orphanId) {
    const v = await figma.variables.getVariableByIdAsync(orphanId);
    if (!v) throw new Error('That variable is gone — rescan');
    // A library variable is read-only here, and renaming it in the library file
    // is a different (republish-and-accept) operation. Say so instead of throwing
    // Figma's own message.
    if (v.remote) {
      throw new Error(v.name + ' comes from a library — rename it there and republish, ' +
        'or unlink it in this file first');
    }
    renamed = v.name;
    v.name = ROLE_PREFIX + name; // bindings follow the rename
  } else {
    await addRole(name);
  }
  if (slot) await assignRole(name, slot);
  return { name, renamed };
}

function pageOf(node: BaseNode): PageNode | null {
  let c: BaseNode | null = node;
  while (c && c.type !== 'PAGE') c = c.parent;
  return c && c.type === 'PAGE' ? c : null;
}

async function selectUses(ids: string[]): Promise<{ page: string; shown: number; elsewhere: number }> {
  const nodes: SceneNode[] = [];
  for (const id of ids) {
    const n = await figma.getNodeByIdAsync(id);
    if (n && !n.removed && n.type !== 'DOCUMENT' && n.type !== 'PAGE') nodes.push(n);
  }
  const first = nodes[0];
  const page = first ? pageOf(first) : null;
  if (!page) throw new Error('Those layers are gone — rescan');
  if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
  const here = nodes.filter((n) => pageOf(n) === page);
  figma.currentPage.selection = here;
  figma.viewport.scrollAndZoomIntoView(here);
  return { page: page.name, shown: here.length, elsewhere: nodes.length - here.length };
}

// ---------------------------------------------------------------- state -> UI

interface RoleState { name: string; slot: number | null; parked: 3 | 4 | null }
interface SlotState { index: number; name: string | null; hex: string | null }

interface PluginState {
  baseMode: BaseMode | null;
  count: string;
  source: string;
  roles: RoleState[];
  slots: SlotState[];
  favourites: string[];
  presets: string[];
}

async function buildState(): Promise<PluginState> {
  const p = await ensurePalette();

  const roles: RoleState[] = p.vars.list
    .filter((v) => v.name.startsWith(ROLE_PREFIX))
    .map((v) => {
      const t = roleTarget(v, p.mode, p.vars.byId);
      return { name: v.name.slice(ROLE_PREFIX.length), slot: t.slot, parked: t.parked };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const slots: SlotState[] = [];
  for (const [i, slotName] of SLOTS.entries()) {
    const val = mustGet(p.vars, slotName).valuesByMode[p.mode];
    let name: string | null = null, hex: string | null = null;
    if (isAlias(val)) {
      const bv = await figma.variables.getVariableByIdAsync(val.id);
      if (bv) { name = bv.name; hex = WADA.base[bv.name] || null; }
    }
    slots.push({ index: i + 1, name, hex });
  }

  const favourites = await storageGet('favourites', [], isStringArray);
  const presets = await storageGet('presets', {}, isPresetMap);

  return {
    baseMode,
    count: String(mustGet(p.vars, 'Count').valuesByMode[p.mode] || '4'),
    source: String(mustGet(p.vars, 'Source').valuesByMode[p.mode] || ''),
    roles, slots, favourites, presets: Object.keys(presets),
  };
}

// clientStorage is keyed by the plugin id. A development plugin imported with
// no manifest id throws on every access, so reads fall back and writes report
// failure instead of taking down init.
//
// Reads are also validated: clientStorage returns whatever an older plugin
// build left there, and a shape mismatch should fall back, not flow through
// the UI typed as current.
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isPresetMap(v: unknown): v is { [name: string]: string[] } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v as { [name: string]: unknown }).every(isStringArray);
}

async function storageGet<T>(key: string, fallback: T, valid: (v: unknown) => v is T): Promise<T> {
  try {
    const v: unknown = await figma.clientStorage.getAsync(key);
    return valid(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

async function storageSet(key: string, value: unknown): Promise<boolean> {
  try {
    await figma.clientStorage.setAsync(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

// Everything the plugin can post to ui.html — the other half of UIMessage.
type PluginMessage =
  | { type: 'data'; base: WadaData['base']; combos: WadaCombo[] }
  | { type: 'state'; state: PluginState; toast?: string; adopted?: { key: string; name: string } }
  | { type: 'scan-results'; result: ScanResult }
  | { type: 'toast'; message: string }
  | { type: 'error'; message: string };

function send(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

async function push(extra?: { toast?: string; adopted?: { key: string; name: string } }): Promise<void> {
  const state = await buildState();
  send(Object.assign({ type: 'state' as const, state }, extra || {}));
}

// ---------------------------------------------------------------- message loop

// Everything ui.html can send. `scan-adopt`'s `slot` and `orphan` arrive null
// (not absent) when unset; `set-count` sends a number.
type UIMessage =
  | { type: 'init' }
  | { type: 'refresh'; quiet?: boolean }
  | { type: 'recheck-library' }
  | { type: 'apply-combo'; id: string }
  | { type: 'set-count'; count: number }
  | { type: 'add-role'; name: string }
  | { type: 'assign-role'; name: string; slot: number }
  | { type: 'delete-role'; name: string }
  | { type: 'scan'; scope: string }
  | { type: 'scan-adopt'; key: string; name: string; slot: number | null; orphan: string | null }
  | { type: 'scan-select'; ids: string[] }
  | { type: 'toggle-favourite'; id: string }
  | { type: 'save-preset'; name: string }
  | { type: 'apply-preset'; name: string }
  | { type: 'close' };

async function handle(msg: UIMessage): Promise<void> {
  try {
    switch (msg.type) {
      case 'init':
        await resolveBaseMode();
        send({ type: 'data', base: WADA.base, combos: WADA.combos });
        await push();
        break;

      // Figma emits no event for variable edits — `documentchange` covers nodes
      // and styles only — so the plugin cannot know the Variables panel was
      // touched. Every read path rebuilds from the file, so re-reading is the
      // whole fix; it just needs a trigger.
      case 'refresh':
        await push(msg.quiet ? {} : { toast: 'Re-read from the file' });
        break;

      case 'recheck-library':
        await resolveBaseMode();
        await push({ toast: baseMode === 'not-enabled'
          ? 'Still not enabled in this file'
          : 'Base colours resolved (' + baseMode + ')' });
        break;

      case 'apply-combo': {
        const moved = await applyCombo(msg.id);
        await push({ toast: 'Applied ' + msg.id + (moved.length ? ' · ' + moved.length + ' role(s) moved' : '') });
        break;
      }

      case 'set-count': {
        const moved = await setCount(msg.count);
        await push({ toast: 'Count ' + msg.count + (moved.length ? ' · ' + moved.length + ' role(s) moved' : '') });
        break;
      }

      case 'add-role':
        await addRole(msg.name);
        await push({ toast: 'Added role ' + msg.name });
        break;

      case 'assign-role':
        await assignRole(msg.name, msg.slot);
        await push();
        break;

      case 'delete-role':
        await deleteRole(msg.name);
        await push({ toast: 'Removed role ' + msg.name });
        break;

      case 'scan': {
        const result = await scanColors(msg.scope);
        send({ type: 'scan-results', result });
        break;
      }

      case 'scan-adopt': {
        const r = await adoptColour(msg.name, msg.slot, msg.orphan);
        const where = msg.slot ? ' → slot ' + msg.slot : ' (unassigned)';
        await push({
          toast: r.renamed
            ? 'Renamed ' + r.renamed + ' → ' + ROLE_PREFIX + r.name + where + ' · layers using it came with it'
            : 'Added role ' + r.name + where,
          adopted: { key: msg.key, name: r.name },
        });
        break;
      }

      case 'scan-select': {
        const r = await selectUses(msg.ids);
        send({
          type: 'toast',
          message: 'Selected ' + r.shown + ' layer(s) on ' + r.page +
            (r.elsewhere ? ' · ' + r.elsewhere + ' more on other pages' : ''),
        });
        break;
      }

      case 'toggle-favourite': {
        const favs = await storageGet('favourites', [], isStringArray);
        const i = favs.indexOf(msg.id);
        if (i >= 0) favs.splice(i, 1); else favs.unshift(msg.id);
        const ok = await storageSet('favourites', favs.slice(0, 24));
        await push(ok ? undefined : { toast: 'Favourites need a plugin id to persist — see SPEC' });
        break;
      }

      case 'save-preset': {
        const presets = await storageGet('presets', {}, isPresetMap);
        const state = await buildState();
        presets[msg.name] = state.roles.map((r) => r.name);
        const ok = await storageSet('presets', presets);
        await push({ toast: ok ? 'Saved preset ' + msg.name
                               : 'Presets need a plugin id to persist — see SPEC' });
        break;
      }

      case 'apply-preset': {
        const presets = await storageGet('presets', {}, isPresetMap);
        const names = presets[msg.name] || [];
        const p = await ensurePalette();
        let added = 0;
        for (const n of names) {
          if (!p.vars.byName[ROLE_PREFIX + n]) { await addRole(n); added++; }
        }
        await push({ toast: 'Preset ' + msg.name + ' · ' + added + ' role(s) added' });
        break;
      }

      case 'close':
        figma.closePlugin();
        break;
    }
  } catch (e) {
    const m = e && typeof e === 'object' && 'message' in e ? (e as { message: unknown }).message : null;
    send({ type: 'error', message: String(m || e) });
  }
}

// One message at a time. Handlers read palette state, mutate, then re-read;
// interleaving two of them can double-create the palette collection. handle()
// catches everything, so the chain never rejects.
let queue: Promise<void> = Promise.resolve();
figma.ui.onmessage = (msg: UIMessage) => {
  queue = queue.then(() => handle(msg));
};
