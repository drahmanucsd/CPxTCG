import { describe, expect, it } from 'vitest';
import { parseChartText } from '../src/chartText.js';
import { formatChord } from '../src/chord.js';
import { importIReal, parseIrealChords, unscramble } from '../src/ireal.js';
import { builtinSongs } from '../src/library.js';
import { formToChords, guideTones, resolveForm, transposeSong } from '../src/song.js';

const f = (s: import('../src/song.js').Song) => resolveForm(s).map((b) => b.chords.map((c) => (c.chord ? formatChord(c.chord, 'plain') + (c.beats !== b.timeSig[0] ? `:${c.beats}` : '') : 'NC')).join(' ')).join(' | ');

describe('chart text', () => {
  it('parses meta, sections, beats', () => {
    const s = parseChartText(`title: T\nkey: F | style: swing | tempo: 120\n[A] Gm7 C7 | F6 | Dm7:3 G7:1 | % |`);
    expect(s.key).toEqual({ tonic: 5, mode: 'major' });
    expect(s.tempo).toBe(120);
    expect(s.bars).toHaveLength(4);
    expect(s.bars[0]!.section).toBe('A');
    expect(s.bars[0]!.chords.map((c) => c.beats)).toEqual([2, 2]);
    expect(s.bars[2]!.chords.map((c) => c.beats)).toEqual([3, 1]);
    expect(formatChord(s.bars[3]!.chords[0]!.chord!, 'plain')).toBe('Dm7');
  });
  it('resolves repeats with endings', () => {
    const s = parseChartText(`title: R\nkey: C\n{ C6 | 1) G7 } 2) F6 | C6 |`);
    expect(f(s)).toBe('C6 | G7 | C6 | F6 | C6');
  });
  it('resolves D.S. al Coda', () => {
    const s = parseChartText(`title: DS\nkey: C\nC6 | $ Dm7 | G7 @ | Am7 | F6 !DSC | @@ Db7 | C6 |`);
    expect(f(s)).toBe('C6 | Dm7 | G7 | Am7 | F6 | Dm7 | G7 | Db7 | C6');
  });
  it('transposes', () => {
    const s = parseChartText(`title: X\nkey: C\nDm7 G7 | Cmaj7 |`);
    expect(f(transposeSong(s, 3))).toBe('Fm7:2 Bb7:2 | Ebmaj7');
  });
  it('flattens to a progression with bar indices', () => {
    const s = parseChartText(`title: X\nkey: C\nDm7 G7 | N.C. | Cmaj7 |`);
    const p = formToChords(resolveForm(s));
    expect(p.map((c) => c.beats)).toEqual([2, 6, 4]);
    expect(p.map((c) => c.formIndex)).toEqual([0, 0, 2]);
  });
  it('guide tones move smoothly', () => {
    const s = parseChartText(`title: X\nkey: C\nDm7 | G7 | Cmaj7 |`);
    const g = guideTones(formToChords(resolveForm(s)).map((c) => ({ chord: c.chord })));
    expect(g.map((x) => x.third % 12)).toEqual([5, 11, 4]);
    expect(g.map((x) => x.seventh % 12)).toEqual([0, 5, 11]);
    for (let i = 1; i < g.length; i++) { expect(Math.abs(g[i]!.third - g[i - 1]!.third)).toBeLessThanOrEqual(6); }
  });
});

describe('library', () => {
  it('every built-in chart parses and resolves to a sane form', () => {
    for (const s of builtinSongs()) {
      const form = resolveForm(s);
      expect(form.length, s.title).toBeGreaterThanOrEqual(12);
      for (const b of form) {
        const beats = b.chords.reduce((a, c) => a + c.beats, 0);
        expect(beats, `${s.title} bar ${b.barIndex}`).toBe(b.timeSig[0]);
        for (const c of b.chords) expect(c.chord, `${s.title} bar ${b.barIndex}`).not.toBeNull();
      }
    }
  });
  it('rhythm changes is 32 bars', () => {
    const s = builtinSongs().find((x) => x.title === 'I Got Rhythm')!;
    expect(resolveForm(s)).toHaveLength(32);
  });
});

describe('iReal import', () => {
  it('irealbook URL', () => {
    const url = 'irealbook://Test%20Tune=Doe%20John=Medium%20Swing=F=n=T44*A{C-7 F7 |Bb^7 |Bb^7 |N1Bb^7 |}N2Bb^7 |x |*B|Fh7 Bb7 |Eb-7 |n |Ab7#9 |Z';
    const { songs, errors } = importIReal(url);
    expect(errors).toEqual([]);
    expect(songs).toHaveLength(1);
    const s = songs[0]!;
    expect(s.title).toBe('Test Tune');
    expect(s.composer).toBe('John Doe');
    expect(s.key).toEqual({ tonic: 5, mode: 'major' });
    expect(f(s)).toBe('Cm7:2 F7:2 | Bbmaj7 | Bbmaj7 | Bbmaj7 | Cm7:2 F7:2 | Bbmaj7 | Bbmaj7 | Bbmaj7 | Bbmaj7 | Fm7b5:2 Bb7:2 | Ebm7 | NC | Ab7#9');
    expect(s.bars[0]!.section).toBe('A');
    expect(s.bars.find((b) => b.section === 'B')).toBeDefined();
  });
  it('cells: spaces position chords within the bar', () => {
    const bars = parseIrealChords('|C^7   |D-7 G7 |D-7,G7,C^7,A7|D-7 G7 C^7 A7|C^7 A7 |');
    expect(bars[0]!.chords.map((c) => c.beats)).toEqual([4]);
    expect(bars[1]!.chords.map((c) => c.beats)).toEqual([2, 2]);
    expect(bars[2]!.chords.map((c) => c.beats)).toEqual([1, 1, 1, 1]);
    expect(bars[3]!.chords.map((c) => c.beats)).toEqual([1, 1, 1, 1]);
    expect(bars[4]!.chords.map((c) => c.beats)).toEqual([2, 2]);
  });
  it('unscramble is an involution on 50-char blocks', () => {
    const block = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX'; // 50 chars
    const s = block + 'tail';
    expect(unscramble(unscramble(s))).toBe(s);
  });
  it('rejects non-ireal text', () => {
    expect(importIReal('hello').errors.length).toBe(1);
  });
});
