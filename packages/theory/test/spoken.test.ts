import { describe, expect, it } from 'vitest';
import { formatChord } from '../src/chord.js';
import { spokenToChord, spokenToCommand } from '../src/spoken.js';

const s = (t: string) => { const c = spokenToChord(t); return c ? formatChord(c, 'plain') : null; };

describe('spokenToChord', () => {
  const cases: Array<[string, string | null]> = [
    ['D minor seven', 'Dm7'], ['d minor 7', 'Dm7'], ['dee minor seventh', 'Dm7'],
    ['G seven', 'G7'], ['G dominant seven', 'G7'], ['gee seven', 'G7'],
    ['C major seven', 'Cmaj7'], ['see major seventh', 'Cmaj7'], ['C major', 'C'], ['C', 'C'],
    ['B flat minor seven flat five', 'Bbm7b5'], ['B flat half diminished', 'Bbm7b5'], ['b flat half diminished seven', 'Bbm7b5'],
    ['E flat major seven', 'Ebmaj7'], ['E flat major nine', 'Ebmaj9'],
    ['F sharp seven sharp nine', 'F#7#9'], ['G seven altered', 'G7alt'], ['G altered', 'G7alt'],
    ['A seven flat nine', 'A7b9'], ['A seven flat nine flat thirteen', 'A7b9b13'],
    ['C sharp minor', 'C#m'], ['C diminished seven', 'Cdim7'], ['C diminished', 'Cdim'],
    ['C augmented', 'Caug'], ['C augmented seven', 'Caug7'],
    ['C six', 'C6'], ['C six nine', 'C6/9'], ['A minor six', 'Am6'],
    ['G seven sus four', 'G7sus4'], ['G sus', 'Gsus4'], ['G sus four', 'Gsus4'],
    ['C minor major seven', 'Cm(maj7)'], ['C thirteen', 'C13'], ['C minor nine', 'Cm9'], ['C minor eleven', 'Cm11'],
    ['C major seven sharp eleven', 'Cmaj7#11'], ['C seven over E', 'C7/E'], ['C over E flat', 'C/Eb'],
    ['hello there', null], ['', null],
  ];
  for (const [input, expected] of cases) it(`${JSON.stringify(input)} → ${expected}`, () => { expect(s(input)).toBe(expected); });
});

describe('spokenToCommand', () => {
  it('maps commands', () => {
    expect(spokenToCommand('next')).toBe('next');
    expect(spokenToCommand('Slower please')).toBe('slower');
    expect(spokenToCommand('show me')).toBe('hint');
    expect(spokenToCommand('D minor seven')).toBeNull();
  });
});
