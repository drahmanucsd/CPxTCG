/**
 * Groove: the timing and rhythm data the band plays, as pure functions so it can be tested
 * without an AudioContext.
 *
 * The audio layer turns these into scheduled events; nothing here knows about Web Audio.
 */

/**
 * Swing ratio — how long the first eighth of a pair is, as a fraction of the beat.
 *
 * A fixed 2:1 (0.667) sounds mechanical at both ends of the tempo range: slow swing is much more
 * dotted, and fast swing flattens out until it is nearly even. Roughly 3:1 at 80, 2:1 at 140,
 * and 1.3:1 at 220, interpolated.
 */
export function swingRatio(bpm: number): number {
  const pts: Array<[number, number]> = [[60, 0.76], [80, 0.75], [140, 0.667], [180, 0.62], [220, 0.565], [300, 0.54]];
  if (bpm <= pts[0]![0]) return pts[0]![1];
  if (bpm >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (bpm <= x1) return y0 + ((bpm - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0.667;
}

/** Where the off-beat eighth sits, in beats after the downbeat of that beat. */
export function offbeatAt(bpm: number, swing: boolean): number {
  return swing ? swingRatio(bpm) : 0.5;
}

export interface Hit {
  /** beats from the start of the bar */
  at: number;
  /** 0..1 */
  vel: number;
}

/**
 * Snare comping vocabulary — where a drummer actually puts accents behind a soloist.
 * Indexed loosely: the caller picks by density, so early choruses are sparse.
 */
export const COMP_FIGURES: Hit[][] = [
  [],                                                   // lay out
  [{ at: 1.66, vel: 0.5 }],                             // and of 2
  [{ at: 3.66, vel: 0.5 }],                             // and of 4
  [{ at: 0, vel: 0.45 }, { at: 1.66, vel: 0.55 }],      // Charleston
  [{ at: 1.66, vel: 0.5 }, { at: 3.66, vel: 0.45 }],
  [{ at: 2, vel: 0.4 }, { at: 3.66, vel: 0.55 }],
];

/** Piano comping rhythms, in beats from the start of the bar. */
export const COMP_RHYTHMS: Hit[][] = [
  [{ at: 0, vel: 0.55 }],                                        // whole note
  [{ at: 0, vel: 0.5 }, { at: 1.66, vel: 0.6 }],                 // Charleston
  [{ at: 1, vel: 0.5 }, { at: 3, vel: 0.5 }],                    // 2 and 4
  [{ at: 3.66, vel: 0.6 }],                                      // anticipate the next bar
  [{ at: 0, vel: 0.5 }, { at: 2.66, vel: 0.5 }],
  [{ at: 1.66, vel: 0.55 }, { at: 3.66, vel: 0.5 }],
];

/**
 * Pick a figure for this bar. Density rises across choruses so the band opens up rather than
 * playing the same intensity for five minutes.
 */
export function pickFigure(figures: Hit[][], bar: number, chorus: number, rng: () => number): Hit[] {
  const density = Math.min(0.85, 0.2 + chorus * 0.18);
  if (rng() > density) return [];
  // section ends get something, mid-phrase bars often get nothing
  const weight = (bar + 1) % 4 === 0 ? 1 : 0.6;
  if (rng() > weight) return [];
  return figures[1 + Math.floor(rng() * (figures.length - 1))] ?? [];
}

/** Bars where a fill belongs: the last bar of each eight, and the bar before the top. */
export function isFillBar(barInForm: number, formBars: number): boolean {
  const b = barInForm + 1;
  return b === formBars || b % 8 === 0;
}

/**
 * Human feel. Fixed tempo, but not fixed placement: a rhythm section is a set of players who
 * disagree slightly about where the beat is, and that disagreement is the sound.
 */
export interface Feel {
  /** seconds; negative is ahead of the beat */
  bassOffset: number;
  rideOffset: number;
  /** multiply a velocity by 1 ± this */
  velocityJitter: number;
  /** seconds of random placement noise */
  timingJitter: number;
}

export const DEFAULT_FEEL: Feel = {
  bassOffset: -0.004,
  rideOffset: 0.006,
  velocityJitter: 0.1,
  timingJitter: 0.006,
};

export function humanise(time: number, vel: number, feel: Feel, rng: () => number, offset = 0): { time: number; vel: number } {
  return {
    time: time + offset + (rng() * 2 - 1) * feel.timingJitter,
    vel: Math.max(0.05, Math.min(1, vel * (1 + (rng() * 2 - 1) * feel.velocityJitter))),
  };
}
