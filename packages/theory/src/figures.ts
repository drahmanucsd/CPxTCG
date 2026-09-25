/**
 * Rhythm figures: the placements a jazz line actually uses, as data.
 *
 * The hard part of a jazz head is rarely the pitches. It is that phrases arrive early — the note
 * that belongs to bar 5 is played on the "and of 4" of bar 4, and playing it on the downbeat
 * instead is the single most common thing that makes a student sound stiff. That push is a
 * *skill*, not a fact, and it is learned the way a teacher teaches it: hear one bar, play it
 * back, do it again until it is right, then string bars together.
 *
 * A figure is where the hits go, not what the notes are, so this ladder ships with the app and
 * borrows nothing from anybody's tune.
 *
 * Hits are `{ beat, slot }` rather than a beat fraction on purpose: slot 1 means "the off-beat
 * eighth of that beat", which sits at the swing ratio for the tempo, not at 0.5. Storing 3.5
 * would silently mean "straight" and would be wrong at every tempo a jazz drill runs at.
 */
import { swingRatio } from './groove.js';

export interface FigureHit {
  /** integer beat within the phrase, 0-based */
  beat: number;
  /** 0 = on the beat, 1 = the off-beat eighth of that beat */
  slot: 0 | 1;
}

export interface Figure {
  id: string;
  name: string;
  /** what this teaches, in one line */
  blurb: string;
  bars: number;
  hits: FigureHit[];
  /** 1 (find the beat) … 5 (a phrase) */
  level: number;
  /** where this figure came from: the shipped ladder, or cut out of a head you recorded */
  source: 'ladder' | 'head';
  /** bar of the tune this was cut from, when source is 'head' */
  fromBar?: number;
}

/**
 * The ladder. Each rung isolates one placement, and the order is the order a teacher introduces
 * them: find the beat, then the backbeat, then one off-beat, then the push across a bar line,
 * then combinations, then a phrase.
 */
export const FIGURES: Figure[] = [
  {
    id: 'quarters', name: 'On the beat', level: 1, bars: 1, source: 'ladder',
    blurb: 'Four quarter notes. The reference every other figure is heard against.',
    hits: [{ beat: 0, slot: 0 }, { beat: 1, slot: 0 }, { beat: 2, slot: 0 }, { beat: 3, slot: 0 }],
  },
  {
    id: 'backbeat', name: '2 and 4', level: 1, bars: 1, source: 'ladder',
    blurb: 'Where the drummer’s hi-hat is. Nothing on the downbeat at all.',
    hits: [{ beat: 1, slot: 0 }, { beat: 3, slot: 0 }],
  },
  {
    id: 'and-of-2', name: 'The Charleston', level: 2, bars: 1, source: 'ladder',
    blurb: 'Beat 1 and the "and" of 2. The oldest comping figure there is.',
    hits: [{ beat: 0, slot: 0 }, { beat: 1, slot: 1 }],
  },
  {
    id: 'and-of-4', name: 'The "and" of 4', level: 2, bars: 1, source: 'ladder',
    blurb: 'One off-beat, at the end of the bar. Get this and the push is half learned.',
    hits: [{ beat: 0, slot: 0 }, { beat: 3, slot: 1 }],
  },
  {
    id: 'push-into-1', name: 'The push', level: 3, bars: 2, source: 'ladder',
    blurb: 'Three quarters, then the next bar arrives an eighth early and bar 2 is silent. This is the one that makes a head sound like jazz instead of like a metronome.',
    hits: [{ beat: 0, slot: 0 }, { beat: 1, slot: 0 }, { beat: 2, slot: 0 }, { beat: 3, slot: 1 }],
  },
  {
    id: 'push-into-3', name: 'Push the middle', level: 3, bars: 1, source: 'ladder',
    blurb: 'The same idea inside the bar: beat 3 arrives on the "and" of 2.',
    hits: [{ beat: 0, slot: 0 }, { beat: 1, slot: 1 }, { beat: 3, slot: 0 }],
  },
  {
    id: 'all-offbeats', name: 'Nothing on a downbeat', level: 4, bars: 1, source: 'ladder',
    blurb: 'Four off-beats in a row. Impossible to fake: if your eighths are straight, this falls apart.',
    hits: [{ beat: 0, slot: 1 }, { beat: 1, slot: 1 }, { beat: 2, slot: 1 }, { beat: 3, slot: 1 }],
  },
  {
    id: 'charleston-push', name: 'Charleston into a push', level: 4, bars: 2, source: 'ladder',
    blurb: 'Two figures joined: the Charleston, then the bar line pushed. Both bars are playing.',
    hits: [
      { beat: 0, slot: 0 }, { beat: 1, slot: 1 }, { beat: 3, slot: 1 },
      { beat: 5, slot: 1 }, { beat: 7, slot: 1 },
    ],
  },
  {
    id: 'two-bar-phrase', name: 'A two-bar phrase', level: 5, bars: 2, source: 'ladder',
    blurb: 'Mixed placement across two bars, the way a real line moves. Everything above, at once.',
    hits: [
      { beat: 0, slot: 0 }, { beat: 1, slot: 1 }, { beat: 2, slot: 0 }, { beat: 3, slot: 1 },
      { beat: 5, slot: 0 }, { beat: 6, slot: 1 }, { beat: 7, slot: 1 },
    ],
  },
];

