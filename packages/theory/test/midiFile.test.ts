import { describe, expect, it } from 'vitest';
import { melodyFromMidi, parseMidiFile } from '../src/index.js';

/** Build a one-track SMF by hand, so the test does not depend on a fixture file. */
function smf(events: number[][], ppq = 480, opts: { tempo?: number; timeSig?: [number, number]; name?: string } = {}): Uint8Array {
  const vlq = (v: number): number[] => {
    const out = [v & 0x7f];
    v >>= 7;
    while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
    return out;
  };
  const body: number[] = [];
  if (opts.name) body.push(0, 0xff, 0x03, opts.name.length, ...[...opts.name].map((c) => c.charCodeAt(0)));
  if (opts.tempo) {
    const us = Math.round(60_000_000 / opts.tempo);
    body.push(0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
  }
  if (opts.timeSig) body.push(0, 0xff, 0x58, 4, opts.timeSig[0], Math.log2(opts.timeSig[1]), 24, 8);
  for (const [delta, ...rest] of events) body.push(...vlq(delta!), ...rest);
  body.push(0, 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff];
  const len = body.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...body];
  return new Uint8Array([...head, ...trk]);
}

const on = (n: number, delta = 0, v = 90) => [delta, 0x90, n, v];
const off = (n: number, delta = 0) => [delta, 0x80, n, 0];

describe('parseMidiFile', () => {
  it('reads notes as beats, with tempo and metre', () => {
    const f = parseMidiFile(smf([on(60), off(60, 480), on(62), off(62, 240)], 480, { tempo: 132, timeSig: [3, 4], name: 'Head' }));
    expect(f.ppq).toBe(480);
    expect(f.bpm).toBe(132);
    expect(f.beatsPerBar).toBe(3);
    expect(f.tracks[0]!.name).toBe('Head');
    expect(f.tracks[0]!.notes.map((n) => [n.midi, n.startBeat, n.beats])).toEqual([[60, 0, 1], [62, 1, 0.5]]);
  });

  it('handles running status and note-on with velocity 0 as note-off', () => {
    // second event omits the status byte; the third turns the note off with velocity 0
    const f = parseMidiFile(smf([[0, 0x90, 60, 90], [480, 64, 90], [480, 60, 0], [0, 64, 0]]));
    expect(f.tracks[0]!.notes).toHaveLength(2);
    expect(f.tracks[0]!.notes.map((n) => n.midi).sort()).toEqual([60, 64]);
  });

  it('refuses a file that is not MIDI rather than returning nonsense', () => {
    expect(() => parseMidiFile(new Uint8Array([1, 2, 3, 4]))).toThrow(/Not a MIDI file/);
  });
});

describe('melodyFromMidi', () => {
  it('takes the top voice where notes are struck together', () => {
    const f = parseMidiFile(smf([on(60), on(64), on(67), off(60, 480), off(64), off(67)]));
    const m = melodyFromMidi(f);
    expect(m.notes.filter((n) => n.midi !== null).map((n) => n.midi)).toEqual([67]);
  });

  it('puts rests where the line stops', () => {
    const f = parseMidiFile(smf([on(60), off(60, 480), on(62, 480), off(62, 480)]));
    const m = melodyFromMidi(f);
    expect(m.notes.map((n) => [n.midi, n.start, n.beats])).toEqual([[60, 0, 1], [null, 1, 1], [62, 2, 1]]);
  });

  it('picks the busiest track when there are several', () => {
    const f = parseMidiFile(smf([on(60), off(60, 480)]));
    f.tracks.push({ index: 1, name: 'Bass', notes: [], channels: [] });
    expect(melodyFromMidi(f).notes.filter((n) => n.midi !== null)).toHaveLength(1);
  });

  it('quantises when asked, so a human performance becomes a written line', () => {
    const f = parseMidiFile(smf([on(60), off(60, 470), on(62, 30), off(62, 480)]));
    const m = melodyFromMidi(f, { quantise: 0.5 });
    expect(m.notes.filter((n) => n.midi !== null).map((n) => n.start)).toEqual([0, 1]);
  });
});
