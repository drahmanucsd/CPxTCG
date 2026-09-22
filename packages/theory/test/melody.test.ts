import { describe, expect, it } from 'vitest';
import { gradeMelody, parseAbc, quantise, toAbc, transposeMelody } from '../src/melody.js';
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
