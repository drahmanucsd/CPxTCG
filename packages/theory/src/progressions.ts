/**
 * Progression generators: ii-V-I in all keys, cycles, turnarounds, blues forms, custom text.
 */
import { type ChordSymbol, makeChord, tryParseChord } from './chord.js';
import { type PitchClass, keySpelling, pc, relativeMajor } from './pitch.js';
import { type Key, romanToChord } from './roman.js';

export type KeyOrder = 'fourths' | 'fifths' | 'chromaticUp' | 'chromaticDown' | 'wholeStepUp' | 'wholeStepDown' | 'minorThirds' | 'random';

export interface ProgressionChord {
  chord: ChordSymbol;
  /** beats this chord lasts (in the drill's meter) */
  beats: number;
  /** roman numeral label in its key, for prompts */
  roman?: string;
  key?: Key;
}

export type Progression = ProgressionChord[];

/** 12 tonics in the requested order starting at `start`. */
export function keySequence(order: KeyOrder, start: PitchClass = 0, rng: () => number = Math.random): PitchClass[] {
  const step = { fourths: 5, fifths: 7, chromaticUp: 1, chromaticDown: 11, wholeStepUp: 2, wholeStepDown: 10, minorThirds: 3, random: 0 }[order];
  if (order === 'random') {
    const keys = Array.from({ length: 12 }, (_, i) => i as PitchClass);
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [keys[i], keys[j]] = [keys[j]!, keys[i]!]; }
    return keys;
  }
  if (order === 'wholeStepUp' || order === 'wholeStepDown' || order === 'minorThirds') {
    // these cycles don't cover all 12 keys; interleave to cover them
    const out: PitchClass[] = [];
    const seen = new Set<number>();
    let s = start;
    while (out.length < 12) {
      let k = s;
      while (!seen.has(k)) { out.push(k); seen.add(k); k = pc(k + step); }
      s = pc(s + 1);
    }
    return out;
  }
  return Array.from({ length: 12 }, (_, i) => pc(start + i * step));
}

function sp(tonicMajor: PitchClass) { return keySpelling(tonicMajor); }

export interface IiViOptions {
  minor?: boolean;
  /** "ii V I" (default), "ii V", "V I", "ii V I VI" */
  shape?: 'iiVI' | 'iiV' | 'VI' | 'iiVIVI';
  beatsPerChord?: number;
  /** Give the I chord twice the length (common in real charts). */
  longTonic?: boolean;
  /** Use altered dominants (7alt) / b9 on minor. */
  altered?: boolean;
}

/** ii-V-I in one key. */
export function iiVI(tonic: PitchClass, opts: IiViOptions = {}): Progression {
  const { minor = false, shape = 'iiVI', beatsPerChord = 4, longTonic = false, altered = false } = opts;
  const key: Key = { tonic, mode: minor ? 'minor' : 'major' };
  const spelling = sp(relativeMajor(tonic, key.mode));
  const ii = makeChord(pc(tonic + 2), minor ? 'm7b5' : 'm7', spelling);
  const V = makeChord(pc(tonic + 7), minor ? (altered ? '7alt' : '7b9') : altered ? '7alt' : '7', spelling);
  const I = makeChord(tonic, minor ? (altered ? 'mMaj7' : 'm6') : 'maj7', spelling);
  const VI = makeChord(pc(tonic + 9), minor ? 'm7b5' : '7', spelling);
  const b = beatsPerChord;
  const P = (chord: ChordSymbol, roman: string, beats = b): ProgressionChord => ({ chord, beats, roman, key });
  switch (shape) {
    case 'iiV': return [P(ii, minor ? 'iiø7' : 'ii-7'), P(V, 'V7')];
    case 'VI': return [P(V, 'V7'), P(I, minor ? 'i-' : 'IΔ7', longTonic ? 2 * b : b)];
    case 'iiVIVI': return [P(ii, minor ? 'iiø7' : 'ii-7'), P(V, 'V7'), P(I, minor ? 'i-' : 'IΔ7'), P(VI, minor ? 'viø7' : 'VI7')];
    default: return [P(ii, minor ? 'iiø7' : 'ii-7'), P(V, 'V7'), P(I, minor ? 'i-' : 'IΔ7', longTonic ? 2 * b : b)];
  }
}

