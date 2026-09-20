/** Time sources. All engine times are seconds on a monotonic clock (the audio clock in the browser). */

export interface Clock {
  /** Current time in seconds. */
  now(): number;
  /** Convert a DOMHighResTimeStamp (ms, performance.now() domain) to clock seconds. */
  fromPerformance(ms: number): number;
}

export class ManualClock implements Clock {
  private t = 0;
  now(): number { return this.t; }
  fromPerformance(ms: number): number { return ms / 1000; }
  set(t: number): void { this.t = t; }
  advance(dt: number): void { this.t += dt; }
}

/** Wraps an AudioContext; aligns performance.now() to the audio clock via getOutputTimestamp. */
export class AudioClock implements Clock {
  private offsetSec = 0; // audioTime - perfTime/1000
  constructor(private readonly ctx: AudioContext) { this.resync(); }
  now(): number { return this.ctx.currentTime; }
  resync(): void {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined) {
      this.offsetSec = ts.contextTime - ts.performanceTime / 1000;
    } else {
      this.offsetSec = this.ctx.currentTime - performance.now() / 1000;
    }
  }
  fromPerformance(ms: number): number { return ms / 1000 + this.offsetSec; }
}

/** Tiny typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();
  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(fn as (payload: never) => void);
    return () => { set!.delete(fn as (payload: never) => void); };
  }
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) (fn as (p: Events[K]) => void)(payload);
  }
  clear(): void { this.listeners.clear(); }
}