export const FIGURE_BY_ID: Record<string, Figure> = Object.fromEntries(FIGURES.map((f) => [f.id, f]));

/** Where a hit falls, in beats from the start of the phrase. */
export function hitBeat(h: FigureHit, bpm: number, swing: boolean): number {
  return h.beat + (h.slot === 1 ? (swing ? swingRatio(bpm) : 0.5) : 0);
}

export function figureBeats(f: Figure, bpm: number, swing: boolean): number[] {
  return f.hits.map((h) => hitBeat(h, bpm, swing));
}

/**
 * A hit that belongs to the next bar: the off-beat of the last beat of a bar, with nothing on the
 * downbeat that follows. Named because it is the thing being taught, and because the grader has
 * to tell "you played the push on the downbeat" apart from "you were late".
 */
export function pushIndices(f: Figure, beatsPerBar = 4): number[] {
  const out: number[] = [];
  f.hits.forEach((h, i) => {
    if (h.slot !== 1) return;
    if ((h.beat + 1) % beatsPerBar !== 0) return;              // not the last beat of a bar
    const downbeat = h.beat + 1;
    if (f.hits.some((o) => o.beat === downbeat && o.slot === 0)) return;  // the downbeat is played too
    out.push(i);
  });
  return out;
}

/** "1 2 3 4&" — how a player counts the figure out loud. */
export function figureCount(f: Figure, beatsPerBar = 4): string {
  const bars: string[][] = Array.from({ length: f.bars }, () => []);
  for (const h of f.hits) {
    const bar = Math.floor(h.beat / beatsPerBar);
    if (!bars[bar]) continue;
    bars[bar]!.push(`${(h.beat % beatsPerBar) + 1}${h.slot === 1 ? '&' : ''}`);
  }
  return bars.map((b) => (b.length ? b.join(' ') : '–')).join(' | ');
}

/**
 * Cut a head you recorded into figures, one phrase at a time.
 *
 * This is what turns "the app has a rhythm ladder" into "drill the bars of this tune that you
 * keep flattening": the melody is yours, the placements come out of it, and the bars containing a
 * push can be practised on their own.
 */
export function figuresFromMelody(
  notes: Array<{ midi: number | null; start: number }>,
  opts: { bars?: number; beatsPerBar?: number; bpm?: number; swing?: boolean; totalBars?: number } = {},
): Figure[] {
  const barsPer = opts.bars ?? 2;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const swing = opts.swing ?? true;
  const off = swing ? swingRatio(opts.bpm ?? 140) : 0.5;
  const span = barsPer * beatsPerBar;
  const total = opts.totalBars ?? Math.ceil(Math.max(0, ...notes.map((n) => n.start + 1)) / beatsPerBar);

  const out: Figure[] = [];
  for (let start = 0; start < total; start += barsPer) {
    const from = start * beatsPerBar;
    const hits: FigureHit[] = [];
    for (const n of notes) {
      if (n.midi === null) continue;
      const rel = n.start - from;
      if (rel < 0 || rel >= span) continue;
      const beat = Math.floor(rel);
      const frac = rel - beat;
      // anything past the midpoint between the downbeat and the off-beat is the off-beat
      const slot: 0 | 1 = frac > off / 2 ? 1 : 0;
      const at = slot === 1 ? beat : Math.round(rel);
      if (!hits.some((h) => h.beat === at && h.slot === slot)) hits.push({ beat: at, slot });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.beat - b.beat || a.slot - b.slot);
    const f: Figure = {
      id: `head-${start + 1}`,
      name: `Bars ${start + 1}–${Math.min(total, start + barsPer)}`,
      blurb: '',
      bars: barsPer,
      hits,
      level: 3,
      source: 'head',
      fromBar: start,
    };
    const pushes = pushIndices(f, beatsPerBar);
    f.blurb = pushes.length
      ? `${pushes.length} push${pushes.length > 1 ? 'es' : ''} across the bar line: ${figureCount(f, beatsPerBar)}`
      : figureCount(f, beatsPerBar);
    out.push(f);
  }
  return out;
}
