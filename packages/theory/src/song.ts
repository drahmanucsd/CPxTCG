/**
 * Song model: written bars with repeat/ending/segno/coda markers, resolved into a flat playable form.
 */
import { type ChordSymbol, formatChord, transposeChord } from './chord.js';
import { type PitchClass, keySpelling, pc, relativeMajor } from './pitch.js';
import type { Key } from './roman.js';

export type Style = 'swing' | 'bossa' | 'ballad' | 'latin' | 'waltz' | 'straight' | 'funk' | 'even8ths';

export interface BarChord { chord: ChordSymbol | null /* null = N.C. */; beats: number }

export interface Bar {
  chords: BarChord[];
  /** section label shown at this bar ("A", "B", "Bridge"…) */
  section?: string;
  repeatStart?: boolean;
  /** number of times the repeated passage is played (2 = play twice) */
  repeatEnd?: number;
  /** numbered ending this bar belongs to (1, 2, …) */
  ending?: number;
  segno?: boolean;
  /** "to coda" marker: after a D.S./D.C. al Coda, jump from here to the coda */
  toCoda?: boolean;
  /** the coda starts here */
  coda?: boolean;
  /** jump instruction at the END of this bar */
  jump?: 'DS_alCoda' | 'DC_alCoda' | 'DS_alFine' | 'DC_alFine' | 'DS' | 'DC';
  fine?: boolean;
  timeSig?: [number, number];
  comment?: string;
}

export interface Song {
  id: string;
  title: string;
  composer?: string;
  key: Key;
  tempo?: number;
  style: Style;
  timeSig: [number, number];
  bars: Bar[];
  source: 'builtin' | 'ireal' | 'musicxml' | 'scan' | 'custom';
  tags?: string[];
  /** original text (iReal URL, chart text) for re-import */
  raw?: string;
}

/** One bar of the resolved (playable) form. */
export interface FormBar {
  /** index in Song.bars */
  barIndex: number;
  /** index in the resolved form */
  formIndex: number;
  chords: Array<{ chord: ChordSymbol | null; beats: number; beat: number }>;
  section?: string;
  timeSig: [number, number];
  /** which pass of a repeat this bar is on (1-based); 0 outside repeats */
  pass: number;
}

/**
 * Resolve repeats, endings, D.S./D.C., codas and fine into a flat list of bars.
 * Bounded so a malformed chart can't loop forever.
 */
export function resolveForm(song: Song, maxBars = 512): FormBar[] {
  const bars = song.bars;
  const out: FormBar[] = [];
  let i = 0;
  let timeSig = song.timeSig;
  const repeatStack: Array<{ start: number; pass: number }> = [];
  let jumped: 'DS' | 'DC' | null = null;
  let jumpMode: 'coda' | 'fine' | null = null;
  const segnoIdx = bars.findIndex((b) => b.segno);
  const codaIdx = bars.findIndex((b) => b.coda);
  let guard = 0;
  while (i < bars.length && out.length < maxBars && guard++ < maxBars * 4) {
    const b = bars[i]!;
    if (b.timeSig) timeSig = b.timeSig;
    const top = repeatStack[repeatStack.length - 1];
    if (b.repeatStart && (!top || top.start !== i)) repeatStack.push({ start: i, pass: 1 });
    const cur = repeatStack[repeatStack.length - 1];
    // numbered endings: skip bars belonging to another pass
    if (b.ending !== undefined && cur && b.ending !== cur.pass) { i++; continue; }
    // emit bar
    let beat = 1;
    const chords = b.chords.map((c) => { const x = { chord: c.chord, beats: c.beats, beat }; beat += c.beats; return x; });
    const fb: FormBar = { barIndex: i, formIndex: out.length, chords, timeSig, pass: cur ? cur.pass : 0 };
    if (b.section) fb.section = b.section;
    out.push(fb);
    if (b.fine && jumped && jumpMode === 'fine') break;
    // "to coda" (after this bar): once we've taken a D.S./D.C. al Coda, leave for the coda here
    if (b.toCoda && jumped && jumpMode === 'coda' && codaIdx >= 0) { jumped = null; jumpMode = null; i = codaIdx; continue; }
    // repeat end
    if (b.repeatEnd !== undefined && cur) {
      const times = Math.max(1, b.repeatEnd);
      if (cur.pass < times) { cur.pass++; i = cur.start; continue; }
      repeatStack.pop();
    }
    // jumps at end of bar (only taken once)
    if (b.jump && !jumped) {
      const toSegno = b.jump.startsWith('DS');
      jumped = toSegno ? 'DS' : 'DC';
      jumpMode = b.jump.endsWith('Coda') ? 'coda' : b.jump.endsWith('Fine') ? 'fine' : null;
      repeatStack.length = 0;
      i = toSegno && segnoIdx >= 0 ? segnoIdx : 0;
      continue;
    }
    i++;
  }
  return out;
}

