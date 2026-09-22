/**
 * Walking bass generation.
 *
 * Pure and testable: bars in, MIDI notes out. This is the part that decides whether the
 * accompaniment sounds like a bass player or like a sequencer, so the rules are explicit and
 * pinned by golden tests rather than tuned by ear in the audio layer.
 *
 * The rules, in the order a bass player would state them:
 *   1. Beat 1 of a chord is its root. (Later choruses allow the 3rd or 5th.)
 *   2. The beat before a chord change approaches the next root — chromatically from below or
 *      above, by a diatonic step, or from a fifth above (the "dominant" approach).
 *   3. Everything between is chord tones and chord-scale tones, mostly stepwise, holding a
 *      direction rather than zig-zagging.
 *   4. Stay in range, do not leap more than an octave, do not repeat a note immediately.
 *
 * Rules 1 and 2 are hard constraints; 3 and 4 are costs, minimised by a small beam search so the
 * line is varied between choruses without ever being wrong.
 */
import { type ChordSymbol, chordTones } from './chord.js';
import { pc } from './pitch.js';

/** Double bass range: low E to about the G above middle C's octave below. */
export const BASS_LOW = 28;   // E1
export const BASS_HIGH = 55;  // G3

export interface BassBar {
  chord: ChordSymbol;
  /** the chord that follows, for the approach note; null at the end */
  next: ChordSymbol | null;
  /** beats this chord lasts */
  beats: number;
}

export interface BassOptions {
  /** 1-based; later choruses take more liberties */
  chorus?: number;
  /** 'two' plays root and fifth as half notes — the first chorus and ballads */
  feel?: 'walk' | 'two';
  range?: [number, number];
  rng?: () => number;
  /** where the previous phrase left off, so choruses join up */
  startNear?: number;
}

const APPROACHES = [-1, 1, -2, 2, 7, -5];

/** Scale tones available over a chord: its own tones plus the tensions that fit. */
function palette(chord: ChordSymbol): number[] {
  const t = chordTones(chord);
  return [...new Set([...t.allowedPcs])];
}

function nearest(target: number, from: number, lo: number, hi: number): number {
  let best = target;
  let bestD = Infinity;
  for (let n = lo; n <= hi; n++) {
    if (pc(n) !== pc(target)) continue;
    const d = Math.abs(n - from);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

interface Path { notes: number[]; cost: number; dir: number }

/**
 * Generate one note per beat for the whole sequence.
 * Returns a flat list of MIDI notes, one per beat, in playing order.
 */
export function walkingBass(bars: BassBar[], opts: BassOptions = {}): number[] {
  const [lo, hi] = opts.range ?? [BASS_LOW, BASS_HIGH];
  const rng = opts.rng ?? Math.random;
  const chorus = opts.chorus ?? 1;
  const out: number[] = [];
  let prev = opts.startNear ?? 40;
  let dir = 1;

  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b]!;
    const root = bar.chord.bass ?? bar.chord.root;
    const tones = chordTones(bar.chord);
    const chordPcs = tones.memberPcs as unknown as number[];
    const scalePcs = palette(bar.chord);

    if (opts.feel === 'two' || bar.beats <= 2) {
      // two-feel: root, then the fifth (or the approach if the chord is about to change)
      const first = nearest(root, prev, lo, hi);
      out.push(first);
      prev = first;
      if (bar.beats >= 2) {
        const fifthPc = chordPcs.find((p) => pc(p - root) === 7) ?? pc(root + 7);
        const second = bar.next && bar.beats === 2
          ? approachNote(bar.next.bass ?? bar.next.root, prev, lo, hi, rng)
          : nearest(fifthPc, prev, lo, hi);
        out.push(second);
        prev = second;
      }
      for (let i = 2; i < bar.beats; i++) { out.push(prev); }
      continue;
    }

    // --- beat 1: the root, or on a later chorus sometimes the third or fifth
    const useInversion = chorus >= 3 && rng() < 0.15;
    const firstPc = useInversion
      ? (chordPcs.find((p) => pc(p - root) === 4 || pc(p - root) === 3) ?? root)
      : root;
    const first = nearest(firstPc, prev, lo, hi);

    // --- last beat: approach the next root, if there is one
    const nextRoot = bar.next ? (bar.next.bass ?? bar.next.root) : null;

    // --- beam search the beats in between
    let beams: Path[] = [{ notes: [first], cost: 0, dir }];
    for (let beat = 1; beat < bar.beats; beat++) {
      const isLast = beat === bar.beats - 1;
      const next: Path[] = [];
      for (const path of beams) {
        const from = path.notes[path.notes.length - 1]!;
        const candidates = isLast && nextRoot !== null
          ? approachCandidates(nextRoot, from, lo, hi)
          : stepCandidates(from, scalePcs, lo, hi);
        for (const n of candidates) {
          const c = stepCost(n, from, path, beat, chordPcs, lo, hi) + rng() * 1.6;
          next.push({ notes: [...path.notes, n], cost: path.cost + c, dir: n === from ? path.dir : Math.sign(n - from) });
        }
      }
      next.sort((a, z) => a.cost - z.cost);
      beams = next.slice(0, 6);
      if (!beams.length) beams = [{ notes: [first], cost: 0, dir }];
    }

    // Choosing the cheapest path every time makes every chorus identical: the costs dominate the
    // noise. Sample from the surviving beams instead — they all satisfy the hard rules, so this
    // varies the line without ever making it wrong.
    const best = pickWeighted(beams, rng);
    out.push(...best.notes);
    prev = best.notes[best.notes.length - 1]!;
    dir = best.dir;
  }
  return out;
}

