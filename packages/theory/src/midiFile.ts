/**
 * Standard MIDI File reader, for getting a melody in without typing notation.
 *
 * The app ships no melodies, and asking someone to hand-enter ABC is asking them to learn a
 * notation language to practise a tune. A .mid of a standard is a thirty-second search, and it
 * carries exactly what is missing: real pitches and real durations, including the ties and
 * triplets that a player who learned by ear tends to get wrong.
 *
 * Pure: bytes in, notes out. Format 0 and 1, tempo and metre read from the conductor track.
 */
import type { Melody, MelodyNote } from './melody.js';

export interface MidiNote { midi: number; startBeat: number; beats: number; velocity: number; track: number; channel: number }

export interface MidiFile {
  /** ticks per quarter note */
  ppq: number;
  /** from the first tempo event, if there is one */
  bpm: number | null;
  beatsPerBar: number;
  tracks: Array<{ index: number; name: string; notes: MidiNote[]; channels: number[] }>;
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean { return this.i >= this.b.length; }
  get pos(): number { return this.i; }
  byte(): number { if (this.i >= this.b.length) throw new Error('unexpected end of file'); return this.b[this.i++]!; }
  bytes(n: number): Uint8Array { const s = this.b.subarray(this.i, this.i + n); this.i += n; return s; }
  u16(): number { return (this.byte() << 8) | this.byte(); }
  u32(): number { return ((this.byte() << 24) >>> 0) + (this.byte() << 16) + (this.byte() << 8) + this.byte(); }
  /** MIDI's 7-bits-per-byte variable-length quantity */
  vlq(): number {
    let v = 0;
    for (let k = 0; k < 4; k++) { const c = this.byte(); v = (v << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
    return v;
  }
  skip(n: number): void { this.i += n; }
  seek(n: number): void { this.i = n; }
  ascii(n: number): string { return String.fromCharCode(...this.bytes(n)); }
}

export function parseMidiFile(data: Uint8Array): MidiFile {
  const r = new Reader(data);
  if (r.ascii(4) !== 'MThd') throw new Error('Not a MIDI file');
  const headerLen = r.u32();
  r.u16();                       // format: 0, 1 and 2 all read the same way here
  const trackCount = r.u16();
  const division = r.u16();
  if (division & 0x8000) throw new Error('SMPTE timecode MIDI files are not supported');
  const ppq = division || 480;
  r.skip(headerLen - 6);

  let bpm: number | null = null;
  let beatsPerBar = 4;
  const tracks: MidiFile['tracks'] = [];

  for (let t = 0; t < trackCount && !r.done; t++) {
    if (r.ascii(4) !== 'MTrk') break;
    const len = r.u32();
    const end = r.pos + len;
    let tick = 0;
    let status = 0;
    let trackName = '';
    const open = new Map<number, { tick: number; velocity: number; channel: number }>();
    const notes: MidiNote[] = [];
    const channels = new Set<number>();

    while (r.pos < end) {
      tick += r.vlq();
      let b = r.byte();
      if (b < 0x80) { r.seek(r.pos - 1); b = status; } else { status = b; }   // running status
      const type = b & 0xf0;
      const channel = b & 0x0f;

      if (b === 0xff) {
        const meta = r.byte();
        const n = r.vlq();
        const payload = r.bytes(n);
        if (meta === 0x03 && !trackName) trackName = String.fromCharCode(...payload).trim();
        else if (meta === 0x51 && n === 3 && bpm === null) {
          const usPerQuarter = (payload[0]! << 16) | (payload[1]! << 8) | payload[2]!;
          if (usPerQuarter > 0) bpm = Math.round((60_000_000 / usPerQuarter) * 100) / 100;
        } else if (meta === 0x58 && n >= 2) {
          beatsPerBar = Math.max(1, Math.round(payload[0]! * (4 / Math.pow(2, payload[1]!))));
        }
        continue;
      }
      if (b === 0xf0 || b === 0xf7) { r.skip(r.vlq()); continue; }

      switch (type) {
        case 0x90:
        case 0x80: {
          const note = r.byte();
          const vel = r.byte();
          channels.add(channel);
          const key = channel * 128 + note;
          if (type === 0x90 && vel > 0) {
            open.set(key, { tick, velocity: vel, channel });
          } else {
            const on = open.get(key);
            if (on) {
              open.delete(key);
              notes.push({
                midi: note, velocity: on.velocity, track: t, channel,
                startBeat: on.tick / ppq,
                beats: Math.max(1 / 16, (tick - on.tick) / ppq),
              });
            }
          }
          break;
        }
        case 0xa0: case 0xb0: case 0xe0: r.skip(2); break;
        case 0xc0: case 0xd0: r.skip(1); break;
        default: r.skip(1); break;
      }
    }
    r.seek(end);
    notes.sort((a, b2) => a.startBeat - b2.startBeat || a.midi - b2.midi);
    tracks.push({ index: t, name: trackName || `Track ${t + 1}`, notes, channels: [...channels].sort((a, b3) => a - b3) });
  }

  return { ppq, bpm, beatsPerBar, tracks };
}

/**
 * Pull a single line out of a track.
 *
 * A head exported to MIDI is usually one track of single notes, but arrangements happen. Where
 * notes overlap, the top voice is the melody — which is what a pianist reading a fake book plays
 * in the right hand anyway.
 */
export function melodyFromMidi(
  file: MidiFile,
  opts: { track?: number; channel?: number; quantise?: number } = {},
): Melody {
  const track = opts.track !== undefined
    ? file.tracks[opts.track]
    : [...file.tracks].sort((a, b) => b.notes.length - a.notes.length)[0];
  if (!track) return { beatsPerBar: file.beatsPerBar, notes: [], source: 'abc' };

  const src = opts.channel === undefined ? track.notes : track.notes.filter((n) => n.channel === opts.channel);
  const grid = opts.quantise ?? 0;
  const snap = (x: number) => (grid > 0 ? Math.round(x / grid) * grid : x);

  // keep the top note of anything struck together, then trim overlaps so the line is monophonic
  const byStart = new Map<number, MidiNote[]>();
  for (const n of src) {
    const k = snap(n.startBeat);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k)!.push(n);
  }
  const picked = [...byStart.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([start, ns]) => ({ start, n: ns.reduce((a, b) => (b.midi > a.midi ? b : a)) }));

  const notes: MelodyNote[] = [];
  for (let i = 0; i < picked.length; i++) {
    const { start, n } = picked[i]!;
    const nextStart = picked[i + 1]?.start ?? start + snap(n.beats);
    const beats = Math.max(grid || 1 / 16, Math.min(snap(n.beats) || (grid || 1 / 16), nextStart - start));
    if (start > (notes.at(-1)?.start ?? -1) + 1e-9 || !notes.length) notes.push({ midi: n.midi, start, beats });
  }

  // rests, so the line reads as written rather than as a run of adjacent notes
  const withRests: MelodyNote[] = [];
  let at = notes[0]?.start ?? 0;
  if (at > 0) withRests.push({ midi: null, start: 0, beats: at });
  for (const n of notes) {
    if (n.start > at + 1e-6) withRests.push({ midi: null, start: at, beats: n.start - at });
    withRests.push(n);
    at = n.start + n.beats;
  }
  return { beatsPerBar: file.beatsPerBar, notes: withRests, source: 'abc' };
}
