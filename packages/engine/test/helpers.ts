import { ManualClock } from '../src/clock.js';
import { Transport, type ClickSink } from '../src/transport.js';

/** Manual timers driven by a ManualClock: advancing the clock fires due intervals/timeouts in order. */
export class ManualTimers {
  private intervals = new Map<number, { fn: () => void; ms: number; next: number }>();
  private timeouts = new Map<number, { fn: () => void; at: number }>();
  private id = 1;
  constructor(private clock: ManualClock) {}
  setInterval = (fn: () => void, ms: number): unknown => { const h = this.id++; this.intervals.set(h, { fn, ms, next: this.clock.now() + ms / 1000 }); return h; };
  clearInterval = (h: unknown): void => { this.intervals.delete(h as number); };
  setTimeout = (fn: () => void, ms: number): unknown => { const h = this.id++; this.timeouts.set(h, { fn, at: this.clock.now() + ms / 1000 }); return h; };
  clearTimeout = (h: unknown): void => { this.timeouts.delete(h as number); };
  /** Advance time in small steps, firing timers as they come due. */
  advance(seconds: number, step = 0.005): void {
    const end = this.clock.now() + seconds;
    while (this.clock.now() < end - 1e-9) {
      this.clock.set(Math.min(end, this.clock.now() + step));
      const now = this.clock.now();
      for (const [, it] of this.intervals) while (it.next <= now + 1e-9) { it.fn(); it.next += it.ms / 1000; }
      for (const [h, t] of [...this.timeouts]) if (t.at <= now + 1e-9) { this.timeouts.delete(h); t.fn(); }
    }
  }
}

export class RecordingSink implements ClickSink {
  clicks: Array<{ time: number; kind: string }> = [];
  click(time: number, kind: string): void { this.clicks.push({ time, kind }); }
}

export function makeTransport(bpm = 120, countInBars = 1) {
  const clock = new ManualClock();
  const timers = new ManualTimers(clock);
  const sink = new RecordingSink();
  const transport = new Transport(clock, sink, { bpm, countInBars, setInterval: timers.setInterval, clearInterval: timers.clearInterval });
  return { clock, timers, sink, transport };
}
