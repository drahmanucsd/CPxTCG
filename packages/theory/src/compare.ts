/**
 * Compare a performance with a written melody, note by note.
 *
 * `gradeMelody` answers "did you play the right notes" and deliberately ignores rhythm, which is
 * the right call when the point is recall. It is the wrong call for someone who learned a tune
 * off a recording, because the errors that creates are exactly the ones it throws away:
 *
 *   - the book holds one note; you heard two and played two              → `split`
 *   - the book re-strikes; you held through it                           → `merged`
 *   - the book writes F natural; you play F sharp                        → `wrongPitch`
 *   - the book writes the note on the "and" of 4; you play it on the 1   → `flat`
 *   - the book writes a triplet; you play it as two eighths              → `late` on a triplet
 *
 * So this aligns by *time as well as pitch*, keeps durations, and names each error rather than
 * scoring it. A named error is something you can go and fix.
 *
 * Swing is applied to the written line before comparing. A jazz head written in straight eighths
 * is performed with the off-beats late, so without that step every off-beat in the tune reads as
 * a mistake. Triplets are left where they are — they are already where swing is going.
 */
import { swingRatio } from './groove.js';
import type { MelodyNote } from './melody.js';
import { type SwingMeasure, measureSwingAt } from './timing.js';

export interface PlayedNote { midi: number; startBeat: number; beats: number }

export type NoteVerdict =
  | 'clean'
  | 'early' | 'late'
  | 'flat'
  | 'wrongPitch'
  | 'split'
  | 'merged'
  | 'missed';

export type NoteSubdivision = 'beat' | 'eighth' | 'triplet' | 'other';

export interface NoteComparison {
  index: number;
  midi: number;
  bar: number;
  /** as written */
  writtenBeat: number;
  writtenBeats: number;
  /** where it should actually sound once swing is applied */
  expectedBeat: number;
  subdivision: NoteSubdivision;
  /** written to ring through the beat that follows — the anticipation */
  anticipates: boolean;
  playedMidi: number | null;
  playedBeat: number | null;
  playedBeats: number | null;
  offsetMs: number | null;
  /** how far off the pitch was, in semitones */
  semitones: number | null;
  /** attacks you added inside a note the book holds */
  restrikes: number;
  verdict: NoteVerdict;
  message: string;
}

export interface MelodyComparison {
  notes: NoteComparison[];
  extra: PlayedNote[];
  counts: Record<NoteVerdict, number>;
  /** fraction of written notes played cleanly */
  score: number;
  /** of the notes that were played, how many were the right pitch */
  pitchScore: number;
  medianMs: number;
  spreadMs: number;
  /** how far the whole performance sat from the written line, in beats */
  shiftBeats: number;
  swing: SwingMeasure | null;
  headline: string;
  detail: string[];
  worstBars: Array<{ bar: number; problems: number; why: string }>;
}

export interface CompareOptions {
  beatDuration: number;
  beatsPerBar?: number;
  swing?: boolean;
  /** overrides the tempo-derived ratio */
  ratio?: number;
  /** how far a played note may be from where it belongs and still be that note, in beats */
  windowBeats?: number;
  /** ± ms that counts as being on it */
  windowMs?: number;
  /** F4 and F5 are the same note unless this is set */
  octaveSensitive?: boolean;
}

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const name = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

const near = (x: number, y: number, tol = 0.03) => Math.abs(x - y) < tol;

/**
 * How close is close enough, for this note.
 *
 * A fixed tolerance cannot work. At 120 bpm the gap between the middle of a triplet and a
 * straight eighth is 83 ms, so a 90 ms window is incapable of telling them apart — it would
 * call the exact error this module exists to catch "clean". The window therefore never exceeds
 * a fraction of the distance to the nearest *other* place a note could legitimately sit.
 *
 * With swing on, the swung eighth and the second note of a triplet land within about 14 ms of
 * each other. They are the same place, and pretending otherwise would invent a distinction no
 * player can hear or produce.
 */
