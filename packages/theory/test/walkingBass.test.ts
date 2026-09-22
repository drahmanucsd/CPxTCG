import { describe, expect, it } from 'vitest';
import { BASS_HIGH, BASS_LOW, isApproach, walkingBass, type BassBar } from '../src/walkingBass.js';
import { parseChord } from '../src/chord.js';
import { midiName, pc } from '../src/pitch.js';

/** deterministic rng so a line is reproducible in tests */
function seeded(seed = 1) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

const bars = (spec: string): BassBar[] => {
  const cs = spec.split(' ').map((t) => parseChord(t));
  return cs.map((chord, i) => ({ chord, next: cs[i + 1] ?? null, beats: 4 }));
};

describe('walking bass', () => {
  const line = walkingBass(bars('Dm7 G7 Cmaj7'), { rng: seeded(3) });

  it('plays one note per beat', () => {
    expect(line).toHaveLength(12);
  });

  it('puts the root on beat 1 of every chord', () => {
    expect(pc(line[0]!)).toBe(parseChord('Dm7').root);
    expect(pc(line[4]!)).toBe(parseChord('G7').root);
    expect(pc(line[8]!)).toBe(parseChord('Cmaj7').root);
  });

  it('approaches the next root on the beat before the change', () => {
    expect(isApproach(line[3]!, parseChord('G7').root), `beat 4 was ${midiName(line[3]!)}`).toBe(true);
    expect(isApproach(line[7]!, parseChord('Cmaj7').root), `beat 8 was ${midiName(line[7]!)}`).toBe(true);
  });

  it('stays in range and never leaps more than an octave', () => {
    for (const n of line) { expect(n).toBeGreaterThanOrEqual(BASS_LOW); expect(n).toBeLessThanOrEqual(BASS_HIGH); }
    for (let i = 1; i < line.length; i++) expect(Math.abs(line[i]! - line[i - 1]!)).toBeLessThanOrEqual(12);
  });

  it('never repeats a note immediately', () => {
    for (let i = 1; i < line.length; i++) expect(line[i], `beat ${i}`).not.toBe(line[i - 1]);
  });

  it('mostly steps rather than leaping', () => {
    const steps = line.slice(1).filter((n, i) => Math.abs(n - line[i]!) <= 2).length;
    expect(steps / (line.length - 1)).toBeGreaterThan(0.5);
  });

  it('varies between choruses but stays correct', () => {
    const a = walkingBass(bars('Dm7 G7 Cmaj7'), { rng: seeded(1) });
    const b = walkingBass(bars('Dm7 G7 Cmaj7'), { rng: seeded(99), chorus: 3 });
    expect(a.join()).not.toBe(b.join());
    expect(pc(b[0]!)).toBe(parseChord('Dm7').root);
    expect(isApproach(b[3]!, parseChord('G7').root)).toBe(true);
  });

  it('plays two-feel as root and fifth', () => {
    const two = walkingBass(bars('Cmaj7 Fmaj7'), { feel: 'two', rng: seeded(5) });
    expect(pc(two[0]!)).toBe(0);
    expect(pc(two[1]!)).toBe(7);
  });

  it('handles a whole blues without breaking a rule', () => {
    const blues = bars('F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7');
    const l = walkingBass(blues, { rng: seeded(11) });
    expect(l).toHaveLength(48);
    for (let i = 0; i < blues.length; i++) {
      expect(pc(l[i * 4]!), `bar ${i + 1} beat 1`).toBe(blues[i]!.chord.root);
      if (blues[i]!.next) expect(isApproach(l[i * 4 + 3]!, blues[i]!.next!.root), `bar ${i + 1} beat 4`).toBe(true);
    }
  });
});