/** ii-V-I through all 12 keys. */
export function iiVIAllKeys(order: KeyOrder, opts: IiViOptions & { start?: PitchClass; rng?: () => number } = {}): Progression {
  return keySequence(order, opts.start ?? 0, opts.rng).flatMap((k) => iiVI(k, opts));
}

/** One chord quality around a cycle: "all dominant 7ths around the cycle of 4ths". */
export function cycle(suffix: string, order: KeyOrder, opts: { start?: PitchClass; beatsPerChord?: number; rng?: () => number } = {}): Progression {
  return keySequence(order, opts.start ?? 0, opts.rng).map((k) => ({ chord: makeChord(k, suffix, k === 6 ? 'sharp' : 'flat'), beats: opts.beatsPerChord ?? 4 }));
}

export const TURNAROUNDS: Record<string, { name: string; numerals: string; beats: number[] }> = {
  IviiiV: { name: 'I – vi – ii – V', numerals: 'IΔ7 vi-7 ii-7 V7', beats: [2, 2, 2, 2] },
  iiiVIiiV: { name: 'iii – VI – ii – V', numerals: 'iii-7 VI7 ii-7 V7', beats: [2, 2, 2, 2] },
  IVIiiV: { name: 'I – VI7 – ii – V', numerals: 'IΔ7 VI7 ii-7 V7', beats: [2, 2, 2, 2] },
  tritone: { name: 'Tritone-sub turnaround', numerals: 'IΔ7 bIII7 bVI7 bII7', beats: [2, 2, 2, 2] },
  backdoor: { name: 'Backdoor: iv – bVII7 – I', numerals: 'iv-7 bVII7 IΔ7', beats: [2, 2, 4] },
  ladybird: { name: 'Lady Bird turnaround', numerals: 'IΔ7 bIII7 bVIΔ7 bII7', beats: [2, 2, 2, 2] },
  rhythmA: { name: 'Rhythm changes (A, 4 bars)', numerals: 'IΔ7 VI7 ii-7 V7 iii-7 VI7 ii-7 V7', beats: [2, 2, 2, 2, 2, 2, 2, 2] },
  coltrane: { name: 'Coltrane changes (Giant Steps cell)', numerals: 'IΔ7 bIII7 bVIΔ7 VII7 IIIΔ7 V7 IΔ7', beats: [2, 2, 2, 2, 2, 2, 4] },
  minorTurn: { name: 'Minor: i – VI – iiø – V', numerals: 'i-7 bVIΔ7 iiø7 V7', beats: [2, 2, 2, 2] },
  diminishedPassing: { name: 'Diminished passing: I – #i° – ii – #ii° – iii', numerals: 'IΔ7 #i°7 ii-7 #ii°7 iii-7', beats: [2, 2, 2, 2, 4] },
};

export function turnaround(id: keyof typeof TURNAROUNDS | string, tonic: PitchClass, minor = false): Progression {
  const def = TURNAROUNDS[id];
  if (!def) throw new Error(`Unknown turnaround ${id}`);
  const key: Key = { tonic, mode: minor ? 'minor' : 'major' };
  return def.numerals.split(/\s+/).map((n, i) => ({ chord: romanToChord(n, key), beats: def.beats[i] ?? 4, roman: n, key }));
}

