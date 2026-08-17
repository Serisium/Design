// Shape of the WADA global defined by the GENERATED src/data.js (build-data.py).
// data.js is plain JS concatenated ahead of the compiled main.ts; it is not part
// of the TypeScript program, so this declaration is the only bridge.

interface WadaCombo {
  /** Combination id as printed in the source book, e.g. "4-001". */
  id: string;
  /** Colour count: 2, 3, or 4. */
  n: number;
  /** Ordered base-variable names, one per slot, e.g. "Red/Burnt Sienna". */
  s: string[];
}

interface WadaData {
  /** Base variable name -> fill hex, e.g. "Red/Burnt Sienna" -> "#ae5224". */
  base: { [name: string]: string };
  combos: WadaCombo[];
}

declare const WADA: WadaData;
