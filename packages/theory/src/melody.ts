/**
 * Melody: the note data a tune needs so the head can be played, shown and graded.
 *
 * Stored as ABC notation — text, diffable, editable in any editor, and readable by abcjs if we
 * ever want engraved notation. This module is the minimal parser/serialiser we need without
 * pulling a renderer into the theory package (which stays DOM-free).
 *
 * Grading a jazz melody is deliberately loose: the pitch sequence is the tune, the rhythm is
 * interpretation. See `gradeMelody`.
 */
import { type PitchClass, pc } from './pitch.js';

export interface MelodyNote {
  /** MIDI note, or null for a rest */
  midi: number | null;
  /** start in beats from the top of the form */
  start: number;
  /** length in beats */
  beats: number;
}

export interface Melody {
  /** beats per bar the melody was written in */
  beatsPerBar: number;
  notes: MelodyNote[];
  /**
   * Beat position of every bar line, when the source had them.
   *
   * Kept because ABC does not pad a short bar, so once the notes are laid out the mistake is
   * invisible: the bar lines are the only record of where the writer *meant* the bars to be.
   */
  barStarts?: number[];
  /** where it came from: shipped with the app, typed in, or played in by the user */
  source: 'builtin' | 'abc' | 'recorded';
}

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parse the subset of ABC we use for lead lines.
 *
 *   "L:1/4" default length, "M:4/4" metre, "K:Bb" key (accidentals applied automatically)
 *   C D E F | G2 A2 | z4 |
 *   ^C _D =E   sharp / flat / natural      C, C,, lower octaves     c c' higher
 *   C4-|C4     a tie: ONE note held, not two
 *   (3ABC      a triplet: three notes in the time of two
 *   A>B        broken rhythm: A dotted, B halved
 *
 * Ties and tuplets are not decoration. A tie across the bar line is how a fake book writes an
 * anticipation — one attack on the "and of 4" that rings through the downbeat — and playing it as
 * two notes is one of the commonest things a player who learned by ear gets wrong. If the parser
 * cannot tell those apart, nothing downstream can either.
 */
export function parseAbc(src: string): Melody {
  let unitBeats = 1;          // beats per default note length
  let beatsPerBar = 4;
  let keyAccidentals: Record<string, number> = {};
  const body: string[] = [];

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('%')) continue;
    const header = /^([A-Za-z]):\s*(.+)$/.exec(line);
    if (header && header[1]!.length === 1 && 'XTMLKQCRZ'.includes(header[1]!.toUpperCase())) {
      const [, field, value] = header as unknown as [string, string, string];
      if (field.toUpperCase() === 'M') {
        const m = /(\d+)\s*\/\s*(\d+)/.exec(value);
        if (m) beatsPerBar = +m[1]!;
      } else if (field.toUpperCase() === 'L') {
        const m = /(\d+)\s*\/\s*(\d+)/.exec(value);
        if (m) unitBeats = (+m[1]! / +m[2]!) * 4;   // quarter note = 1 beat
      } else if (field.toUpperCase() === 'K') {
        keyAccidentals = keySignature(value.trim());
      }
      continue;
    }
    body.push(line);
  }

  const text = body.join(' ');
  const notes: MelodyNote[] = [];
  const barAccidentals = new Map<string, number>();
  const barStarts: number[] = [0];
  let at = 0;
  let i = 0;
  /** notes still owed the tuplet multiplier, and what it is */
  let tuplet: { left: number; mult: number } | null = null;
  /** a '>' or '<' waiting for the note after it */
  let broken = 0;
  /** the previous note is tied into whatever comes next at the same pitch */
  let tied = false;

  while (i < text.length) {
    const c = text[i]!;
    if (c === '|') {
      barAccidentals.clear();
      if (barStarts[barStarts.length - 1] !== at) barStarts.push(at);   // '||' and '|:' are one line
      i++;
      continue;
    }
    if (c === '>' || c === '<') {
      // A>B lengthens A and shortens B, so the note already emitted has to be corrected
      const prev = notes[notes.length - 1];
      const factor = c === '>' ? 1.5 : 0.5;
      if (prev) { const delta = prev.beats * (factor - 1); prev.beats += delta; at += delta; }
      broken = c === '>' ? -1 : 1;     // the next note takes the opposite adjustment
      i++;
      continue;
    }
    // tuplets: (p, (p:q, (p:q:r
    const tup = /^\((\d)(?::(\d)?(?::(\d)?)?)?/.exec(text.slice(i));
    if (tup && tup[1]) {
      const p = +tup[1];
      const q = tup[2] ? +tup[2] : TUPLET_TIME[p] ?? 2;
      const r = tup[3] ? +tup[3] : p;
      tuplet = { left: r, mult: q / p };
      i += tup[0].length;
      continue;
    }
    const note = /^(\^{1,2}|_{1,2}|=)?([A-Ga-gz])([,']*)(\d+)?(?:\/(\d+))?(\/*)(-)?/.exec(text.slice(i));
    if (!note) { i++; continue; }                       // slurs, ornaments, spaces: skipped
    const [whole, acc, letter, octaves, num, den, slashes, tie] = note;
    i += whole.length;

    let mult = num ? +num : 1;
    if (den) mult = mult / +den;
    if (slashes) mult = mult / Math.pow(2, slashes.length);
    if (tuplet) { mult *= tuplet.mult; if (--tuplet.left <= 0) tuplet = null; }
    if (broken !== 0) { mult *= broken > 0 ? 1.5 : 0.5; broken = 0; }
    const beats = unitBeats * mult;

    if (letter === 'z') {
      notes.push({ midi: null, start: at, beats });
      at += beats;
      tied = false;
      continue;
    }

    const upper = letter!.toUpperCase();
    let midi = 60 + STEP[upper]!;
    if (letter === letter!.toLowerCase()) midi += 12;    // lower-case = the octave above middle C
    for (const o of octaves ?? '') midi += o === ',' ? -12 : 12;

    let alter: number | undefined;
    if (acc === '^') alter = 1; else if (acc === '^^') alter = 2;
    else if (acc === '_') alter = -1; else if (acc === '__') alter = -2;
    else if (acc === '=') alter = 0;
    if (alter !== undefined) barAccidentals.set(upper, alter);
    else if (barAccidentals.has(upper)) alter = barAccidentals.get(upper)!;
    else alter = keyAccidentals[upper] ?? 0;
    const pitch = midi + alter;

    const prev = notes[notes.length - 1];
    if (tied && prev && prev.midi === pitch) {
      // one note, held — not two
      prev.beats += beats;
    } else {
      notes.push({ midi: pitch, start: at, beats });
    }
    at += beats;
    tied = !!tie;
  }
  return { beatsPerBar, notes, source: 'abc', barStarts };
}

/** ABC's defaults for "p notes in the time of q", in a simple metre. */
const TUPLET_TIME: Record<number, number> = { 2: 3, 3: 2, 4: 3, 5: 2, 6: 2, 7: 2, 8: 3, 9: 2 };

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
const SHARPS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6 };
const FLATS: Record<string, number> = { F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6 };

function keySignature(key: string): Record<string, number> {
  const name = key.replace(/\s*(maj(or)?|ion(ian)?)\s*$/i, '').trim();
  const minor = /m(in(or)?)?$/i.test(name) && !/maj/i.test(name);
  const tonic = minor ? relativeMajorName(name.replace(/m(in(or)?)?$/i, '').trim()) : name;
  const out: Record<string, number> = {};
  if (SHARPS[tonic] !== undefined) for (let i = 0; i < SHARPS[tonic]!; i++) out[SHARP_ORDER[i]!] = 1;
  else if (FLATS[tonic] !== undefined) for (let i = 0; i < FLATS[tonic]!; i++) out[FLAT_ORDER[i]!] = -1;
  return out;
}

function relativeMajorName(minorTonic: string): string {
  const base: Record<string, string> = { A: 'C', E: 'G', B: 'D', 'F#': 'A', 'C#': 'E', D: 'F', G: 'Bb', C: 'Eb', F: 'Ab', Bb: 'Db', Eb: 'Gb' };
  return base[minorTonic] ?? 'C';
}

export function transposeMelody(m: Melody, semitones: number): Melody {
  return { ...m, notes: m.notes.map((n) => ({ ...n, midi: n.midi === null ? null : n.midi + semitones })) };
}

/** Notes sounding in a beat window, for "what should my right hand be doing here". */
export function melodyAt(m: Melody, fromBeat: number, toBeat: number): MelodyNote[] {
  return m.notes.filter((n) => n.midi !== null && n.start < toBeat && n.start + n.beats > fromBeat);
}

export interface MelodyVerdict {
  ok: boolean;
  /** how much of the expected pitch sequence was played, 0..1 */
  match: number;
  missing: number[];
  extra: number[];
  message: string;
}

/**
 * Grade a played phrase against the written melody.
 *
 * Pitch sequence only, octave-insensitive by default, and rhythm is ignored: a jazz head is
 * phrased, not transcribed, and marking someone wrong for laying back is both unmusical and
 * discouraging. Ornaments and repeated notes are tolerated.
 */
export function gradeMelody(expected: MelodyNote[], played: number[], opts: { octaveSensitive?: boolean } = {}): MelodyVerdict {
  const norm = (n: number) => (opts.octaveSensitive ? n : pc(n) as PitchClass as number);
  const want = expected.filter((n) => n.midi !== null).map((n) => norm(n.midi!));
  const got = played.map(norm);
  if (!want.length) return { ok: true, match: 1, missing: [], extra: [], message: 'Nothing written here' };

  // longest common subsequence: tolerates extra passing notes and a dropped one
  const dp: number[][] = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = 1; i <= want.length; i++) {
    for (let j = 1; j <= got.length; j++) {
      dp[i]![j] = want[i - 1] === got[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const common = dp[want.length]![got.length]!;
  const match = common / want.length;
  const wantCount = tally(want);
  const gotCount = tally(got);
  const missing: number[] = [];
  const extra: number[] = [];
  for (const [n, c] of wantCount) { const d = c - (gotCount.get(n) ?? 0); if (d > 0) missing.push(n); }
  for (const [n, c] of gotCount) { const d = c - (wantCount.get(n) ?? 0); if (d > 0) extra.push(n); }

  const ok = match >= 0.8;
  return {
    ok, match, missing, extra,
    message: ok ? (match === 1 ? 'That is the melody' : 'Close enough — the line is there')
      : match >= 0.5 ? 'Most of the line, some notes off'
      : 'That is not the melody yet',
  };
}

function tally(xs: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** Quantise a played performance to the nearest subdivision — the "record the head" path. */
export function quantise(events: Array<{ midi: number; startBeat: number; beats: number }>, grid = 0.5): Melody {
  const snap = (x: number) => Math.round(x / grid) * grid;
  const notes: MelodyNote[] = events
    .map((e) => ({ midi: e.midi, start: snap(e.startBeat), beats: Math.max(grid, snap(e.beats)) }))
    .sort((a, b) => a.start - b.start);
  return { beatsPerBar: 4, notes, source: 'recorded' };
}

/** Write a melody back out as ABC, so what the user records can be edited by hand. */
export function toAbc(m: Melody, opts: { title?: string; key?: string } = {}): string {
  const names = ['C', '^C', 'D', '_E', 'E', 'F', '^F', 'G', '_A', 'A', '_B', 'B'];
  const head = [`X:1`, opts.title ? `T:${opts.title}` : null, `M:${m.beatsPerBar}/4`, 'L:1/4', `K:${opts.key ?? 'C'}`].filter(Boolean).join('\n');
  let bar = 0;
  const out: string[] = [];
  for (const n of m.notes) {
    const b = Math.floor(n.start / m.beatsPerBar);
    while (bar < b) { out.push('|'); bar++; }
    const len = n.beats === 1 ? '' : Number.isInteger(n.beats) ? String(n.beats) : `/${Math.round(1 / n.beats)}`;
    if (n.midi === null) { out.push(`z${len}`); continue; }
    const oct = Math.floor(n.midi / 12) - 5;      // middle C (midi 60, "C4" here) is plain "C"
    let name = names[pc(n.midi)]!;
    if (oct >= 1) name = name.toLowerCase() + "'".repeat(oct - 1);
    else if (oct < 0) name = name + ','.repeat(-oct);
    out.push(name + len);
  }
  return `${head}\n${out.join(' ')} |`;
}

/**
 * Line up what was played against what is written, by pitch.
 *
 * The same longest-common-subsequence `gradeMelody` scores with, but backtracked so each matched
 * written note knows which played note was it. That pairing is what lets timing be measured
 * against the written rhythm instead of against the nearest click.
 *
 * Returns matched pairs in order plus the indices that went unmatched on each side.
 */
export function alignMelody(
  expected: MelodyNote[],
  played: number[],
  opts: { octaveSensitive?: boolean } = {},
): { pairs: Array<{ want: number; got: number }>; missed: number[]; extra: number[] } {
  const norm = (n: number) => (opts.octaveSensitive ? n : (pc(n) as number));
  const wantIdx = expected.map((n, i) => ({ i, v: n.midi })).filter((x) => x.v !== null) as Array<{ i: number; v: number }>;
  const want = wantIdx.map((x) => norm(x.v));
  const got = played.map(norm);

  const dp: number[][] = Array.from({ length: want.length + 1 }, () => new Array<number>(got.length + 1).fill(0));
  for (let i = 1; i <= want.length; i++) {
    for (let j = 1; j <= got.length; j++) {
      dp[i]![j] = want[i - 1] === got[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const pairs: Array<{ want: number; got: number }> = [];
  const matchedWant = new Set<number>();
  const matchedGot = new Set<number>();
  let i = want.length, j = got.length;
  while (i > 0 && j > 0) {
    if (want[i - 1] === got[j - 1]) {
      pairs.push({ want: wantIdx[i - 1]!.i, got: j - 1 });
      matchedWant.add(i - 1); matchedGot.add(j - 1);
      i--; j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  pairs.reverse();
  return {
    pairs,
    missed: wantIdx.filter((_, k) => !matchedWant.has(k)).map((x) => x.i),
    extra: played.map((_, k) => k).filter((k) => !matchedGot.has(k)),
  };
}

/**
 * Bars whose note lengths do not add up to the metre.
 *
 * ABC does not pad a short bar — it just starts the next note early, which silently shifts
 * everything after it. That is invisible when you read the text back and catastrophic when the
 * result is used as a reference: every later note is graded against the wrong beat. Anyone
 * typing a head in will do this, so it has to be caught at the door.
 */
export function shortBars(m: Melody): Array<{ bar: number; beats: number }> {
  const per = m.beatsPerBar || 4;
  const lines = m.barStarts;
  if (!lines || lines.length < 2) return [];          // no bar lines recorded: nothing to check
  const out: Array<{ bar: number; beats: number }> = [];
  // the final bar is not checked: a head often ends mid-bar, and the source may simply stop
  for (let i = 0; i < lines.length - 2; i++) {
    const beats = lines[i + 1]! - lines[i]!;
    if (Math.abs(beats - per) > 1e-6) out.push({ bar: i, beats: Math.round(beats * 1000) / 1000 });
  }
  return out;
}
