import { describe, expect, it } from 'vitest';
import { analyzeSong, findCadences, inferKey } from '../src/analysis.js';
import { parseChord } from '../src/chord.js';
import { builtinSongs } from '../src/library.js';
import { keyName } from '../src/roman.js';

const song = (title: string) => builtinSongs().find((s) => s.title === title)!;
const chords = (text: string) => text.split(' ').map((t, i) => ({ chord: parseChord(t), formIndex: i }));

describe('cadence detection', () => {
  it('finds a resolving ii-V-I', () => {
    const c = findCadences(chords('Dm7 G7 Cmaj7'));
    expect(c).toHaveLength(1);
    expect(c[0]!.kind).toBe('iiVI');
    expect(c[0]!.target).toBe(0);
    expect(c[0]!.label).toBe('ii-V-I in C');
  });
  it('finds an unresolved ii-V', () => {
    const c = findCadences(chords('Dm7 G7 Eb7'));
    expect(c[0]!.kind).toBe('iiV');
  });
  it('reads a half-diminished ii as a minor ii-V', () => {
    const c = findCadences(chords('Dm7b5 G7 Cm7'));
    expect(c[0]!.minor).toBe(true);
    expect(c[0]!.label).toBe('ii-V-I in C minor');
  });
  it('ignores a ii and V that are not a fourth apart', () => {
    expect(findCadences(chords('Dm7 A7 Cmaj7'))).toHaveLength(0);
  });
  it('sees two chords inside one bar, which is where most ii-Vs live', () => {
    // the bug this guards: analysing one chord per bar finds no ii-Vs in rhythm changes
    const rhythm = analyzeSong(song('I Got Rhythm'));
    expect(rhythm.cadences.length).toBeGreaterThan(5);
  });
});

describe('key inference', () => {
  it('hears a ii-V-I as its tonic', () => {
    expect(keyName(inferKey(['Dm7', 'G7', 'Cmaj7'].map((t) => parseChord(t)), { tonic: 5, mode: 'major' }))).toBe('C');
  });
  it('falls back to the written key when there is nothing to go on', () => {
    expect(keyName(inferKey([], { tonic: 3, mode: 'major' }))).toBe('Eb');
  });
});

describe('song analysis', () => {
  it('names an AABA form and spots the repeated A sections', () => {
    const a = analyzeSong(song('Honeysuckle Rose'));
    expect(a.form).toBe('AABA');
    expect(a.bars).toBe(32);
    expect(a.sections.filter((s) => s.sameAs).length).toBe(2);
  });
  it('flags the bars where a repeated section differs, rather than calling it new', () => {
    const a = analyzeSong(song('I Got Rhythm'));
    const second = a.sections[1]!;
    expect(second.sameAs).toBe('A');
    expect(second.differsAt?.length).toBeGreaterThan(0);
  });
  it('detects the bridge modulation in Body and Soul', () => {
    const a = analyzeSong(song('Body and Soul'));
    expect(a.keys.length).toBeGreaterThan(1);
    const bridge = a.sections.find((s) => s.label.startsWith('B'))!;
    expect(keyName(bridge.key)).not.toBe(keyName(a.sections[0]!.key));
  });
  it('produces a one-line summary for every built-in tune', () => {
    for (const s of builtinSongs()) {
      const a = analyzeSong(s);
      expect(a.summary, s.title).toMatch(/\d+ bars/);
      expect(a.sections.length, s.title).toBeGreaterThan(0);
    }
  });
});
