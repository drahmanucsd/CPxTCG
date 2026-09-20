/** Pitch classes (C=0) and MIDI note helpers. */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type Midi = number; // 0..127, middle C = 60

export const PC_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const PC_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function pc(n: number): PitchClass {
  return (((n % 12) + 12) % 12) as PitchClass;
}

/** Parse a note name like "Eb", "F#", "B♭", "C" to a pitch class. Returns null if invalid. */
export function parsePitchName(s: string): PitchClass | null {
  const m = /^([A-Ga-g])([#♯]|[b♭])?$/.exec(s.trim());
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  const base = LETTER_PC[letter]!;
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return pc(base + acc);
}

export type Spelling = 'sharp' | 'flat';

export function spellPc(p: PitchClass, spelling: Spelling = 'flat'): string {
  return spelling === 'sharp' ? PC_NAMES_SHARP[p] : PC_NAMES_FLAT[p];
}

/** Which spelling a key signature uses. Tonic pitch class of a major key (or relative major). */
export function keySpelling(tonicMajor: PitchClass): Spelling {
  // Sharps: G D A E B F#(6). Flats: F Bb Eb Ab Db Gb — note 6 is treated as F# (jazz players read F#7 more often than Gb7 as a V of B).
  return [7, 2, 9, 4, 11, 6].includes(tonicMajor) ? 'sharp' : 'flat';
}

export function relativeMajor(tonic: PitchClass, mode: 'major' | 'minor'): PitchClass {
  return mode === 'major' ? tonic : pc(tonic + 3);
}

/**
 * Spell a pitch class in the context of a key: diatonic notes use the key's spelling,
 * chromatic notes prefer flats in flat keys and sharps in sharp keys, with a few
 * jazz-idiom overrides (a chromatic #IV in a flat key is still spelled as the flat V).
 */
export function spellInKey(p: PitchClass, tonicMajor: PitchClass): string {
  const sp = keySpelling(tonicMajor);
  return spellPc(p, sp);
}

export function midiToPc(m: Midi): PitchClass {
  return pc(m);
}

export function midiName(m: Midi, spelling: Spelling = 'flat'): string {
  return `${spellPc(pc(m), spelling)}${Math.floor(m / 12) - 1}`;
}

/** "C4" -> 60, "Eb3" -> 51 */
export function parseMidiName(s: string): Midi | null {
  const m = /^([A-Ga-g][#♯b♭]?)(-?\d+)$/.exec(s.trim());
  if (!m) return null;
  const p = parsePitchName(m[1]!);
  if (p === null) return null;
  return (parseInt(m[2]!, 10) + 1) * 12 + p;
}

export const MIDI = {
  A0: 21, C1: 24, C2: 36, E2: 40, F2: 41, Bb2: 46, C3: 48, D3: 50, E3: 52, G3: 55,
  C4: 60, E4: 64, G4: 67, C5: 72, E5: 76, C6: 84, C7: 96, C8: 108,
} as const;

/** Interval helpers */
export function intervalUp(from: PitchClass, to: PitchClass): number {
  return pc(to - from);
}

export function transposePcs(pcs: readonly PitchClass[], by: number): PitchClass[] {
  return pcs.map((p) => pc(p + by));
}

export function uniqueSorted(nums: readonly number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}
