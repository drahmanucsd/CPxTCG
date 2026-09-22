/**
 * Synthesized rhythm section: walking/bossa/ballad bass generated from the changes, plus drums.
 * Everything is scheduled from the transport's 'schedule' event, so it stays sample-accurate.
 */
import {
  COMP_FIGURES, COMP_RHYTHMS, DEFAULT_FEEL, type ChordSymbol, chordTones, humanise, isFillBar, offbeatAt, pc, pickFigure, swingRatio, walkingBass,
  type BassBar,
} from '@shed/theory';
import type { Transport } from './transport.js';
import type { BandSpec } from './drill.js';

export interface BeatContext { chord: ChordSymbol; next: ChordSymbol | null; beatInChord: number; chordBeats: number; /** the model voicing for this chord, for the piano track */ voicing?: number[] }

/** Where we are in the tune, so the band can play the form rather than a loop. */
export interface FormContext {
  /** 0-based bar within the form */
  bar: number;
  /** bars in one chorus */
  formBars: number;
  /** 1-based chorus number */
  chorus: number;
}

export class RhythmSection {
  private unsub: (() => void) | null = null;
  private lastBass = 40;
  /** the current chord's walking line, one note per beat, regenerated when the chord changes */
  private line: number[] = [];
  private lineFor: string | null = null;
  /** set by the host so the band knows where it is in the form */
  form: FormContext | null = null;
  private readonly feel = DEFAULT_FEEL;
  private readonly out: GainNode;
  private readonly rng = mulberry32(7);

  constructor(private readonly ctx: AudioContext, private readonly transport: Transport, private readonly chordAt: (beatIndex: number) => BeatContext | null, public spec: BandSpec) {
    this.out = ctx.createGain();
    this.out.gain.value = spec.volume ?? 0.8;
    this.out.connect(ctx.destination);
  }

  start(): void {
    this.unsub?.();
    this.unsub = this.transport.on('schedule', (b) => {
      if (b.countIn) { if (this.spec.drums) this.drumsCountIn(b.time, b.beat, b.beatDuration); return; }
      const ctxBeat = this.chordAt(b.index);
      const beatsPerBar = this.transport.timeSig.beats;
      if (this.spec.drums) this.drums(b.time, b.beat, beatsPerBar, b.beatDuration);
      if (this.spec.bass && ctxBeat) this.bass(b.time, b.beat, beatsPerBar, b.beatDuration, ctxBeat);
      if (this.spec.piano && ctxBeat) this.comp(b.time, b.beat, b.beatDuration, ctxBeat);
    });
  }

  stop(): void { this.unsub?.(); this.unsub = null; }
  setVolume(v: number): void { this.out.gain.value = v; }

  // ------------------------------------------------------------------ bass
  /** Beats-per-chord walking line from the theory generator, cached per chord. */
  private lineNote(c: BeatContext): number {
    const key = `${c.chord.text}>${c.next?.text ?? '-'}:${c.chordBeats}:${this.form?.chorus ?? 1}`;
    if (this.lineFor !== key) {
      const bars: BassBar[] = [{ chord: c.chord, next: c.next, beats: c.chordBeats }];
      const twoFeel = (this.form?.chorus ?? 1) === 1 && this.spec.style === 'swing';
      this.line = walkingBass(bars, {
        rng: this.rng, chorus: this.form?.chorus ?? 1, startNear: this.lastBass,
        feel: twoFeel ? 'two' : 'walk',
      });
      this.lineFor = key;
    }
    const n = this.line[Math.min(c.beatInChord, this.line.length - 1)] ?? this.lastBass;
    this.lastBass = n;
    return n;
  }

