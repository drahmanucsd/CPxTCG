/**
 * Microphone input: spectrum → pitch-class chroma + note candidates → note on/off events,
 * so an acoustic piano can drive the same ChordCapture/grading path as MIDI.
 *
 * Level 1 (this file): peak picking with harmonic suppression. Octaves are unreliable, so mic
 * drills should grade at `octaveFree` / `chordTones`. Level 2 (a polyphonic model) can replace
 * `pickNotes` later without touching the rest.
 */
import { type Clock, Emitter } from './clock.js';
import type { MidiDeviceInfo, MidiSource, MidiSourceEvents } from './midi.js';

export interface Peak { freq: number; mag: number; midi: number; cents: number }

/** Find spectral peaks (local maxima) above `floorDb` with parabolic interpolation. `spec` is in dB. */
export function findPeaks(spec: Float32Array, sampleRate: number, fftSize: number, floorDb: number, minFreq = 50, maxFreq = 4200): Peak[] {
  const binHz = sampleRate / fftSize;
  const out: Peak[] = [];
  const lo = Math.max(2, Math.floor(minFreq / binHz)), hi = Math.min(spec.length - 2, Math.ceil(maxFreq / binHz));
  for (let i = lo; i <= hi; i++) {
    const m = spec[i]!;
    if (m < floorDb || m <= spec[i - 1]! || m < spec[i + 1]!) continue;
    // parabolic interpolation on dB values
    const a = spec[i - 1]!, b = m, c = spec[i + 1]!;
    const denom = a - 2 * b + c;
    const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    const freq = (i + delta) * binHz;
    const midiF = 69 + 12 * Math.log2(freq / 440);
    const midi = Math.round(midiF);
    out.push({ freq, mag: b - delta * 0.25 * (a - c), midi, cents: (midiF - midi) * 100 });
  }
  return out.sort((x, y) => y.mag - x.mag);
}

export interface NoteCandidate { midi: number; energy: number; harmonics: number }

/**
 * Turn peaks into note candidates: a peak is a note if it isn't better explained as a harmonic of a
 * stronger, lower peak. Harmonic support (2f, 3f present) raises confidence.
 */
export function pickNotes(peaks: Peak[], maxNotes = 8): NoteCandidate[] {
  const byMidi = new Map<number, Peak>();
  for (const p of peaks) { const e = byMidi.get(p.midi); if (!e || p.mag > e.mag) byMidi.set(p.midi, p); }
  const notes = [...byMidi.values()].sort((a, b) => a.midi - b.midi);
  const strongest = Math.max(...notes.map((n) => n.mag));
  const out: NoteCandidate[] = [];
  const HARMONIC_INTERVALS = [12, 19, 24, 28, 31, 34, 36]; // 2f 3f 4f 5f 6f 7f 8f in semitones
  for (const n of notes) {
    if (n.mag < strongest - 30) continue;
    // is n a harmonic of a lower, at-least-comparably-strong note?
    let explained = false;
    for (const iv of HARMONIC_INTERVALS) {
      const f = byMidi.get(n.midi - iv);
      if (!f) continue;
      const tolerance = iv === 12 ? 6 : iv === 19 ? 4 : 2; // dB: an octave partial can be nearly as loud as the fundamental
      if (f.mag >= n.mag - tolerance) { explained = true; break; }
    }
    if (explained) continue;
    let harmonics = 0;
    for (const iv of [12, 19, 24]) if (byMidi.has(n.midi + iv)) harmonics++;
    out.push({ midi: n.midi, energy: n.mag, harmonics });
  }
  // prefer supported notes; drop unsupported high notes when we have plenty
  out.sort((a, b) => (b.energy + b.harmonics * 3) - (a.energy + a.harmonics * 3));
  return out.slice(0, maxNotes).sort((a, b) => a.midi - b.midi);
}

/** 12-bin chroma (linear energy) from a dB spectrum, harmonically weighted toward fundamentals. */
export function chroma(spec: Float32Array, sampleRate: number, fftSize: number, floorDb: number): number[] {
  const out = new Array<number>(12).fill(0);
  for (const p of findPeaks(spec, sampleRate, fftSize, floorDb, 50, 3000)) {
    const lin = Math.pow(10, (p.mag - floorDb) / 20);
    out[((p.midi % 12) + 12) % 12]! += lin;
    out[(((p.midi - 12) % 12) + 12) % 12]! += lin * 0.3;     // credit the octave below
  }
  const max = Math.max(1e-9, ...out);
  return out.map((v) => v / max);
}