/** Prefer cheap paths, but do not always take the cheapest. */
function pickWeighted(beams: Path[], rng: () => number): Path {
  const weights = beams.map((_, i) => 1 / (i + 1.5));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < beams.length; i++) { r -= weights[i]!; if (r <= 0) return beams[i]!; }
  return beams[0]!;
}

function approachCandidates(nextRoot: number, from: number, lo: number, hi: number): number[] {
  const out = new Set<number>();
  for (const iv of APPROACHES) {
    const target = nearest(pc(nextRoot + iv), from, lo, hi);
    if (Math.abs(target - from) <= 12) out.add(target);
  }
  return [...out];
}

function stepCandidates(from: number, scalePcs: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(lo, from - 7); n <= Math.min(hi, from + 7); n++) {
    if (n === from) continue;
    if (!scalePcs.includes(pc(n))) continue;
    out.push(n);
  }
  return out.length ? out : [Math.min(hi, Math.max(lo, from + 2))];
}

function stepCost(n: number, from: number, path: Path, beat: number, chordPcs: number[], lo: number, hi: number): number {
  let c = 0;
  const leap = Math.abs(n - from);
  if (leap > 12) return 99;
  c += leap <= 2 ? 0 : leap <= 4 ? 0.6 : leap <= 7 ? 1.6 : 3;          // prefer steps
  if (n === from) c += 2.5;                                            // no immediate repeats
  if (beat % 2 === 0 && !chordPcs.includes(pc(n))) c += 1.2;           // strong beats want chord tones
  if (path.notes.includes(n)) c += 0.5;                                // less circling the same note
  const towardEdge = Math.min(n - lo, hi - n);
  if (towardEdge < 3) c += 1.5;                                        // stay off the extremes
  if (path.dir !== 0 && Math.sign(n - from) !== 0 && Math.sign(n - from) !== path.dir) c += 0.4; // hold a direction
  return c;
}

function approachNote(nextRoot: number, from: number, lo: number, hi: number, rng: () => number): number {
  const cands = approachCandidates(nextRoot, from, lo, hi);
  return cands.length ? cands[Math.floor(rng() * cands.length)]! : nearest(nextRoot, from, lo, hi);
}

/**
 * Was the note before a chord change a legal approach to the new root?
 * Exported so tests can assert the rule rather than a specific line.
 */
export function isApproach(note: number, nextRoot: number): boolean {
  return APPROACHES.some((iv) => pc(note) === pc(nextRoot + iv)) || pc(note) === pc(nextRoot);
}
