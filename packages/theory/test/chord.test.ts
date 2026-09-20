import { describe, expect, it } from 'vitest';
import { chordTones, formatChord, parseChord, parseChartToken, qualityClass, transposeChord, type QualityClass } from '../src/chord.js';

// [input, root pc, quality class, members (semitones from root), bass pc | null]
const TABLE: Array<[string, number, QualityClass, number[], (number | null)?]> = [
  // major family
  ['C', 0, 'maj', [0, 4, 7]],
  ['Cmaj7', 0, 'maj7', [0, 4, 7, 11]],
  ['CΔ7', 0, 'maj7', [0, 4, 7, 11]],
  ['CΔ', 0, 'maj7', [0, 4, 7, 11]],
  ['C∆7', 0, 'maj7', [0, 4, 7, 11]],
  ['CM7', 0, 'maj7', [0, 4, 7, 11]],
  ['Cma7', 0, 'maj7', [0, 4, 7, 11]],
  ['CMaj7', 0, 'maj7', [0, 4, 7, 11]],
  ['Cmaj9', 0, 'maj7', [0, 2, 4, 7, 11]],
  ['Cmaj13', 0, 'maj7', [0, 2, 4, 7, 9, 11]],
  ['Cmaj7#11', 0, 'maj7', [0, 4, 6, 7, 11]],
  ['CΔ7(#11)', 0, 'maj7', [0, 4, 6, 7, 11]],
  ['Cmaj7#5', 0, 'maj7', [0, 4, 8, 11]],
  ['C6', 0, 'maj6', [0, 4, 7, 9]],
  ['C69', 0, 'maj6', [0, 2, 4, 7, 9]],
  ['C6/9', 0, 'maj6', [0, 2, 4, 7, 9]],
  ['Cadd9', 0, 'maj', [0, 2, 4, 7]],
  ['C2', 0, 'maj', [0, 2, 4, 7]],
  ['C5', 0, 'power', [0, 7]],
  // minor family
  ['Cm', 0, 'min', [0, 3, 7]],
  ['C-', 0, 'min', [0, 3, 7]],
  ['Cmin', 0, 'min', [0, 3, 7]],
  ['Cm7', 0, 'min7', [0, 3, 7, 10]],
  ['C-7', 0, 'min7', [0, 3, 7, 10]],
  ['Cmin7', 0, 'min7', [0, 3, 7, 10]],
  ['Cmi7', 0, 'min7', [0, 3, 7, 10]],
  ['Cm9', 0, 'min7', [0, 2, 3, 7, 10]],
  ['C-9', 0, 'min7', [0, 2, 3, 7, 10]],
  ['Cm11', 0, 'min7', [0, 2, 3, 5, 7, 10]],
  ['Cm13', 0, 'min7', [0, 2, 3, 7, 9, 10]],
  ['Cm6', 0, 'min6', [0, 3, 7, 9]],
  ['C-6', 0, 'min6', [0, 3, 7, 9]],
  ['Cm6/9', 0, 'min6', [0, 2, 3, 7, 9]],
  ['CmMaj7', 0, 'minmaj7', [0, 3, 7, 11]],
  ['Cm(maj7)', 0, 'minmaj7', [0, 3, 7, 11]],
  ['C-Δ7', 0, 'minmaj7', [0, 3, 7, 11]],
  ['C-Δ', 0, 'minmaj7', [0, 3, 7, 11]],
  ['CminMaj7', 0, 'minmaj7', [0, 3, 7, 11]],
  ['Cm(Δ9)', 0, 'minmaj7', [0, 2, 3, 7, 11]],
  // dominant family
  ['C7', 0, 'dom7', [0, 4, 7, 10]],
  ['C9', 0, 'dom7', [0, 2, 4, 7, 10]],
  ['C11', 0, 'dom7', [0, 2, 4, 5, 7, 10]],
  ['C13', 0, 'dom7', [0, 2, 4, 7, 9, 10]],
  ['C7b9', 0, 'dom7', [0, 1, 4, 7, 10]],
  ['C7(b9)', 0, 'dom7', [0, 1, 4, 7, 10]],
  ['C7-9', 0, 'dom7', [0, 1, 4, 7, 10]],
  ['C7#9', 0, 'dom7', [0, 3, 4, 7, 10]],
  ['C7+9', 0, 'dom7', [0, 3, 4, 7, 10]],
  ['C7#11', 0, 'dom7', [0, 4, 6, 7, 10]],
  ['C7b13', 0, 'dom7', [0, 4, 7, 8, 10]],
  ['C7(b9,#11)', 0, 'dom7', [0, 1, 4, 6, 7, 10]],
  ['C7b9b13', 0, 'dom7', [0, 1, 4, 7, 8, 10]],
  ['C7#9b13', 0, 'dom7', [0, 3, 4, 7, 8, 10]],
  ['C13b9', 0, 'dom7', [0, 1, 4, 7, 9, 10]],
  ['C7b5', 0, 'dom7', [0, 4, 6, 10]],
  ['C7#5', 0, 'aug7', [0, 4, 8, 10]],
  ['C7+', 0, 'aug7', [0, 4, 8, 10]],
  ['C+7', 0, 'aug7', [0, 4, 8, 10]],
  ['Caug7', 0, 'aug7', [0, 4, 8, 10]],
  ['C+', 0, 'aug', [0, 4, 8]],
  ['Caug', 0, 'aug', [0, 4, 8]],
  ['C7alt', 0, 'alt', [0, 1, 3, 4, 6, 7, 8, 10]],
  ['C7sus4', 0, 'dom7sus', [0, 5, 7, 10]],
  ['C7sus', 0, 'dom7sus', [0, 5, 7, 10]],
  ['C9sus4', 0, 'dom7sus', [0, 2, 5, 7, 10]],
  ['C13sus4', 0, 'dom7sus', [0, 2, 5, 7, 9, 10]],
  ['Csus', 0, 'sus4', [0, 5, 7]],
  ['Csus4', 0, 'sus4', [0, 5, 7]],
  ['Csus2', 0, 'sus2', [0, 2, 7]],
  // half-dim / dim
  ['Cø', 0, 'halfdim', [0, 3, 6, 10]],
  ['Cø7', 0, 'halfdim', [0, 3, 6, 10]],
  ['Cm7b5', 0, 'halfdim', [0, 3, 6, 10]],
  ['C-7b5', 0, 'halfdim', [0, 3, 6, 10]],
  ['Cmin7b5', 0, 'halfdim', [0, 3, 6, 10]],
  ['C-7(b5)', 0, 'halfdim', [0, 3, 6, 10]],
  ['C°7', 0, 'dim7', [0, 3, 6, 9]],
  ['Cdim7', 0, 'dim7', [0, 3, 6, 9]],
  ['Co7', 0, 'dim7', [0, 3, 6, 9]],
  ['C°', 0, 'dim7', [0, 3, 6]],
  ['Cdim', 0, 'dim7', [0, 3, 6]],
  // roots & slashes
  ['Eb7', 3, 'dom7', [0, 4, 7, 10]],
  ['E♭7', 3, 'dom7', [0, 4, 7, 10]],
  ['F#m7b5', 6, 'halfdim', [0, 3, 6, 10]],
  ['F♯ø', 6, 'halfdim', [0, 3, 6, 10]],
  ['Bbmaj7', 10, 'maj7', [0, 4, 7, 11]],
  ['Ab-7', 8, 'min7', [0, 3, 7, 10]],
  ['C/E', 0, 'maj', [0, 4, 7], 4],
  ['C7/Bb', 0, 'dom7', [0, 4, 7, 10], 10],
  ['F#m7b5/A', 6, 'halfdim', [0, 3, 6, 10], 9],
  ['Dm7/G', 2, 'min7', [0, 3, 7, 10], 7],
  ['G7/B', 7, 'dom7', [0, 4, 7, 10], 11],
  ['Bb+7', 10, 'aug7', [0, 4, 8, 10]],
  ['A7(b9,b13)', 9, 'dom7', [0, 1, 4, 7, 8, 10]],
  ['Db7(#9)', 1, 'dom7', [0, 3, 4, 7, 10]],
  ['Gb7#11', 6, 'dom7', [0, 4, 6, 7, 10]],
  ['G7 alt', 7, 'alt', [0, 1, 3, 4, 6, 7, 8, 10]],
  ['Bb 7', 10, 'dom7', [0, 4, 7, 10]],
];

