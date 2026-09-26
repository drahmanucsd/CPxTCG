import { describe, expect, it } from 'vitest';
import { alignMelody, gradeMelody, parseAbc, quantise, shortBars, toAbc, transposeMelody } from '../src/melody.js';
import { midiName } from '../src/pitch.js';

const names = (src: string) => parseAbc(src).notes.map((n) => (n.midi === null ? 'z' : midiName(n.midi)));

describe('ABC parsing', () => {
  it('reads letters, octaves and rests', () => {
    expect(names('X:1\nL:1/4\nK:C\nC D E F | G z A2 |')).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'z', 'A4']);
  });
  it('applies the key signature', () => {
    expect(names('X:1\nL:1/4\nK:F\nB c d |')).toEqual(['Bb4', 'C5', 'D5']);
    // D major sharpens F and C; midiName spells sharps as their flat enharmonic
    expect(names('X:1\nL:1/4\nK:D\nF G c |')).toEqual(['Gb4', 'G4', 'Db5']);
  });
  it('honours explicit accidentals and keeps them for the rest of the bar', () => {
    expect(names('X:1\nL:1/4\nK:C\n^F F | F |')).toEqual(['Gb4', 'Gb4', 'F4']);
  });
  it('reads octave marks', () => {
    expect(names("X:1\nL:1/4\nK:C\nC, C c c' |")).toEqual(['C3', 'C4', 'C5', 'C6']);
  });
  it('reads durations, including halves', () => {
    const m = parseAbc('X:1\nL:1/4\nK:C\nC2 D D/2 |');
    expect(m.notes.map((n) => n.beats)).toEqual([2, 1, 0.5]);
    expect(m.notes.map((n) => n.start)).toEqual([0, 2, 3]);
  });
  it('takes the beat unit from L:', () => {
    expect(parseAbc('X:1\nL:1/8\nK:C\nC D |').notes.map((n) => n.beats)).toEqual([0.5, 0.5]);
  });
});

describe('melody grading', () => {
  const line = parseAbc('X:1\nL:1/4\nK:C\nC D E F |').notes;
  it('accepts the right notes in any octave', () => {
    expect(gradeMelody(line, [60, 62, 64, 65]).ok).toBe(true);
    expect(gradeMelody(line, [72, 74, 76, 77]).ok).toBe(true);
  });
  it('ignores rhythm entirely — a head is phrased, not transcribed', () => {
    // same pitches, wildly different placement: still the melody
    expect(gradeMelody(line, [60, 62, 64, 65]).match).toBe(1);
  });
  it('tolerates an added passing note', () => {
    expect(gradeMelody(line, [60, 61, 62, 64, 65]).ok).toBe(true);
  });
  it('rejects a different line', () => {
    expect(gradeMelody(line, [67, 69, 71, 72]).ok).toBe(false);
  });
  it('reports what was missing', () => {
    const v = gradeMelody(line, [60, 62]);
    expect(v.ok).toBe(false);
    expect(v.missing).toContain(4);
  });
});

describe('round trip', () => {
  it('survives ABC → melody → ABC', () => {
    const src = 'X:1\nL:1/4\nK:C\nC D E F | G2 A2 |';
    const once = parseAbc(src);
    const twice = parseAbc(toAbc(once));
    expect(twice.notes.map((n) => n.midi)).toEqual(once.notes.map((n) => n.midi));
    expect(twice.notes.map((n) => n.beats)).toEqual(once.notes.map((n) => n.beats));
  });
  it('transposes', () => {
    const m = transposeMelody(parseAbc('X:1\nL:1/4\nK:C\nC E G |'), 2);
    expect(m.notes.map((n) => n.midi)).toEqual([62, 66, 69]);
  });
  it('quantises a recorded performance to the grid', () => {
    const m = quantise([{ midi: 60, startBeat: 0.03, beats: 0.94 }, { midi: 64, startBeat: 1.06, beats: 0.48 }]);
    expect(m.notes.map((n) => n.start)).toEqual([0, 1]);
    expect(m.source).toBe('recorded');
  });
});

