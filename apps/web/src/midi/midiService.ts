/**
 * App-wide MIDI: one WebMidiSource + one ManualMidiSource feeding one ChordCapture.
 * Exposes held notes and a live identification for the "you're playing" readout.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { ChordCapture, ManualMidiSource, MicSource, WebMidiSource, webMidiSupported, type MidiDeviceInfo, type NoteEvent } from '@shed/engine';
import { identify, type Identification } from '@shed/theory';
import { getAudio } from '../audio/context';
import { useSettings } from '../store/settings';

interface MidiState {
  supported: boolean;
  connected: boolean;
  deviceName: string;
  devices: MidiDeviceInfo[];
  held: number[];
  ident: Identification[];
  error: string | null;
  sustain: boolean;
  lastNoteAt: number;
  inputMode: 'midi' | 'mic';
  micLevel: number;
  micNotes: number[];
  micError: string | null;
}

export const useMidiStore = create<MidiState>(() => ({
  supported: webMidiSupported(), connected: false, deviceName: '', devices: [], held: [], ident: [], error: null, sustain: false, lastNoteAt: 0, inputMode: 'midi', micLevel: 0, micNotes: [], micError: null,
}));

let web: WebMidiSource | null = null;
let manual: ManualMidiSource | null = null;
let capture: ChordCapture | null = null;
let mic: MicSource | null = null;
let micMeter: ReturnType<typeof setInterval> | null = null;
let started = false;
const noteListeners = new Set<(e: NoteEvent) => void>();
const ccListeners = new Set<(e: { controller: number; value: number; time: number }) => void>();

export function getCapture(): ChordCapture {
  if (!capture) capture = new ChordCapture({ settleMs: 70, graceMs: 150 });
  return capture;
}

export function getManualSource(): ManualMidiSource {
  if (!manual) manual = new ManualMidiSource(getAudio().clock);
  return manual;
}

function onNote(e: NoteEvent) {
  getCapture().feed(e);
  for (const l of noteListeners) l(e);
  useMidiStore.setState({ lastNoteAt: performance.now() });
}

/** Wire capture + sources. Synchronous so drills can start before the (possibly slow) MIDI permission resolves. */
export function startMidi(): void {
  if (started) return;
  started = true;
  const { clock } = getAudio();
  const cap = getCapture();
  cap.on('notes', ({ held }) => useMidiStore.setState({ held, ident: held.length >= 2 ? identify(held, 3) : [] }));
  manual = getManualSource();
  manual.on('note', onNote);
  if (webMidiSupported()) {
    web = new WebMidiSource(clock);
    web.on('note', onNote);
    web.on('cc', (e) => { for (const l of ccListeners) l(e); });
    web.on('sustain', ({ down }) => useMidiStore.setState({ sustain: down }));
    web.on('error', ({ message }) => useMidiStore.setState({ error: message }));
    web.on('devices', (devices) => {
      const wanted = useSettings.getState().midiDeviceId;
      const active = devices.find((d) => d.id === wanted && d.state === 'connected') ?? devices.find((d) => d.state === 'connected');
      useMidiStore.setState({ devices, connected: !!active, deviceName: active?.name ?? '' });
      web?.select(wanted && devices.some((d) => d.id === wanted) ? wanted : null);
    });
    void web.start();
  }
}

/** Switch between MIDI and microphone input. The mic runs through the same capture/grading path. */
export async function setInputMode(mode: 'midi' | 'mic'): Promise<void> {
  startMidi();
  if (mode === useMidiStore.getState().inputMode && (mode === 'midi' || mic)) return;
  getCapture().reset();
  if (mode === 'mic') {
    const { ctx, clock } = getAudio();
    if (ctx.state !== 'running') await ctx.resume();
    mic = new MicSource(ctx, clock);
    mic.on('note', onNote);
    mic.on('error', ({ message }) => useMidiStore.setState({ micError: message, inputMode: 'midi' }));
    useMidiStore.setState({ inputMode: 'mic', micError: null });
    await mic.start();
    micMeter = setInterval(() => { if (mic) useMidiStore.setState({ micLevel: mic.level, micNotes: mic.lastNotes.map((n) => n.midi) }); }, 100);
  } else {
    mic?.stop(); mic = null;
    if (micMeter) clearInterval(micMeter);
    micMeter = null;
    useMidiStore.setState({ inputMode: 'midi', micLevel: 0, micNotes: [] });
  }
}

export function selectDevice(id: string | null): void {
  useSettings.getState().set({ midiDeviceId: id });
  web?.select(id);
  const devices = useMidiStore.getState().devices;
  const active = devices.find((d) => d.id === id) ?? devices.find((d) => d.state === 'connected');
  useMidiStore.setState({ connected: !!active, deviceName: active?.name ?? '' });
}

export function onMidiNote(fn: (e: NoteEvent) => void): () => void { noteListeners.add(fn); return () => noteListeners.delete(fn); }
export function onMidiCC(fn: (e: { controller: number; value: number; time: number }) => void): () => void { ccListeners.add(fn); return () => ccListeners.delete(fn); }

export function useMidiStatus() {
  const s = useMidiStore();
  useEffect(() => { startMidi(); }, []);
  return s;
}

/** Computer-keyboard piano (z-m / q-p rows) → manual source. Enabled per screen. */
export function useComputerKeyboardPiano(enabled: boolean, baseOctave = 3) {
  const [octave, setOctave] = useState(baseOctave);
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const map: Record<string, number> = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24, '9': 25, o: 26, '0': 27, p: 28 };
    const src = getManualSource();
    const kd = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const tgt = ev.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
      const k = ev.key.toLowerCase();
      if (k === ',') { setOctave((o) => Math.max(1, o - 1)); return; }
      if (k === '.') { setOctave((o) => Math.min(6, o + 1)); return; }
      const off = map[k];
      if (off === undefined || down.has(k)) return;
      down.add(k);
      src.noteOn((octave + 1) * 12 + off);
      ev.preventDefault();
    };
    const ku = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      const off = map[k];
      if (off === undefined) return;
      down.delete(k);
      src.noteOff((octave + 1) * 12 + off);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, [enabled, octave]);
  return octave;
}

// Test hook: lets Playwright inject notes as if from a MIDI device.
declare global { interface Window { __shed?: { noteOn: (n: number, v?: number) => void; noteOff: (n: number) => void; chord: (notes: number[], holdMs?: number) => Promise<void> }; __shedTarget?: { notes: number[]; chord: string; family: string; index: number } | null } }
if (typeof window !== 'undefined') {
  window.__shed = {
    noteOn: (n, v = 90) => getManualSource().noteOn(n, v),
    noteOff: (n) => getManualSource().noteOff(n),
    chord: async (notes, holdMs = 200) => { const s = getManualSource(); for (const n of notes) s.noteOn(n); await new Promise((r) => setTimeout(r, holdMs)); for (const n of notes) s.noteOff(n); },
  };
}
