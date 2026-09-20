import { describe, expect, it } from 'vitest';
import { makeChord, parseChord } from '../src/chord.js';
import { midiName, pc, type PitchClass } from '../src/pitch.js';
import { leadProgression, motionCost } from '../src/voiceLeading.js';

const names = (ns: number[]) => ns.map((x) => midiName(x)).join(' ');

describe('motionCost', () => {
  it('is zero for identical', () => { expect(motionCost([60, 64, 67], [60, 64, 67])).toBe(0); });
  it('sums semitone motion', () => { expect(motionCost([60, 64, 67], [59, 64, 67])).toBe(1); });
  it('charges unmatched voices', () => { expect(motionCost([60, 64], [60, 64, 67])).toBe(6); });
});

describe('ii-V-I voice leading (rootless A/B)', () => {
  for (let key = 0; key < 12; key++) {
    it(`alternates A/B and stays in the box in key ${midiName(60 + key).slice(0, -1)}`, () => {
      const k = key as PitchClass;
      const chords = [makeChord(pc(k + 2), 'm7'), makeChord(pc(k + 7), '7'), makeChord(k, 'maj7')];
      const led = leadProgression(chords, { families: ['rootlessA', 'rootlessB'] });
      expect(led.every(Boolean)).toBe(true);
      const fams = led.map((v) => v!.family);
      // A→B→A or B→A→B
      expect(fams[0]).not.toBe(fams[1]);
      expect(fams[1]).not.toBe(fams[2]);
      // motion between consecutive chords is small (≤ 2 semitones per voice on average)
      for (let i = 1; i < led.length; i++) {
        expect(motionCost(led[i - 1]!.notes, led[i]!.notes), `${names(led[i - 1]!.notes)} → ${names(led[i]!.notes)}`).toBeLessThanOrEqual(8);
      }
      for (const v of led) { expect(v!.notes[0]!).toBeGreaterThanOrEqual(48); expect(v!.notes[v!.notes.length - 1]!).toBeLessThanOrEqual(72); }
    });
  }
  it('Dm7 G7 Cmaj7 gives the textbook voicings', () => {
    const led = leadProgression(['Dm7', 'G7', 'Cmaj7'].map(parseChord), { families: ['rootlessA', 'rootlessB'] });
    expect(names(led[0]!.notes)).toBe('F3 A3 C4 E4');
    expect(names(led[1]!.notes)).toBe('F3 A3 B3 E4');
    expect(names(led[2]!.notes)).toBe('E3 G3 B3 D4');
  });
  it('a 24-chord cycle of ii-Vs never leaves the register box', () => {
    const chords = [];
    let k = 0;
    for (let i = 0; i < 12; i++) { chords.push(makeChord(pc(k + 2), 'm7'), makeChord(pc(k + 7), '7')); k = pc(k + 5); }
    const led = leadProgression(chords, { families: ['rootlessA', 'rootlessB'] });
    for (const v of led) { expect(v!.notes[0]!).toBeGreaterThanOrEqual(48); expect(v!.notes[3]!).toBeLessThanOrEqual(72); }
  });
  it('drop2 cycle keeps motion small', () => {
    const chords = ['Cmaj7', 'Fmaj7', 'Bbmaj7', 'Ebmaj7', 'Abmaj7', 'Dbmaj7'].map(parseChord);
    const led = leadProgression(chords, { families: ['drop2'] });
    for (let i = 1; i < led.length; i++) expect(motionCost(led[i - 1]!.notes, led[i]!.notes)).toBeLessThanOrEqual(10);
  });
});