describe('alignMelody', () => {
  const head = parseAbc('M:4/4\nL:1/4\nK:C\nC D E F |').notes;

  it('pairs each written note with the note that played it', () => {
    const a = alignMelody(head, [60, 62, 64, 65]);
    expect(a.pairs).toEqual([{ want: 0, got: 0 }, { want: 1, got: 1 }, { want: 2, got: 2 }, { want: 3, got: 3 }]);
    expect(a.missed).toEqual([]);
    expect(a.extra).toEqual([]);
  });

  it('a passing note between two written ones is extra, not a mismatch', () => {
    const a = alignMelody(head, [60, 62, 63, 64, 65]);
    expect(a.pairs.map((p) => p.got)).toEqual([0, 1, 3, 4]);
    expect(a.extra).toEqual([2]);
    expect(a.missed).toEqual([]);
  });

  it('reports which written note was dropped, by its index in the melody', () => {
    const a = alignMelody(head, [60, 62, 65]);
    expect(a.missed).toEqual([2]);
    expect(a.pairs.map((p) => p.want)).toEqual([0, 1, 3]);
  });

  it('matches across octaves unless told not to', () => {
    expect(alignMelody(head, [72, 74, 76, 77]).pairs).toHaveLength(4);
    expect(alignMelody(head, [72, 74, 76, 77], { octaveSensitive: true }).pairs).toHaveLength(0);
  });
});

describe('notation a fake book actually uses', () => {
  const starts = (src: string) => parseAbc(src).notes.map((n) => [n.start, n.beats]);

  it('a tie is one held note, not two', () => {
    // the anticipation as it is written: an eighth on the "and of 4", tied over the bar line
    const tied = parseAbc('M:4/4\nL:1/8\nK:C\nz6 G G-|G8 |');
    const struck = tied.notes.filter((n) => n.midi !== null);
    expect(struck).toHaveLength(2);
    expect(struck[1]!.start).toBe(3.5);
    expect(struck[1]!.beats).toBe(4.5);          // held through the whole of bar 2
    // the same line without the tie is two attacks, which is the mistake being diagnosed
    const split = parseAbc('M:4/4\nL:1/8\nK:C\nz6 G G|G8 |');
    expect(split.notes.filter((n) => n.midi !== null)).toHaveLength(3);
  });

  it('a tie only joins the same pitch', () => {
    const m = parseAbc('M:4/4\nL:1/4\nK:C\nC-D C-C |');
    expect(m.notes.map((n) => n.beats)).toEqual([1, 1, 2]);
  });

  it('triplets are three in the time of two', () => {
    expect(starts('M:4/4\nL:1/4\nK:C\n(3CDE F |')).toEqual([
      [0, 2 / 3], [2 / 3, 2 / 3], [4 / 3, 2 / 3], [2, 1],
    ]);
  });

  it('the tuplet only covers its own notes', () => {
    const n = parseAbc('M:4/4\nL:1/8\nK:C\n(3CDE FGAB |').notes;
    expect(n.slice(0, 3).every((x) => Math.abs(x.beats - 1 / 3) < 1e-9)).toBe(true);
    expect(n.slice(3).every((x) => x.beats === 0.5)).toBe(true);
  });

  it('broken rhythm dots the first and halves the second', () => {
    expect(starts('M:4/4\nL:1/4\nK:C\nC>D E |')).toEqual([[0, 1.5], [1.5, 0.5], [2, 1]]);
    expect(starts('M:4/4\nL:1/4\nK:C\nC<D E |')).toEqual([[0, 0.5], [0.5, 1.5], [2, 1]]);
  });
});

describe('shortBars', () => {
  it('catches a bar that does not add up, because it shifts everything after it', () => {
    expect(shortBars(parseAbc('M:4/4\nL:1/4\nK:C\nC D E | F G A B | c4 |'))).toEqual([{ bar: 0, beats: 3 }]);
    expect(shortBars(parseAbc('M:4/4\nL:1/4\nK:C\nC D E z | F G A B | c4 |'))).toEqual([]);
  });
  it('lets the last bar be short, because heads end mid-bar', () => {
    expect(shortBars(parseAbc('M:4/4\nL:1/4\nK:C\nC D E F | G2 |'))).toEqual([]);
  });
});