/** Flatten a form into a progression-like chord list (for drills). */
export function formToChords(form: FormBar[]): Array<{ chord: ChordSymbol; beats: number; barIndex: number; formIndex: number; beat: number }> {
  const out: Array<{ chord: ChordSymbol; beats: number; barIndex: number; formIndex: number; beat: number }> = [];
  for (const fb of form) {
    for (const c of fb.chords) {
      if (!c.chord) {
        // N.C.: extend the previous chord's duration so the clock still moves
        if (out.length) out[out.length - 1]!.beats += c.beats;
        continue;
      }
      // merge repeated identical chords across bars? No — keep bar boundaries so the cursor moves.
      out.push({ chord: c.chord, beats: c.beats, barIndex: fb.barIndex, formIndex: fb.formIndex, beat: c.beat });
    }
  }
  return out;
}

export function transposeSong(song: Song, semitones: number): Song {
  if (semitones === 0) return song;
  const tonic = pc(song.key.tonic + semitones);
  const spelling = keySpelling(relativeMajor(tonic, song.key.mode));
  return {
    ...song,
    key: { tonic, mode: song.key.mode },
    bars: song.bars.map((b) => ({ ...b, chords: b.chords.map((c) => ({ beats: c.beats, chord: c.chord ? transposeChord(c.chord, semitones, spelling) : null })) })),
  };
}

export function songKeyName(song: Song): string {
  const sp = keySpelling(relativeMajor(song.key.tonic, song.key.mode));
  const names = sp === 'sharp' ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[song.key.tonic]}${song.key.mode === 'minor' ? '-' : ''}`;
}

/** Sections present in a song with their bar ranges (in Song.bars indices). */
export function sectionRanges(song: Song): Array<{ label: string; from: number; to: number }> {
  const out: Array<{ label: string; from: number; to: number }> = [];
  song.bars.forEach((b, i) => {
    if (b.section) { if (out.length) out[out.length - 1]!.to = i - 1; out.push({ label: b.section, from: i, to: song.bars.length - 1 }); }
  });
  return out;
}

/** Guide-tone line: 3rd and 7th of every chord in the form, chosen for smooth motion. */
export function guideTones(chords: Array<{ chord: ChordSymbol }>, startThird = 64): Array<{ third: number; seventh: number }> {
  const out: Array<{ third: number; seventh: number }> = [];
  let prev: { third: number; seventh: number } | null = null;
  for (const { chord } of chords) {
    const t = formatChord(chord); void t;
    const thirdPc = pc(chord.root + (chord.quality === 'sus4' ? 5 : ['min', 'halfdim', 'dim', 'minmaj'].includes(chord.quality) ? 3 : 4));
    const sevPc = pc(chord.root + (chord.seventh === 'maj7' ? 11 : chord.seventh === 'dim7' ? 9 : chord.seventh === 'min7' ? 10 : chord.sixth ? 9 : 11));
    const near = (p: PitchClass, ref: number) => { let n = ref - ((ref - p) % 12 + 12) % 12; if (ref - n > 6) n += 12; return n; };
    const third = near(thirdPc, prev ? prev.third : startThird);
    const seventh = near(sevPc, prev ? prev.seventh : startThird + 5);
    prev = { third, seventh };
    out.push(prev);
  }
  return out;
}
