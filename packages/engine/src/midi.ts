/**
 * MIDI input sources. Everything emits NoteEvents in clock seconds.
 */
import { type Clock, Emitter } from './clock.js';
import type { NoteEvent } from './capture.js';

export interface MidiDeviceInfo { id: string; name: string; manufacturer: string; state: string }

export interface MidiSourceEvents extends Record<string, unknown> {
  note: NoteEvent;
  devices: MidiDeviceInfo[];
  /** sustain pedal (CC64) */
  sustain: { down: boolean; time: number };
  /** raw control change, for mapping "next"/"pause" to pedals or buttons */
  cc: { controller: number; value: number; time: number };
  error: { message: string };
}

export interface MidiSource extends Emitter<MidiSourceEvents> {
  readonly kind: string;
  start(): Promise<void>;
  stop(): void;
  devices(): MidiDeviceInfo[];
  /** Choose the active input (null = all inputs). */
  select(deviceId: string | null): void;
}

export function webMidiSupported(): boolean {
  return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
}

/** Web MIDI API input. Timestamps are converted from performance.now() to clock seconds. */
export class WebMidiSource extends Emitter<MidiSourceEvents> implements MidiSource {
  readonly kind = 'webmidi';
  private access: MIDIAccess | null = null;
  private selected: string | null = null;
  private bound = new Map<string, (e: MIDIMessageEvent) => void>();

  constructor(private readonly clock: Clock) { super(); }

  async start(): Promise<void> {
    if (!webMidiSupported()) { this.emit('error', { message: 'Web MIDI is not supported in this browser (Safari/iOS lack it). Use Chrome, Edge or Firefox — or the microphone.' }); return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.emit('error', { message: `MIDI access denied: ${(e as Error).message}` });
      return;
    }
    this.access.onstatechange = () => { this.rebind(); this.emit('devices', this.devices()); };
    this.rebind();
    this.emit('devices', this.devices());
  }

  stop(): void {
    for (const [id, fn] of this.bound) { const input = this.access?.inputs.get(id); if (input) input.removeEventListener('midimessage', fn as EventListener); }
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
  }

  devices(): MidiDeviceInfo[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? 'MIDI input', manufacturer: i.manufacturer ?? '', state: i.state }));
  }

  select(deviceId: string | null): void { this.selected = deviceId; this.rebind(); }

  private rebind(): void {
    if (!this.access) return;
    for (const [id, fn] of this.bound) { const input = this.access.inputs.get(id); if (input) input.removeEventListener('midimessage', fn as EventListener); }
    this.bound.clear();
    for (const input of this.access.inputs.values()) {
      if (this.selected && input.id !== this.selected) continue;
      const fn = (e: MIDIMessageEvent) => this.onMessage(e);
      input.addEventListener('midimessage', fn as EventListener);
      this.bound.set(input.id, fn);
    }
  }

  private onMessage(e: MIDIMessageEvent): void {
    const d = e.data;
    if (!d || d.length < 2) return;
    const status = d[0]! & 0xf0;
    const time = this.clock.fromPerformance(e.timeStamp || performance.now());
    if (status === 0x90 || status === 0x80) {
      const note = d[1]!, vel = d[2] ?? 0;
      const on = status === 0x90 && vel > 0;
      this.emit('note', { type: on ? 'on' : 'off', note, velocity: vel, time });
    } else if (status === 0xb0) {
      const cc = d[1]!, value = d[2] ?? 0;
      if (cc === 64) this.emit('sustain', { down: value >= 64, time });
      this.emit('cc', { controller: cc, value, time });
    }
  }
}

/** Programmatic source: on-screen keyboard, computer keyboard, tests. */
export class ManualMidiSource extends Emitter<MidiSourceEvents> implements MidiSource {
  readonly kind = 'manual';
  constructor(private readonly clock: Clock) { super(); }
  async start(): Promise<void> { this.emit('devices', this.devices()); }
  stop(): void {}
  devices(): MidiDeviceInfo[] { return [{ id: 'manual', name: 'On-screen / computer keyboard', manufacturer: 'Shed', state: 'connected' }]; }
  select(): void {}
  noteOn(note: number, velocity = 90, time = this.clock.now()): void { this.emit('note', { type: 'on', note, velocity, time }); }
  noteOff(note: number, time = this.clock.now()): void { this.emit('note', { type: 'off', note, velocity: 0, time }); }
}

/**
 * Computer-keyboard piano: two rows (z–m lower octave, q–p upper), with , and . to shift octaves.
 * Only meant for testing without a piano.
 */
export const COMPUTER_KEY_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24, '9': 25, o: 26, '0': 27, p: 28,
};