describe('parseChord', () => {
  for (const [input, root, qc, members, bass] of TABLE) {
    it(input, () => {
      const c = parseChord(input);
      expect(c.root).toBe(root);
      expect(qualityClass(c)).toBe(qc);
      expect(chordTones(c).members).toEqual(members);
      expect(c.bass).toBe(bass ?? null);
    });
  }
  it('rejects garbage', () => {
    expect(() => parseChord('H7')).toThrow();
    expect(() => parseChord('C7xyz')).toThrow();
    expect(() => parseChord('')).toThrow();
  });
  it('chart tokens', () => {
    expect(parseChartToken('N.C.')).toEqual({ kind: 'nc' });
    expect(parseChartToken('%')).toEqual({ kind: 'repeat' });
    expect(parseChartToken('Dm7').kind).toBe('chord');
  });
});

describe('chordTones essentials/tensions', () => {
  it('maj7', () => {
    const t = chordTones(parseChord('Cmaj7'));
    expect(t.essential).toEqual([4, 11]);
    expect(t.tensions).toEqual([2, 6, 9]);
    expect(t.avoid).toEqual([5]);
  });
  it('dom7 with b9 removes natural 9 from tensions', () => {
    const t = chordTones(parseChord('C7b9'));
    expect(t.tensions).not.toContain(2);
    expect(t.members).toContain(1);
  });
  it('alt', () => {
    const t = chordTones(parseChord('C7alt'));
    expect(t.essential).toEqual([4, 10]);
    expect(t.allowedPcs).toEqual([0, 1, 3, 4, 6, 7, 8, 10]);
  });
  it('halfdim', () => {
    expect(chordTones(parseChord('Cø')).essential).toEqual([3, 6, 10]);
  });
});