function windowFor(expectedBeat: number, beatDur: number, cap: number, swing: boolean, ratio: number): number {
  const grid = swing ? [0, 1 / 3, ratio, 1] : [0, 1 / 3, 0.5, 2 / 3, 1];
  const frac = expectedBeat - Math.floor(expectedBeat);
  let gap = Infinity;
  for (const g of grid) { const d = Math.abs(frac - g); if (d > 1e-6 && d < gap) gap = d; }
  if (!Number.isFinite(gap)) return cap;
  return Math.min(cap, 0.45 * gap * beatDur * 1000);
}

/** Where a written position actually sounds, once the band is swinging. */
export function swingPlacement(beat: number, ratio: number): number {
  const k = Math.floor(beat);
  const frac = beat - k;
  return near(frac, 0.5) ? k + ratio : beat;
}

export function subdivisionOf(beat: number): NoteSubdivision {
  const frac = beat - Math.floor(beat);
  if (near(frac, 0)) return 'beat';
  if (near(frac, 0.5)) return 'eighth';
  if (near(frac, 1 / 3) || near(frac, 2 / 3)) return 'triplet';
  return 'other';
}

export function compareMelody(
  written: MelodyNote[],
  played: PlayedNote[],
  opts: CompareOptions,
): MelodyComparison {
  const beatDur = opts.beatDuration;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const ratio = opts.ratio ?? swingRatio(60 / beatDur);
  const swing = opts.swing ?? true;
  const windowBeats = opts.windowBeats ?? 0.6;
  const windowMs = opts.windowMs ?? 90;
  const sameNote = (a: number, b: number) => (opts.octaveSensitive ? a === b : ((a - b) % 12 + 12) % 12 === 0);

  const want = written
    .map((n, index) => ({ n, index }))
    .filter((x) => x.n.midi !== null)
    .map(({ n, index }) => {
      const expected = swing ? swingPlacement(n.start, ratio) : n.start;
      const end = swing ? swingPlacement(n.start + n.beats, ratio) : n.start + n.beats;
      return {
        index, midi: n.midi!, writtenBeat: n.start, writtenBeats: n.beats,
        expectedBeat: expected, expectedEnd: end,
        subdivision: subdivisionOf(n.start),
        anticipates: subdivisionOf(n.start) !== 'beat' && n.start + n.beats > Math.floor(n.start) + 1 + 1e-9,
      };
    });

  const hits = [...played].sort((a, b) => a.startBeat - b.startBeat);

  /** Greedy nearest match, preferring the right pitch when two candidates are equally close. */
  const matchAll = (shift: number) => {
    const used = new Set<number>();
    return want.map((w) => {
      let best = -1, bestScore = Infinity;
      for (let j = 0; j < hits.length; j++) {
        if (used.has(j)) continue;
        const d = Math.abs(hits[j]!.startBeat - shift - w.expectedBeat);
        if (d > windowBeats) continue;
        // a wrong note in the right place beats a right note half a beat away
        const s = d + (sameNote(hits[j]!.midi, w.midi) ? 0 : 0.18);
        if (s < bestScore) { bestScore = s; best = j; }
      }
      if (best >= 0) used.add(best);
      return best;
    });
  };

  /*
   * Find where the performance actually sits before grading it.
   *
   * A single nearest-match pass only works if the performance is already roughly lined up. Come
   * in half a bar late — which happens constantly when you are counting yourself in — and every
   * note matches the wrong written note, so a correct performance is reported as a wall of wrong
   * notes. That is both useless and demoralising, and it is not what went wrong.
   *
   * So: a coarse search for the shift that lines up the most *pitches*, then a median refinement
   * for the fine offset. The shift is reported rather than silently swallowed, because entering
   * a beat late is itself worth knowing about.
   */
  const fit = (shift: number) => {
    const m = matchAll(shift);
    let right = 0, err = 0;
    for (let i = 0; i < m.length; i++) {
      const j = m[i]!;
      if (j < 0) continue;
      if (sameNote(hits[j]!.midi, want[i]!.midi)) right++;
      err += Math.abs(hits[j]!.startBeat - shift - want[i]!.expectedBeat);
    }
    return { right, err };
  };

  // Candidates come from the data rather than from a sweep: any shift that would line some
  // early played note up with some early written note of the same pitch. That covers a missed
  // first bar or a late entry of any size, without scanning a whole chorus of positions.
  const candidates = new Set<number>([0]);
  for (let i = 0; i < Math.min(want.length, 8); i++) {
    for (let j = 0; j < Math.min(hits.length, 8); j++) {
      if (!sameNote(hits[j]!.midi, want[i]!.midi)) continue;
      candidates.add(Math.round((hits[j]!.startBeat - want[i]!.expectedBeat) * 20) / 20);
    }
  }
  let coarse = 0;
  if (hits.length && want.length) {
    let bestRight = -1, bestErr = Infinity;
    for (const sh of candidates) {
      const { right, err } = fit(sh);
      // a tie goes to the smaller shift: do not invent a late entry to explain sloppy playing
      if (right > bestRight || (right === bestRight && (err < bestErr - 1e-9 || (Math.abs(err - bestErr) < 1e-9 && Math.abs(sh) < Math.abs(coarse))))) {
        bestRight = right; bestErr = err; coarse = sh;
      }
    }
  }
  const first = matchAll(coarse);
  const offsets = first.map((j, i) => (j < 0 ? null : hits[j]!.startBeat - coarse - want[i]!.expectedBeat)).filter((x): x is number => x !== null);
  const bias = coarse + (offsets.length >= 3 ? med(offsets) : 0);
  const matched = matchAll(bias);
  const claimed = new Set(matched.filter((j) => j >= 0));

  const notes: NoteComparison[] = want.map((w, i) => {
    const j = matched[i]!;
    const bar = Math.floor(w.writtenBeat / beatsPerBar);
    const base = {
      index: w.index, midi: w.midi, bar,
      writtenBeat: w.writtenBeat, writtenBeats: w.writtenBeats,
      expectedBeat: w.expectedBeat, subdivision: w.subdivision, anticipates: w.anticipates,
    };

    if (j < 0) {
      // nothing struck here — but if the note before is still ringing, you held through it
      const prevJ = i > 0 ? matched[i - 1]! : -1;
      const prev = prevJ >= 0 ? hits[prevJ]! : null;
      const held = prev && prev.startBeat + prev.beats > w.expectedBeat + bias + 0.15;
      return {
        ...base,
        playedMidi: null, playedBeat: null, playedBeats: null, offsetMs: null, semitones: null, restrikes: 0,
        verdict: held ? 'merged' : 'missed',
        message: held
          ? `Held through it. The book strikes ${name(w.midi)} again here.`
          : `${name(w.midi)} never played.`,
      };
    }

    const h = hits[j]!;
    const offsetMs = (h.startBeat - bias - w.expectedBeat) * beatDur * 1000;
    const tol = windowFor(w.expectedBeat, beatDur, windowMs, swing, ratio);
    const wrong = !sameNote(h.midi, w.midi);
    const semitones = h.midi - w.midi;

    // attacks you added inside a note the book holds: the "two notes instead of one" error
    const restrikes = hits.filter((x, k) =>
      !claimed.has(k) && x.startBeat - bias > h.startBeat - bias + 0.1 && x.startBeat - bias < w.expectedEnd - 0.1,
    ).length;

    let verdict: NoteVerdict;
    let message: string;
    if (wrong) {
      verdict = 'wrongPitch';
      const dir = semitones > 0 ? 'above' : 'below';
      message = `You played ${name(h.midi)}; the book has ${name(w.midi)} — ${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'} ${dir}.`;
    } else if (restrikes > 0) {
      verdict = 'split';
      message = restrikes === 1
        ? `The book holds this ${name(w.midi)}; you struck it again.`
        : `The book holds this ${name(w.midi)}; you struck it ${restrikes} more times.`;
    } else if (w.subdivision !== 'beat' && flattened(h.startBeat - bias, w.expectedBeat, beatDur, tol)) {
      verdict = 'flat';
      message = w.anticipates
        ? `Written on the "${count(w.writtenBeat, beatsPerBar)}" and tied over the bar line — you played it on the ${count(Math.ceil(w.writtenBeat), beatsPerBar)}.`
        : `Written on the "${count(w.writtenBeat, beatsPerBar)}" — you played it on the ${count(Math.ceil(w.writtenBeat), beatsPerBar)}.`;
    } else if (Math.abs(offsetMs) <= tol) {
      verdict = 'clean';
      message = w.subdivision === 'triplet' ? 'On the triplet.' : 'On it.';
    } else {
      verdict = offsetMs < 0 ? 'early' : 'late';
      message = asEighth(w.writtenBeat, h.startBeat - bias, swing, ratio, beatDur, tol)
        ? `You played it as an eighth. It is the middle of a triplet — "${count(w.writtenBeat, beatsPerBar)}".`
        : `${Math.abs(Math.round(offsetMs))} ms ${verdict}.${w.subdivision === 'triplet' ? ' This one is a triplet, not an eighth.' : ''}`;
    }

    return {
      ...base,
      playedMidi: h.midi, playedBeat: h.startBeat, playedBeats: h.beats,
      offsetMs, semitones: wrong ? semitones : null, restrikes, verdict, message,
    };
  });

  // anything left over that was not a restrike inside a held note
  const insideSomething = new Set<number>();
  for (const n of notes) {
    if (n.restrikes === 0) continue;
    hits.forEach((x, k) => {
      if (claimed.has(k)) return;
      if (x.startBeat - bias > n.playedBeat! - bias && x.startBeat - bias < n.expectedBeat + n.writtenBeats) insideSomething.add(k);
    });
  }
  const extra = hits.filter((_, k) => !claimed.has(k) && !insideSomething.has(k));

  const counts = { clean: 0, early: 0, late: 0, flat: 0, wrongPitch: 0, split: 0, merged: 0, missed: 0 } as Record<NoteVerdict, number>;
  for (const n of notes) counts[n.verdict]++;
  const offs = notes.map((n) => n.offsetMs).filter((x): x is number => x !== null);
  const played2 = notes.filter((n) => n.playedMidi !== null);

  const cmp: MelodyComparison = {
    notes, extra, counts,
    score: notes.length ? counts.clean / notes.length : 0,
    pitchScore: played2.length ? played2.filter((n) => n.verdict !== 'wrongPitch').length / played2.length : 0,
    medianMs: Math.round(med(offs)),
    spreadMs: Math.round(iqr(offs)),
    shiftBeats: Math.round(bias * 100) / 100,
    swing: measureSwingAt(notes.filter((n) => n.playedBeat !== null).map((n) => n.playedBeat! - bias), 60 / beatDur),
    headline: '', detail: [], worstBars: [],
  };
  cmp.worstBars = worstBars(notes, beatsPerBar);
  Object.assign(cmp, describe(cmp, beatsPerBar));
  return cmp;
}

