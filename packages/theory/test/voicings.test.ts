import { describe, expect, it } from 'vitest';
import { parseChord, transposeChord } from '../src/chord.js';
import { midiName, parseMidiName, pc } from '../src/pitch.js';
import { FAMILIES, familiesFor, generateVoicings, violatesLowIntervalLimit, voicingPcs } from '../src/voicings.js';

const n = (s: string) => s.split(' ').map((x) => parseMidiName(x)!);
const names = (ns: number[]) => ns.map((x) => midiName(x)).join(' ');

describe('golden voicings in C', () => {
  const cases: Array<[string, string, string]> = [
    ['Cmaj7', 'rootlessA', 'E3 G3 B3 D4'],
    ['Cmaj7', 'rootlessB', 'B3 D4 E4 G4'],
    ['Dm7', 'rootlessA', 'F3 A3 C4 E4'],
    ['Dm7', 'rootlessB', 'C4 E4 F4 A4'],
    ['G7', 'rootlessA', 'B3 E4 F4 A4'],
    ['G7', 'rootlessB', 'F3 A3 B3 E4'],
    ['G7b9', 'rootlessA', 'B3 E4 F4 Ab4'],
    ['G7alt', 'rootlessA', 'B3 Eb4 F4 Bb4'],
    ['Dm7b5', 'rootlessA', 'F3 Ab3 C4 D4'],
    ['Cmaj7', 'shell', 'C3 E3 B3'],
    ['G7', 'shell', 'G3 B3 F4'],
    ['Cmaj7', 'guide', 'E3 B3'],
    ['Cmaj7', 'root37', 'E3 B3 C4'],
    ['Dm7', 'root37', 'F3 C4 D4'],
    ['G7', 'root37', 'B3 F4 G4'],
    ['Dm7', 'soWhat', 'D3 G3 C4 F4 A4'],
    ['Cmaj7', 'kennyBarron', 'C3 G3 D4 E4 B4 Gb5'],
    ['Dm7', 'kennyBarron', 'D3 A3 E4 F4 C5 G5'],
    ['C7', 'upperStructure', 'E3 Bb3 D4 Gb4 A4'],
    ['Cmaj7', 'inversions', 'C3 E3 G3 B3'],
  ];
  for (const [sym, fam, expected] of cases) {
    it(`${sym} ${fam} includes ${expected}`, () => {
      const vs = generateVoicings(parseChord(sym), fam);
      const found = vs.some((v) => names(v.notes) === expected);
      expect(found, `candidates: ${vs.map((v) => names(v.notes)).join(' | ')}`).toBe(true);
    });
  }
  it('drop2 of Cmaj7 root position is G3 C4 E4 B4', () => {
    const vs = generateVoicings(parseChord('Cmaj7'), 'drop2');
    expect(vs.map((v) => names(v.notes))).toContain('G3 C4 E4 B4');
  });
  it('drop3 of Cmaj7 root position is E3 C4 G4 B4', () => {
    const vs = generateVoicings(parseChord('Cmaj7'), 'drop3');
    expect(vs.map((v) => names(v.notes))).toContain('E3 C4 G4 B4');
  });
  it('block chord doubles the top note an octave below', () => {
    for (const v of generateVoicings(parseChord('C6'), 'fourWayClose')) {
      expect(v.notes[v.notes.length - 1]! - v.notes[0]!).toBe(12);
    }
  });
});

describe('invariants', () => {
  it('every family applies to at least one class and yields candidates for a chord of that class', () => {
    for (const fam of FAMILIES) {
      const classes = Object.keys(fam.templates);
      expect(classes.length).toBeGreaterThan(0);
    }
    for (const sym of ['Cmaj7', 'C7', 'Cm7', 'Cm7b5', 'Cdim7', 'C6', 'Cm6', 'C7alt', 'C7sus4', 'CmMaj7', 'C+7', 'C']) {
      const chord = parseChord(sym);
      for (const fam of familiesFor(chord)) {
        const vs = generateVoicings(chord, fam.id);
        expect(vs.length, `${sym} ${fam.id}`).toBeGreaterThan(0);
      }
    }
  });
  it('transposition: candidates(X) = transpose(candidates(C))', () => {
    for (const sym of ['Cmaj7', 'C7', 'Cm7', 'Cø']) {
      const c = parseChord(sym);
      for (const fam of familiesFor(c)) {
        // wide boxes so every pitch class gets a placement; the property is about pitch-class content
        const wide = { lowIntervalLimits: false, maxSpan: 40, box: { lowestMin: 36, lowestMax: 72, top: 108 }, leftBox: { lowestMin: 36, lowestMax: 60, top: 108 }, rightBox: { lowestMin: 48, lowestMax: 84, top: 120 } };
        const base = generateVoicings(c, fam.id, wide);
        for (const k of [1, 5, 7]) {
          const t = generateVoicings(transposeChord(c, k), fam.id, wide);
          const basePcs = new Set(base.map((v) => voicingPcs(v).map((p) => pc(p + k)).sort((a, b) => a - b).join(',')));
          for (const v of t) expect(basePcs.has(voicingPcs(v).join(',')), `${sym}+${k} ${fam.id} ${v.label}`).toBe(true);
        }
      }
    }
  });
  it('all candidates respect low interval limits and sorted notes', () => {
    for (const sym of ['Cmaj7', 'F7', 'Bbm7', 'Ebø', 'Adim7', 'Db7alt']) {
      const chord = parseChord(sym);
      for (const fam of familiesFor(chord)) for (const v of generateVoicings(chord, fam.id)) {
        expect(violatesLowIntervalLimit(v.notes), `${sym} ${fam.id} ${names(v.notes)}`).toBe(false);
        for (let i = 1; i < v.notes.length; i++) expect(v.notes[i]!).toBeGreaterThan(v.notes[i - 1]!);
      }
    }
  });
  it('low interval limit detects a muddy 3rd', () => {
    expect(violatesLowIntervalLimit(n('E2 G2'))).toBe(true);
    expect(violatesLowIntervalLimit(n('E3 G3'))).toBe(false);
    expect(violatesLowIntervalLimit(n('C2 G2'))).toBe(false);
  });
});