  private bass(time: number, beat: number, beatsPerBar: number, dur: number, c: BeatContext): void {
    const style = this.spec.style;
    const root = c.chord.bass ?? c.chord.root;
    const tones = chordTones(c.chord);
    const fifth = pc(root + (tones.members.includes(6) && !tones.members.includes(7) ? 6 : tones.members.includes(8) && !tones.members.includes(7) ? 8 : 7));
    const third = pc(root + (tones.members.includes(3) ? 3 : tones.members.includes(4) ? 4 : tones.members.includes(5) ? 5 : 4));
    const seventh = pc(root + (tones.members.includes(10) ? 10 : tones.members.includes(11) ? 11 : tones.members.includes(9) ? 9 : 10));
    const nextRoot = c.next ? (c.next.bass ?? c.next.root) : null;
    const last = c.beatInChord === c.chordBeats - 1;
    const first = c.beatInChord === 0;
    const swing = style === 'swing';

    if (style === 'ballad' || (style === 'waltz' && beat !== 0 && beat !== 2)) {
      if (beat === 0) this.pluck(this.near(root), time, dur * (style === 'waltz' ? 2 : 2.2), 0.9);
      else if (beat === 2 && style === 'ballad') this.pluck(this.near(fifth, this.lastBass), time, dur * 2, 0.6);
      return;
    }
    if (style === 'waltz') {
      if (beat === 0) this.pluck(this.near(root), time, dur * 1.2, 0.9);
      else this.pluck(this.near(fifth, this.lastBass), time, dur * 0.9, 0.5);
      return;
    }
    if (style === 'bossa' || style === 'latin') {
      // 1 . & 3 . & : root, root(and of 2), fifth, fifth(and of 4)
      if (beat === 0 || beat === 2) {
        const n = beat === 0 ? this.near(root) : this.near(fifth, this.lastBass - 5);
        this.pluck(n, time, dur * 1.4, beat === 0 ? 0.9 : 0.7);
      }
      if (beat === 1 || beat === 3) this.pluck(this.lastBass, time + dur / 2, dur * 0.9, 0.5);
      return;
    }
    if (style === 'straight' || style === 'funk' || style === 'even8ths') {
      if (beat === 0) this.pluck(this.near(root), time, dur * 0.9, 0.9);
      else if (beat === 2) this.pluck(this.near(fifth, this.lastBass), time, dur * 0.9, 0.7);
      else if (beat === 3 && last && nextRoot !== null) this.pluck(this.near(pc(nextRoot + 11), this.lastBass), time + dur / 2, dur * 0.4, 0.6);
      return;
    }
    // walking (swing): the line comes from the generator in packages/theory, which is where the
    // "root on 1, approach the next root on 4" rules live and are tested
    void third; void seventh; void fifth; void nextRoot; void last;
    const note = this.lineNote(c);
    const h = humanise(time, first ? 0.9 : 0.72, this.feel, this.rng, this.feel.bassOffset);
    this.pluck(note, h.time, dur * (swing ? 0.95 : 0.9), h.vel);
  }

  /**
   * Piano comping: the model voicing, placed with a real comping rhythm rather than on every
   * downbeat. This is what the learner is about to be asked to play, so hearing it in time is
   * itself the lesson.
   */
  private comp(time: number, beat: number, dur: number, c: BeatContext): void {
    if (!c.voicing?.length) return;
    const chorus = this.form?.chorus ?? 1;
    const figure = beat === 0
      ? (COMP_RHYTHMS[1 + Math.floor(this.rng() * (COMP_RHYTHMS.length - 1))] ?? COMP_RHYTHMS[0]!)
      : [];
    const hits = beat === 0 && chorus === 1 ? COMP_RHYTHMS[0]! : figure;   // first chorus: simple
    for (const hit of hits) {
      const at = time + (hit.at - beat) * dur;
      if (at < time - 1e-6) continue;
      const h = humanise(at, hit.vel * 0.5, this.feel, this.rng);
      for (const n of c.voicing) this.chime(n, h.time, dur * 1.6, h.vel);
    }
  }

  /** A soft piano-ish tone for the comp track — deliberately quieter than the player. */
  private chime(note: number, time: number, dur: number, vel: number): void {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel * 0.18, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    o.connect(lp).connect(g).connect(this.out);
    o.start(time); o.stop(time + dur + 0.05);
  }

  /** Nearest bass-register note (E1..G3) of a pitch class to a reference. */
  private near(p: number, ref = this.lastBass): number {
    let n = ref - ((((ref - p) % 12) + 12) % 12);
    if (ref - n > 6) n += 12;
    while (n < 28) n += 12;
    while (n > 55) n -= 12;
    this.lastBass = n;
    return n;
  }

