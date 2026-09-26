import { describe, expect, it } from 'vitest';
import { type PlayedNote, compareMelody, parseAbc, subdivisionOf, swingPlacement, swingRatio } from '../src/index.js';

const BEAT = 0.5;                                   // 120 bpm
const r = swingRatio(120);

/** Play the written line back exactly as it should sound, then break one thing. */
function perform(src: string, swing = true): PlayedNote[] {
  return parseAbc(src).notes
    .filter((n) => n.midi !== null)
    .map((n) => ({
      midi: n.midi!,
      startBeat: swing ? swingPlacement(n.start, r) : n.start,
      beats: (swing ? swingPlacement(n.start + n.beats, r) : n.start + n.beats) - (swing ? swingPlacement(n.start, r) : n.start),
    }));
}

const cmp = (src: string, played: PlayedNote[], swing = true) =>
  compareMelody(parseAbc(src).notes, played, { beatDuration: BEAT, swing });

describe('swing placement', () => {
  it('moves written eighths late and leaves triplets alone', () => {
    expect(swingPlacement(0, r)).toBe(0);
    expect(swingPlacement(1.5, r)).toBeCloseTo(1 + r, 6);
    expect(swingPlacement(2 + 1 / 3, r)).toBeCloseTo(2 + 1 / 3, 6);   // already where swing is going
  });
  it('names the subdivision a note sits on', () => {
    expect(subdivisionOf(3)).toBe('beat');
    expect(subdivisionOf(3.5)).toBe('eighth');
    expect(subdivisionOf(3 + 2 / 3)).toBe('triplet');
    expect(subdivisionOf(3.25)).toBe('other');
  });
});

describe('compareMelody', () => {
  const LINE = 'M:4/4\nL:1/4\nK:C\nC D E F | G4 |';

  it('the written line played as written is clean', () => {
    const c = cmp(LINE, perform(LINE));
    expect(c.score).toBe(1);
    expect(c.headline).toBe('Note for note, in time');
    expect(c.counts.clean).toBe(5);
  });

  it('a swung head played straight is not scored as five mistakes', () => {
    // every off-beat is where the written page puts it, but the band is swinging
    const src = 'M:4/4\nL:1/8\nK:C\nCDEF GABc |';
    const straight = perform(src, false);
    const c = compareMelody(parseAbc(src).notes, straight, { beatDuration: BEAT, swing: true });
    // the off-beats are early against a swing feel, but the *notes* are all right
    expect(c.counts.wrongPitch).toBe(0);
    expect(c.counts.missed).toBe(0);
    expect(c.swing!.verdict).toBe('straighter');
    expect(c.detail.join(' ')).toMatch(/straighter than the groove/);
  });

  it('F sharp for F natural is named, with the direction', () => {
    const played = perform(LINE);
    played[3] = { ...played[3]!, midi: played[3]!.midi + 1 };
    const c = cmp(LINE, played);
    expect(c.counts.wrongPitch).toBe(1);
    const bad = c.notes.find((n) => n.verdict === 'wrongPitch')!;
    expect(bad.message).toBe('You played F♯4; the book has F4 — 1 semitone above.');
    expect(c.headline).toBe('1 wrong note');
  });

  it('a held note struck twice is a split, not a spare note', () => {
    // the book holds G for a whole bar; the recording re-articulates it on beat 3
    const played = perform(LINE);
    played.push({ midi: 67, startBeat: 6, beats: 2 });
    const c = cmp(LINE, played);
    expect(c.counts.split).toBe(1);
    const g = c.notes.find((n) => n.verdict === 'split')!;
    expect(g.restrikes).toBe(1);
    expect(g.message).toMatch(/holds this G4; you struck it again/);
    expect(c.extra).toHaveLength(0);           // it is a duration error, not an extra note
    expect(c.headline).toMatch(/durations are not/);
  });

  it('running two written notes together is a merge', () => {
    const played = perform(LINE).filter((_, i) => i !== 1);
    played[0] = { ...played[0]!, beats: 2 };   // C held through where D belongs
    const c = cmp(LINE, played);
    expect(c.counts.merged).toBe(1);
    expect(c.notes[1]!.message).toMatch(/Held through it/);
  });

  it('an anticipation played on the downbeat is flat, not late', () => {
    // an eighth on the "and of 4", tied over the bar line
    const src = 'M:4/4\nL:1/8\nK:C\nz6 C C-|C8 |';
    const played: PlayedNote[] = [
      { midi: 60, startBeat: 3, beats: 0.5 },
      { midi: 60, startBeat: 4, beats: 4 },     // on the 1 instead of the "and of 4"
    ];
    const c = compareMelody(parseAbc(src).notes, played, { beatDuration: BEAT, swing: true });
    const flat = c.notes.find((n) => n.verdict === 'flat')!;
    expect(flat).toBeTruthy();
    expect(flat.anticipates).toBe(true);
    expect(flat.message).toMatch(/Written on the "4 and" and tied over the bar line — you played it on the 1/);
    expect(c.headline).toMatch(/1 syncopation flattened/);
  });

  it('an eighth-note triplet sits three to a beat', () => {
    // L:1/8 with (3 is the jazz triplet: three notes inside one beat
    const n = parseAbc('M:4/4\nL:1/8\nK:C\n(3CDE F2 z4 |').notes;
    expect(n.map((x) => x.start)).toEqual([0, 1 / 3, 2 / 3, 1, 2]);
  });

  it('the middle of a triplet played as an eighth is named as that, not as lateness', () => {
    const src = 'M:4/4\nL:1/8\nK:C\n(3CDE F2 z4 |';
    const played = perform(src, false);
    played[1] = { ...played[1]!, startBeat: 0.5 };       // subdivided the beat in two, not three
    const c = compareMelody(parseAbc(src).notes, played, { beatDuration: BEAT, swing: false });
    const mid = c.notes[1]!;
    expect(mid.subdivision).toBe('triplet');
    expect(mid.verdict).toBe('late');
    expect(mid.message).toBe('You played it as an eighth. It is the middle of a triplet — "1 trip".');
  });

  it('a tolerance can never be wide enough to confuse a triplet with an eighth', () => {
    // 1/3 to 1/2 of a beat is 83 ms at 120: a flat 90 ms window would call this clean
    const src = 'M:4/4\nL:1/8\nK:C\n(3CDE F2 z4 |';
    const played = perform(src, false);
    played[1] = { ...played[1]!, startBeat: 0.5 };
    const c = compareMelody(parseAbc(src).notes, played, { beatDuration: BEAT, swing: false, windowMs: 200 });
    expect(c.notes[1]!.verdict).not.toBe('clean');
  });

  it('points at the bars worth practising', () => {
    const played = perform(LINE);
    played[3] = { ...played[3]!, midi: played[3]!.midi + 1 };
    const c = cmp(LINE, played);
    expect(c.worstBars[0]).toEqual({ bar: 0, problems: 1, why: 'wrong note' });
  });

  it('notes that belong to nothing are extra', () => {
    const played = [...perform(LINE), { midi: 61, startBeat: 9.5, beats: 0.5 }];
    const c = cmp(LINE, played);
    expect(c.extra).toHaveLength(1);
    expect(c.detail.join(' ')).toMatch(/not in the melody/);
  });
});