export interface MicOptions {
  fftSize?: number;
  /** frames per second to analyse */
  rate?: number;
  /** dB above the measured noise floor a peak must be */
  thresholdDb?: number;
  onFrames?: number;
  offFrames?: number;
}

/**
 * Live mic → NoteEvents. Implements MidiSource so the app can plug it in beside a MIDI device.
 */
export class MicSource extends Emitter<MidiSourceEvents> implements MidiSource {
  readonly kind = 'mic';
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private spec: Float32Array<ArrayBuffer> = new Float32Array(0);
  private onCount = new Map<number, number>();
  private offCount = new Map<number, number>();
  private sounding = new Set<number>();
  private noiseFloor = -90;
  private calibrating = 0;
  private lastFlux = 0;
  private prevSpec: Float32Array<ArrayBuffer> = new Float32Array(0);
  level = 0;
  lastChroma: number[] = new Array(12).fill(0);
  lastNotes: NoteCandidate[] = [];
  private readonly opts: Required<MicOptions>;

  constructor(private readonly ctx: AudioContext, private readonly clock: Clock, opts: MicOptions = {}) {
    super();
    this.opts = { fftSize: opts.fftSize ?? 8192, rate: opts.rate ?? 40, thresholdDb: opts.thresholdDb ?? 22, onFrames: opts.onFrames ?? 2, offFrames: opts.offFrames ?? 5 };
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) { this.emit('error', { message: `Microphone unavailable: ${(e as Error).message}` }); return; }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.opts.fftSize;
    this.analyser.smoothingTimeConstant = 0.2;
    src.connect(this.analyser);
    this.spec = new Float32Array(this.analyser.frequencyBinCount);
    this.prevSpec = new Float32Array(this.analyser.frequencyBinCount);
    this.calibrating = this.opts.rate; // ~1 s of noise-floor measurement
    this.timer = setInterval(() => this.frame(), 1000 / this.opts.rate);
    this.emit('devices', this.devices());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    for (const n of this.sounding) this.emit('note', { type: 'off', note: n, velocity: 0, time: this.clock.now() });
    this.sounding.clear();
  }

  devices(): MidiDeviceInfo[] { return [{ id: 'mic', name: 'Microphone', manufacturer: '', state: this.stream ? 'connected' : 'disconnected' }]; }
  select(): void {}

  private frame(): void {
    if (!this.analyser) return;
    this.analyser.getFloatFrequencyData(this.spec);
    // level + noise floor
    let sum = 0, n = 0;
    for (let i = 4; i < this.spec.length; i += 4) { const v = this.spec[i]!; if (Number.isFinite(v)) { sum += v; n++; } }
    const mean = n ? sum / n : -90;
    if (this.calibrating > 0) { this.noiseFloor = this.calibrating === this.opts.rate ? mean : this.noiseFloor * 0.9 + mean * 0.1; this.calibrating--; }
    this.level = Math.max(0, Math.min(1, (mean - this.noiseFloor) / 40));
    // spectral flux (onset)
    let flux = 0;
    for (let i = 0; i < this.spec.length; i += 2) { const d = this.spec[i]! - this.prevSpec[i]!; if (d > 0) flux += d; }
    this.prevSpec.set(this.spec);
    this.lastFlux = flux;
    const floor = this.noiseFloor + this.opts.thresholdDb;
    const peaks = findPeaks(this.spec, this.ctx.sampleRate, this.opts.fftSize, floor);
    const notes = pickNotes(peaks);
    this.lastNotes = notes;
    this.lastChroma = chroma(this.spec, this.ctx.sampleRate, this.opts.fftSize, floor);
    const now = this.clock.now();
    const present = new Set(notes.map((x) => x.midi));
    // hysteresis on/off
    for (const m of present) {
      this.offCount.delete(m);
      const c = (this.onCount.get(m) ?? 0) + 1;
      this.onCount.set(m, c);
      if (!this.sounding.has(m) && c >= this.opts.onFrames) { this.sounding.add(m); this.emit('note', { type: 'on', note: m, velocity: 80, time: now - 0.03 }); }
    }
    for (const m of [...this.sounding]) {
      if (present.has(m)) continue;
      const c = (this.offCount.get(m) ?? 0) + 1;
      this.offCount.set(m, c);
      if (c >= this.opts.offFrames) { this.sounding.delete(m); this.onCount.delete(m); this.emit('note', { type: 'off', note: m, velocity: 0, time: now }); }
    }
    for (const m of [...this.onCount.keys()]) if (!present.has(m)) this.onCount.delete(m);
  }

  get flux(): number { return this.lastFlux; }
}
