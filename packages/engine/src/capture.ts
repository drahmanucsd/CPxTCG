/**
 * Chord capture: turns a stream of MIDI note on/off events into "attempts" — the set of notes
 * the player meant as one chord. Handles rolled chords and early releases.
 *
 *   idle → collecting (first note-on) → settled (no new note-on for settleMs, or forced) → idle
 */
import { Emitter } from './clock.js';

export interface NoteEvent { type: 'on' | 'off'; note: number; velocity: number; /** clock seconds */ time: number }

export interface Attempt {
  /** Sorted unique notes that were sounding (or released within graceMs) at settle time. */
  notes: number[];
  /** Time of the first note-on of this attempt (the attack). */
  attackTime: number;
  /** Time the attempt was settled. */
  settleTime: number;
  velocities: Record<number, number>;
}

export interface CaptureEvents extends Record<string, unknown> { attempt: Attempt; notes: { held: number[] } }

export interface CaptureOptions {
  /** No new note-on for this long → the chord is settled. */
  settleMs?: number;
  /** Notes released this recently still count as part of the chord. */
  graceMs?: number;
  /** Ignore attempts with fewer notes (single-note noodling). */
  minNotes?: number;
}

export class ChordCapture extends Emitter<CaptureEvents> {
  private held = new Map<number, number>();          // note → velocity
  private recentlyReleased = new Map<number, number>(); // note → release time
  private attackTime: number | null = null;
  private lastOn = 0;
  private velocities: Record<number, number> = {};
  readonly settleMs: number;
  readonly graceMs: number;
  readonly minNotes: number;

  constructor(opts: CaptureOptions = {}) {
    super();
    this.settleMs = opts.settleMs ?? 70;
    this.graceMs = opts.graceMs ?? 150;
    this.minNotes = opts.minNotes ?? 1;
  }

  get heldNotes(): number[] { return [...this.held.keys()].sort((a, b) => a - b); }
  get isCollecting(): boolean { return this.attackTime !== null; }

  /** Feed a note event. Call `update(now)` periodically (or after each event) to settle. */
  feed(e: NoteEvent): void {
    if (e.type === 'on' && e.velocity > 0) {
      this.held.set(e.note, e.velocity);
      this.recentlyReleased.delete(e.note);
      this.velocities[e.note] = e.velocity;
      if (this.attackTime === null) {
        this.attackTime = e.time; this.velocities = { [e.note]: e.velocity };
        // releases from before this attack belong to the previous chord
        for (const [n, t] of this.recentlyReleased) if (t <= e.time) this.recentlyReleased.delete(n);
      }
      this.lastOn = e.time;
    } else {
      if (this.held.delete(e.note)) this.recentlyReleased.set(e.note, e.time);
    }
    this.emit('notes', { held: this.heldNotes });
    this.update(e.time);
  }

  /** Settle if quiet for settleMs. Returns the attempt if one was emitted. */
  update(now: number): Attempt | null {
    if (this.attackTime === null) return null;
    if ((now - this.lastOn) * 1000 < this.settleMs) return null;
    return this.settle(now);
  }

  /** Force-settle whatever is being collected (e.g. the grading window closed). */
  settle(now: number): Attempt | null {
    if (this.attackTime === null) return null;
    const notes = new Set(this.held.keys());
    for (const [n, t] of this.recentlyReleased) if ((now - t) * 1000 <= this.graceMs + this.settleMs) notes.add(n);
    const attempt: Attempt = { notes: [...notes].sort((a, b) => a - b), attackTime: this.attackTime, settleTime: now, velocities: { ...this.velocities } };
    this.attackTime = null;
    this.recentlyReleased.clear();
    if (attempt.notes.length >= this.minNotes) { this.emit('attempt', attempt); return attempt; }
    return null;
  }

  /** Forget everything (e.g. drill reset). */
  reset(): void { this.held.clear(); this.recentlyReleased.clear(); this.attackTime = null; this.velocities = {}; }
}
