import { describe, expect, it } from 'vitest';
import { formatChord } from '../src/chord.js';
import { blues, cycle, iiVI, iiVIAllKeys, keySequence, parseProgression, turnaround } from '../src/progressions.js';
import { chordToRoman, keyOf, romanProgression, romanToChord } from '../src/roman.js';

const f = (p: { chord: import('../src/chord.js').ChordSymbol }[]) => p.map((x) => formatChord(x.chord, 'plain')).join(' ');

describe('roman numerals', () => {
  const C = keyOf('C');
  it('diatonic', () => {
    expect(formatChord(romanToChord('ii-7', C), 'plain')).toBe('Dm7');
    expect(formatChord(romanToChord('V7', C), 'plain')).toBe('G7');
    expect(formatChord(romanToChord('IΔ7', C), 'plain')).toBe('Cmaj7');
    expect(formatChord(romanToChord('viiø7', C), 'plain')).toBe('Bm7b5');
    expect(formatChord(romanToChord('ii7', C), 'plain')).toBe('Dm7');
    expect(formatChord(romanToChord('ii', C, { seventh: true }), 'plain')).toBe('Dm7');
    expect(formatChord(romanToChord('vi', C), 'plain')).toBe('Am');
  });
  it('chromatic and secondary', () => {
    expect(formatChord(romanToChord('bVII7', C), 'plain')).toBe('Bb7');
    expect(formatChord(romanToChord('#iv°7', C), 'plain')).toBe('F#dim7');
    expect(formatChord(romanToChord('V7/ii', C), 'plain')).toBe('A7');
    expect(formatChord(romanToChord('V7/V', C), 'plain')).toBe('D7');
    expect(formatChord(romanToChord('subV7', C), 'plain')).toBe('Db7');
    expect(formatChord(romanToChord('subV7/ii', C), 'plain')).toBe('Eb7');
    expect(formatChord(romanToChord('bIII7', keyOf('Eb')), 'plain')).toBe('Gb7');
  });
  it('minor key', () => {
    const cm = keyOf('C', 'minor');
    expect(formatChord(romanToChord('iiø7', cm), 'plain')).toBe('Dm7b5');
    expect(formatChord(romanToChord('V7b9', cm), 'plain')).toBe('G7b9');
    expect(formatChord(romanToChord('bVIΔ7', cm), 'plain')).toBe('Abmaj7');
  });
  it('chord → roman', () => {
    expect(chordToRoman(romanToChord('ii-7', C), C)).toBe('ii-7');
    expect(chordToRoman(romanToChord('bVII7', C), C)).toBe('bVII7');
    expect(chordToRoman(romanToChord('#iv°7', C), C)).toBe('#iv°7');
    expect(chordToRoman(romanToChord('VI7', C), C)).toBe('VI7');
    expect(chordToRoman(romanToChord('IΔ7', keyOf('F')), keyOf('F'))).toBe('IΔ7');
  });
  it('progression text', () => {
    expect(f(romanProgression('ii-7 V7 IΔ7', keyOf('F')).map((chord) => ({ chord })))).toBe('Gm7 C7 Fmaj7');
  });
});

describe('generators', () => {
  it('ii-V-I major/minor', () => {
    expect(f(iiVI(0))).toBe('Dm7 G7 Cmaj7');
    expect(f(iiVI(0, { minor: true }))).toBe('Dm7b5 G7b9 Cm6');
    expect(f(iiVI(10))).toBe('Cm7 F7 Bbmaj7');
    expect(f(iiVI(6))).toBe('G#m7 C#7 F#maj7');
    expect(f(iiVI(0, { shape: 'iiVIVI' }))).toBe('Dm7 G7 Cmaj7 A7');
  });
  it('key sequences', () => {
    expect(keySequence('fourths', 0).slice(0, 4)).toEqual([0, 5, 10, 3]);
    expect(keySequence('fifths', 0).slice(0, 4)).toEqual([0, 7, 2, 9]);
    expect(keySequence('wholeStepUp', 0)).toHaveLength(12);
    expect(new Set(keySequence('minorThirds', 0)).size).toBe(12);
    expect(new Set(keySequence('random', 0, () => 0.42)).size).toBe(12);
  });
  it('all keys covers 36 chords', () => { expect(iiVIAllKeys('fourths')).toHaveLength(36); });
  it('cycle of dom7 in 4ths', () => { expect(f(cycle('7', 'fourths', { start: 0 })).split(' ').slice(0, 5)).toEqual(['C7', 'F7', 'Bb7', 'Eb7', 'Ab7']); });
  it('turnarounds', () => {
    expect(f(turnaround('IviiiV', 0))).toBe('Cmaj7 Am7 Dm7 G7');
    expect(f(turnaround('tritone', 0))).toBe('Cmaj7 Eb7 Ab7 Db7');
    expect(f(turnaround('coltrane', 11))).toBe('Bmaj7 D7 Gmaj7 A#7 D#maj7 F#7 Bmaj7');
    expect(f(turnaround('coltrane', 3))).toBe('Ebmaj7 Gb7 Bmaj7 D7 Gmaj7 Bb7 Ebmaj7');
  });
  it('blues', () => {
    const b = blues('jazz', 5);
    expect(b.reduce((s, c) => s + c.beats, 0)).toBe(48);
    expect(formatChord(b[0]!.chord, 'plain')).toBe('F7');
    expect(formatChord(b[6]!.chord, 'plain')).toBe('Bdim7');
  });
  it('custom progression parsing', () => {
    const p = parseProgression('| Dm7 G7 | Cmaj7 % | Cmaj7 |');
    expect(p.map((c) => c.beats)).toEqual([2, 2, 2, 2, 4]);
    expect(f(p)).toBe('Dm7 G7 Cmaj7 Cmaj7 Cmaj7');
    expect(f(parseProgression('ii-7 V7 IΔ7', { key: keyOf('Bb') }))).toBe('Cm7 F7 Bbmaj7');
    expect(f(parseProgression('Am7 D7 Gmaj7'))).toBe('Am7 D7 Gmaj7');
  });
});