  private pluck(note: number, time: number, dur: number, vel: number): void {
    const ctx = this.ctx;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vel * 0.5, time + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.2, time + Math.min(0.25, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, time); lp.frequency.exponentialRampToValueAtTime(300, time + dur);
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.out);
    o1.start(time); o2.start(time); o1.stop(time + dur + 0.05); o2.stop(time + dur + 0.05);
  }

  // ----------------------------------------------------------------- drums
  private drumsCountIn(time: number, beat: number, dur: number): void {
    // "one, two, a-one-two-three-four": the last bar of the count fills in the eighths
    this.hat(time, beat === 0 ? 0.55 : 0.4);
    this.rim(time, beat === 0 ? 0.5 : 0.35);
    if (beat >= 2) this.hat(time + dur * offbeatAt(this.transport.bpm, this.spec.style === 'swing'), 0.25);
  }

  private drums(time: number, beat: number, beatsPerBar: number, dur: number): void {
    const style = this.spec.style;
    const bpm = this.transport.bpm;
    // a fixed 2:1 sounds mechanical at both ends of the tempo range
    const swing8 = time + dur * offbeatAt(bpm, true);
    const straight8 = time + dur / 2;
    const f = this.form;
    const chorus = f?.chorus ?? 1;
    switch (style) {
      case 'swing': {
        const r = humanise(time, beat === 0 ? 0.55 : 0.45, this.feel, this.rng, this.feel.rideOffset);
        this.ride(r.time, r.vel);
        if (beat % 2 === 1) { this.ride(swing8 + this.feel.rideOffset, 0.3); this.hat(time, 0.5, true); }
        // feathered kick: felt more than heard
        if (beat === 0) this.kick(time, 0.12);
        if (beat === 0 && f) {
          // comping figure for the bar, and a crash when the form comes round
          for (const hit of pickFigure(COMP_FIGURES, f.bar, chorus, this.rng)) {
            const at = time + (hit.at - beat) * dur;
            if (at >= time) { const hh = humanise(at, hit.vel, this.feel, this.rng); this.snare(hh.time, hh.vel * 0.7); }
          }
          if (f.bar === 0 && chorus > 1) this.crash(time, 0.5);
        }
        // fill across the last two beats of a section
        if (f && isFillBar(f.bar, f.formBars) && beat >= beatsPerBar - 2) {
          this.snare(time + dur * 0.5, 0.35);
          this.snare(time + dur * offbeatAt(bpm, true), 0.28);
        }
        break;
      }
      case 'ballad':
        this.brush(time, dur, beat % 2 === 1 ? 0.35 : 0.25);
        if (beat % 2 === 1) this.hat(time, 0.35, true);
        break;
      case 'bossa':
      case 'latin': {
        this.hat(time, 0.3); this.hat(straight8, 0.2);
        this.kick(time, 0.35); if (beat === 1 || beat === 3) this.kick(straight8, 0.3);
        // 2-bar bossa clave rim pattern
        const bar2 = Math.floor((this.beatCounter++) / beatsPerBar) % 2;
        const rimBeats = bar2 === 0 ? [[0, 0], [1, 0.5], [3, 0]] : [[1, 0], [2, 0.5]];
        for (const [b, off] of rimBeats) if (b === beat) this.rim(time + dur * off!, 0.4);
        break;
      }
      case 'waltz':
        this.ride(time, beat === 0 ? 0.5 : 0.35);
        if (beat !== 0) this.hat(time, 0.3, true);
        break;
      default: // straight / funk / even8ths
        this.hat(time, 0.35); this.hat(straight8, 0.2);
        if (beat === 0 || beat === 2) this.kick(time, 0.5);
        if (beat === 1 || beat === 3) this.snare(time, 0.45);
    }
  }
  private beatCounter = 0;

  private noise(time: number, dur: number, vel: number, filter: { type: BiquadFilterType; freq: number; q?: number }): void {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(time); src.stop(time + dur + 0.01);
  }
  private ride(time: number, vel: number): void {
    this.noise(time, 0.5, vel * 0.5, { type: 'bandpass', freq: 5200, q: 1.2 });
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 3100;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vel * 0.12, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    o.connect(g).connect(this.out); o.start(time); o.stop(time + 0.4);
  }
  private hat(time: number, vel: number, foot = false): void { this.noise(time, foot ? 0.05 : 0.04, vel * 0.5, { type: 'highpass', freq: 8000 }); }
  private brush(time: number, dur: number, vel: number): void { this.noise(time, dur * 0.9, vel * 0.25, { type: 'bandpass', freq: 2500, q: 0.5 }); }
  private kick(time: number, vel: number): void {
    const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(120, time); o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vel, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    o.connect(g).connect(this.out); o.start(time); o.stop(time + 0.2);
  }
  private snare(time: number, vel: number): void {
    this.noise(time, 0.14, vel * 0.7, { type: 'highpass', freq: 1800 });
    const o = this.ctx.createOscillator(); o.frequency.value = 190;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vel * 0.4, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    o.connect(g).connect(this.out); o.start(time); o.stop(time + 0.12);
  }
  private rim(time: number, vel: number): void { this.noise(time, 0.03, vel, { type: 'bandpass', freq: 1800, q: 4 }); }
  private crash(time: number, vel: number): void {
    this.noise(time, 1.2, vel * 0.5, { type: 'highpass', freq: 3000 });
    this.noise(time, 0.6, vel * 0.3, { type: 'bandpass', freq: 900, q: 0.6 });
  }
}

function mulberry32(a: number): () => number {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