export const BLUES_FORMS: Record<string, { name: string; bars: string[] }> = {
  basic: { name: 'Basic 12-bar blues', bars: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'] },
  jazz: { name: 'Jazz blues', bars: ['I7', 'IV7', 'I7', 'v-7 I7', 'IV7', '#iv°7', 'I7', 'iii-7 VI7', 'ii-7', 'V7', 'I7 VI7', 'ii-7 V7'] },
  bird: { name: 'Bird blues (Blues for Alice)', bars: ['IΔ7', 'viiø7 III7', 'vi-7 II7', 'v-7 I7', 'IV7', 'iv-7 bVII7', 'iii-7 VI7', 'biii-7 bVI7', 'ii-7', 'V7', 'I7 VI7', 'ii-7 V7'] },
  minor: { name: 'Minor blues', bars: ['i-7', 'i-7', 'i-7', 'i-7', 'iv-7', 'iv-7', 'i-7', 'i-7', 'bVI7', 'V7', 'i-7', 'V7'] },
};

export function blues(id: keyof typeof BLUES_FORMS | string, tonic: PitchClass, beatsPerBar = 4): Progression {
  const def = BLUES_FORMS[id];
  if (!def) throw new Error(`Unknown blues ${id}`);
  const key: Key = { tonic, mode: id === 'minor' ? 'minor' : 'major' };
  const out: Progression = [];
  for (const bar of def.bars) {
    const parts = bar.split(/\s+/);
    for (const n of parts) out.push({ chord: romanToChord(n, key), beats: beatsPerBar / parts.length, roman: n, key });
  }
  return out;
}

/**
 * Parse a custom progression: "| Dm7 G7 | Cmaj7 % | Cmaj7 |" or "Dm7 G7 Cmaj7" or roman numerals with a key.
 * Bars separated by "|"; within a bar chords split the bar's beats equally; "%" repeats the previous chord.
 */
export function parseProgression(text: string, opts: { beatsPerBar?: number; key?: Key } = {}): Progression {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const hasBars = text.includes('|');
  const bars = hasBars ? text.split('|').map((b) => b.trim()).filter(Boolean) : text.trim().split(/\s+/).filter(Boolean);
  const out: Progression = [];
  let prev: ChordSymbol | null = null;
  for (const bar of bars) {
    const tokens = bar.split(/\s+/).filter(Boolean);
    const beats = hasBars ? beatsPerBar / tokens.length : beatsPerBar;
    for (const tok of tokens) {
      let chord: ChordSymbol | null = null;
      let roman: string | undefined;
      const clean = tok.replace(/^\(|\)$/g, '');
      if (clean === '%' || clean === '/') chord = prev;
      else if (/^(N\.?C\.?|NC)$/i.test(clean)) continue;
      else chord = tryParseChord(clean);
      if (!chord) {
        try { chord = romanToChord(clean, opts.key ?? { tonic: 0, mode: 'major' }, { seventh: true }); roman = clean; }
        catch { throw new Error(`Cannot read "${tok}"`); }
      }
      const pcd: ProgressionChord = { chord, beats };
      if (roman) pcd.roman = roman;
      if (opts.key) pcd.key = opts.key;
      out.push(pcd);
      prev = chord;
    }
  }
  return out;
}

/** Weighted random chord picker over qualities × roots. */
export interface RandomChordOptions {
  suffixes: string[];
  roots?: PitchClass[];
  /** weight(root, suffix) — higher = more likely. Defaults to uniform. */
  weight?: (root: PitchClass, suffix: string) => number;
  /** don't repeat the previous chord */
  avoid?: ChordSymbol | null;
  rng?: () => number;
}

export function randomChord(opts: RandomChordOptions): ChordSymbol {
  const roots = opts.roots ?? (Array.from({ length: 12 }, (_, i) => i) as PitchClass[]);
  const rng = opts.rng ?? Math.random;
  const items: Array<{ r: PitchClass; s: string; w: number }> = [];
  for (const r of roots) for (const s of opts.suffixes) {
    if (opts.avoid && opts.avoid.root === r && opts.avoid.text.endsWith(s) && opts.avoid.text.length === (opts.avoid.rootName.length + s.length)) continue;
    items.push({ r, s, w: Math.max(0.0001, opts.weight?.(r, s) ?? 1) });
  }
  const total = items.reduce((a, b) => a + b.w, 0);
  let x = rng() * total;
  for (const it of items) { x -= it.w; if (x <= 0) return makeChord(it.r, it.s, it.r === 6 ? 'sharp' : 'flat'); }
  const last = items[items.length - 1]!;
  return makeChord(last.r, last.s, 'flat');
}
