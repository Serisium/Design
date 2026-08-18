#!/usr/bin/env node
// Generate wada-tones.json — an 11-rung perceptual-lightness ramp per base
// colour (SPEC.md, "Perceptual lightness — tones").
//
// The colour math lives in culori, deliberately: conversions and gamut
// clamping are the library's job; this script only orchestrates. Hue and
// chroma come from the seed in OKLCH; each rung binary-searches OKLCH
// lightness until CIE L* (D65) hits the ladder target, clamping chroma into
// sRGB along the way. The ramp passes through the seed EXACTLY at its natural
// rung — that entry is the printed hex verbatim, never a regenerated
// approximation of it.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { converter, clampChroma, formatHex } from 'culori';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'wada-combinations.json');
const OUT = join(HERE, 'wada-tones.json');

// Snapping targets in CIE L* — the SPEC's ladder, tunable.
const LADDER = [
  [50, 97], [100, 92], [200, 84], [300, 74], [400, 64], [500, 54],
  [600, 45], [700, 36], [800, 27], [900, 18], [950, 11],
];

const toOklch = converter('oklch');
const toLab65 = converter('lab65');
const measureL = (color) => toLab65(color).l;

// The colour with the seed's OKLCH hue and chroma whose CIE L* is `target`.
// Chroma is clamped into sRGB per rung, which is what lets two adjacent dark
// rungs share a hex.
function atTone(seed, target) {
  const at = (l) => clampChroma({ mode: 'oklch', l, c: seed.c, h: seed.h }, 'oklch');
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (measureL(at(mid)) < target) lo = mid; else hi = mid;
  }
  return formatHex(at((lo + hi) / 2));
}

const data = JSON.parse(readFileSync(SRC, 'utf8'));
const seeds = {};
for (const b of data.baseColours) {
  const hex = b.hex.toLowerCase();
  const ok = toOklch(hex);
  const L = measureL(hex);
  // Natural rung: nearest ladder target to the measured L*; on a tie the
  // lighter rung wins (first in ladder order), for determinism.
  let natural = LADDER[0][0], bestD = Infinity;
  for (const [rung, target] of LADDER) {
    const d = Math.abs(L - target);
    if (d < bestD) { bestD = d; natural = rung; }
  }
  const rungs = {};
  for (const [rung, target] of LADDER) {
    rungs[rung] = rung === natural ? hex : atTone(ok, target);
  }
  seeds[b.variable] = { seed: natural, rungs };
}

// Sanity: within each ramp, measured L* must not increase down the ladder.
// The seed replaces its natural rung, so this also catches a mis-snapped seed.
// Tolerance covers hex quantisation (~0.2 L*).
for (const [name, ramp] of Object.entries(seeds)) {
  let prev = Infinity;
  for (const [rung] of LADDER) {
    const L = measureL(ramp.rungs[rung]);
    if (L > prev + 0.25) throw new Error('non-monotonic ramp: ' + name + ' at ' + rung);
    prev = L;
  }
}

// One seed per line: reviewable diffs.
const lines = Object.entries(seeds).map(
  ([name, ramp]) => '    ' + JSON.stringify(name) + ': ' + JSON.stringify(ramp)
);
writeFileSync(OUT,
  '{\n  "ladder": ' + JSON.stringify(Object.fromEntries(LADDER)) + ',\n' +
  '  "seeds": {\n' + lines.join(',\n') + '\n  }\n}\n');

const byRung = {};
for (const s of Object.values(seeds)) byRung[s.seed] = (byRung[s.seed] || 0) + 1;
console.log(JSON.stringify({
  seeds: Object.keys(seeds).length,
  naturalRungs: byRung,
}, null, 2));
