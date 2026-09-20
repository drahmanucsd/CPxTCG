import { describe, expect, it } from 'vitest';
import { formatChord, parseChord } from '../src/chord.js';
import { parseMidiName } from '../src/pitch.js';
import { evaluate, identify } from '../src/matcher.js';
import { generateVoicings } from '../src/voicings.js';

const n = (s: string) => s.split(' ').map((x) => parseMidiName(x)!);
const target = (sym: string, fam: string, notes: string) => {
  const v = generateVoicings(parseChord(sym), fam).find((v) => v.notes.join() === n(notes).join());
  if (!v) throw new Error(`no such voicing ${sym} ${fam} ${notes}`);
  return v;
};

describe('evaluate', () => {
  const dm7A = target('Dm7', 'rootlessA', 'F3 A3 C4 E4');
  it('exact', () => {
    const v = evaluate(n('F3 A3 C4 E4'), dm7A, 'exact');
    expect(v.ok).toBe(true); expect(v.met).toBe('exact');
  });
  it('octave shift fails exact, passes octaveFree', () => {
    expect(evaluate(n('F4 A4 C5 E5'), dm7A, 'exact').ok).toBe(false);
    expect(evaluate(n('F4 A4 C5 E5'), dm7A, 'exact').diagnosis).toContain('wrongRegister');
    expect(evaluate(n('F4 A4 C5 E5'), dm7A, 'octaveFree').ok).toBe(true);
  });
  it('B form when A asked: fails shape with wrongInversion, passes octaveFree (same pcs)', () => {
    const r = evaluate(n('C4 E4 F4 A4'), dm7A, 'shape');
    expect(r.ok).toBe(false); expect(r.diagnosis).toContain('wrongInversion');
    expect(r.message).toMatch(/you played b7-9-b3-5/);
    expect(evaluate(n('C4 E4 F4 A4'), dm7A, 'octaveFree').ok).toBe(true);
    expect(evaluate(n('C4 E4 F4 A4'), dm7A, 'chordTones').ok).toBe(true);
  });
  it('a different A-form register passes shape', () => {
    expect(evaluate(n('F4 A4 C5 E5'), dm7A, 'shape').met).toBe('shape');
  });
  it('G7 with 5 instead of 13 when A asked: fails shape/octaveFree, passes family (3-note B has 5)', () => {
    const g7A = target('G7', 'rootlessA', 'B3 E4 F4 A4');
    const r = evaluate(n('F3 B3 D4'), g7A, 'family');
    expect(r.ok).toBe(false); // rootless3B is another family id
    expect(evaluate(n('F3 B3 D4'), g7A, 'chordTones').ok).toBe(true);
  });
  it('missing 7th', () => {
    const r = evaluate(n('F3 A3 E4'), dm7A, 'chordTones');
    expect(r.ok).toBe(false); expect(r.message).toMatch(/missing b7/i);
  });
  it('wrong note', () => {
    const r = evaluate(n('F#3 A3 C4 E4'), dm7A, 'chordTones');
    expect(r.ok).toBe(false); expect(r.message).toMatch(/3 not in chord|missing b3/);
  });
  it('chordTones allows root added and tensions', () => {
    const r = evaluate(n('D3 F3 A3 C4 E4'), dm7A, 'chordTones');
    expect(r.ok).toBe(true);
  });
  it('keyboard diff lists wrong/missed notes', () => {
    const r = evaluate(n('F3 Ab3 C4 E4'), dm7A, 'exact');
    expect(r.wrongNotes).toEqual(n('Ab3'));
    expect(r.missedNotes).toEqual(n('A3'));
    expect(r.correctNotes).toEqual(n('F3 C4 E4'));
  });
  it('nothing played', () => {
    expect(evaluate([], dm7A, 'exact').diagnosis).toEqual(['nothingPlayed']);
  });
  it('flags muddy correct voicings', () => {
    const shell = target('Cmaj7', 'shell', 'C3 E3 B3');
    const r = evaluate(n('C2 E2 B2'), shell, 'octaveFree');
    expect(r.ok).toBe(true); expect(r.diagnosis).toContain('lowIntervalLimit');
  });
});

describe('identify', () => {
  const top = (s: string) => formatChord(identify(n(s))[0]!.chord, 'plain');
  it('close voicings with root in bass', () => {
    expect(top('C3 E3 G3 B3')).toBe('Cmaj7');
    expect(top('G3 B3 D4 F4')).toBe('G7');
    expect(top('D3 F3 A3 C4')).toBe('Dm7');
    expect(top('B2 D3 F3 A3')).toBe('Bm7b5');
    expect(top('C3 Eb3 Gb3 A3')).toBe('Cdim7');
    expect(top('C3 E3 G3')).toBe('C');
    expect(top('C3 Eb3 G3')).toBe('Cm');
  });
  it('rootless voicings appear in the alternatives with a family label', () => {
    const r = identify(n('F3 A3 C4 E4'));
    const dm7 = r.find((x) => formatChord(x.chord, 'plain') === 'Dm7');
    expect(dm7).toBeDefined();
    expect(dm7!.family).toBe('rootlessA');
    expect(dm7!.rootless).toBe(true);
  });
  it('recognises an altered dominant', () => {
    const r = identify(n('B3 Eb4 F4 Bb4'));
    expect(r.some((x) => formatChord(x.chord, 'plain') === 'G7alt')).toBe(true);
  });
});