/**
 * The first note of a triplet group is the one with no equivalent in swung eighths, so it is the
 * one that gets played as an eighth. Worth naming, because "83 ms late" does not tell you that
 * you are subdividing the beat in two when the page says three.
 */
function asEighth(writtenBeat: number, got: number, swing: boolean, ratio: number, beatDur: number, tol: number): boolean {
  if (!near(writtenBeat - Math.floor(writtenBeat), 1 / 3)) return false;
  const eighth = Math.floor(writtenBeat) + (swing ? ratio : 0.5);
  return Math.abs((got - eighth) * beatDur * 1000) <= tol * 2;
}

/** Played on the downbeat that follows an off-beat: a different rhythm, not lateness. */
function flattened(got: number, expected: number, beatDur: number, windowMs: number): boolean {
  const downbeat = Math.ceil(expected - 1e-9);
  if (downbeat <= expected + 1e-9) return false;
  return Math.abs((got - downbeat) * beatDur * 1000) <= windowMs;
}

/** "4 and", "1", "2 and" — how a player says the position out loud. */
function count(beat: number, beatsPerBar: number): string {
  const k = Math.floor(beat);
  const frac = beat - k;
  const n = (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1;
  if (near(frac, 0)) return String(n);
  if (near(frac, 1 / 3)) return `${n} trip`;
  if (near(frac, 2 / 3)) return `${n} let`;
  return `${n} and`;
}

function worstBars(notes: NoteComparison[], beatsPerBar: number): MelodyComparison['worstBars'] {
  const byBar = new Map<number, NoteComparison[]>();
  for (const n of notes) { if (!byBar.has(n.bar)) byBar.set(n.bar, []); byBar.get(n.bar)!.push(n); }
  const out: MelodyComparison['worstBars'] = [];
  for (const [bar, ns] of byBar) {
    const bad = ns.filter((n) => n.verdict !== 'clean');
    if (!bad.length) continue;
    const kinds = new Set(bad.map((n) => n.verdict));
    const why =
      kinds.has('wrongPitch') ? 'wrong note'
      : kinds.has('split') ? 'held note played twice'
      : kinds.has('merged') ? 'two notes run together'
      : kinds.has('flat') ? 'syncopation flattened'
      : kinds.has('missed') ? 'notes missing'
      : 'placement';
    out.push({ bar, problems: bad.length, why });
  }
  void beatsPerBar;
  return out.sort((a, b) => b.problems - a.problems).slice(0, 5);
}

function describe(c: MelodyComparison, beatsPerBar: number): { headline: string; detail: string[] } {
  const n = c.notes.length;
  if (!n) return { headline: 'Nothing written to compare with', detail: [] };
  const played = n - c.counts.missed;
  if (played === 0) return { headline: 'Nothing landed', detail: ['Play the phrase while the click runs.'] };

  const detail: string[] = [];
  const pct = Math.round(c.score * 100);
  const headline =
    c.score === 1 ? 'Note for note, in time'
    : c.counts.wrongPitch ? `${c.counts.wrongPitch} wrong note${c.counts.wrongPitch > 1 ? 's' : ''}`
    : c.counts.split || c.counts.merged ? 'The notes are right; the durations are not'
    : c.counts.flat ? `${c.counts.flat} syncopation${c.counts.flat > 1 ? 's' : ''} flattened`
    : `${pct}% clean`;

  for (const v of ['wrongPitch', 'split', 'merged', 'flat'] as const) {
    const first = c.notes.find((x) => x.verdict === v);
    if (first) detail.push(`Bar ${first.bar + 1}: ${first.message}`);
  }
  if (Math.abs(c.shiftBeats) >= 0.4) {
    const b = Math.abs(c.shiftBeats);
    detail.unshift(`The whole phrase came in about ${b.toFixed(1)} beat${b >= 1.95 ? 's' : ''} ${c.shiftBeats > 0 ? 'late' : 'early'}. Everything below is graded from where you started, not from the click.`);
  }
  if (c.counts.missed) detail.push(`${c.counts.missed} note${c.counts.missed > 1 ? 's' : ''} never played.`);
  if (c.extra.length) detail.push(`${c.extra.length} note${c.extra.length > 1 ? 's' : ''} played that are not in the melody.`);
  const drift = c.counts.early + c.counts.late;
  if (drift) detail.push(`${drift} note${drift > 1 ? 's' : ''} in the right place but off the beat — median ${c.medianMs > 0 ? '+' : ''}${c.medianMs} ms, spread ±${Math.round(c.spreadMs / 2)} ms.`);
  if (c.swing) {
    detail.push(
      c.swing.verdict === 'matched'
        ? `Your eighths sat at ${c.swing.ratio.toFixed(1)}:1, which is the feel this tempo wants.`
        : `Your eighths sat at ${c.swing.ratio.toFixed(1)}:1 against the ${c.swing.expectedRatio.toFixed(1)}:1 this tempo wants — ${c.swing.verdict === 'straighter' ? 'straighter' : 'more dotted'} than the groove.`,
    );
  }
  void beatsPerBar;
  return { headline, detail };
}

function med(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function iqr(xs: number[]): number {
  if (xs.length < 4) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo]! + (s[hi]! - s[lo]!) * (i - lo); };
  return q(0.75) - q(0.25);
}