describe('formatChord', () => {
  const cases: Array<[string, string, string]> = [
    ['Cmaj7', 'CΔ7', 'Cmaj7'],
    ['Cm7', 'C-7', 'Cm7'],
    ['Cm7b5', 'Cø', 'Cm7b5'],
    ['Cdim7', 'C°7', 'Cdim7'],
    ['C7b9', 'C7(b9)', 'C7b9'],
    ['C7alt', 'C7alt', 'C7alt'],
    ['C6/9', 'C6/9', 'C6/9'],
    ['C-Δ7', 'C-Δ7', 'Cm(maj7)'],
    ['C13', 'C13', 'C13'],
    ['C7sus4', 'C7sus4', 'C7sus4'],
    ['C/E', 'C/E', 'C/E'],
    ['C+7', 'C+7', 'Caug7'],
    ['Cmaj9', 'CΔ9', 'Cmaj9'],
  ];
  for (const [input, rb, plain] of cases) {
    it(`${input} → ${rb} / ${plain}`, () => {
      const c = parseChord(input);
      expect(formatChord(c, 'realbook')).toBe(rb);
      expect(formatChord(c, 'plain')).toBe(plain);
    });
  }
  it('transposes with respelling', () => {
    const c = transposeChord(parseChord('Dm7/G'), 3);
    expect(formatChord(c)).toBe('F-7/Bb');
    expect(formatChord(transposeChord(parseChord('Cmaj7'), 6, 'sharp'))).toBe('F#Δ7');
  });
});