describe('finding the performance before grading it', () => {
  const LINE = 'M:4/4\nL:1/4\nK:C\nC D E F | G4 |';

  it('a phrase that comes in a bar late is still the right notes', () => {
    const played = parseAbc(LINE).notes
      .filter((n) => n.midi !== null)
      .map((n) => ({ midi: n.midi!, startBeat: n.start + 4, beats: n.beats }));
    const c = compareMelody(parseAbc(LINE).notes, played, { beatDuration: BEAT, swing: false });
    expect(c.counts.wrongPitch).toBe(0);
    expect(c.counts.missed).toBe(0);
    expect(c.score).toBe(1);
    expect(c.shiftBeats).toBeCloseTo(4, 1);
    expect(c.detail[0]).toMatch(/came in about 4.0 beats late/);
  });

  it('a small lay-back is not reported as coming in late', () => {
    const played = parseAbc(LINE).notes
      .filter((n) => n.midi !== null)
      .map((n) => ({ midi: n.midi!, startBeat: n.start + 0.06, beats: n.beats }));
    const c = compareMelody(parseAbc(LINE).notes, played, { beatDuration: BEAT, swing: false });
    expect(c.score).toBe(1);
    expect(c.detail.join(' ')).not.toMatch(/came in/);
  });

  it('shifting does not turn a genuinely wrong note into a right one', () => {
    const played = parseAbc(LINE).notes
      .filter((n) => n.midi !== null)
      .map((n, i) => ({ midi: n.midi! + (i === 2 ? 1 : 0), startBeat: n.start + 2, beats: n.beats }));
    const c = compareMelody(parseAbc(LINE).notes, played, { beatDuration: BEAT, swing: false });
    expect(c.counts.wrongPitch).toBe(1);
    expect(c.counts.clean).toBe(4);
  });
});
