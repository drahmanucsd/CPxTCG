import { describe, expect, it } from 'vitest';
import { makeTransport } from './helpers.js';

describe('Transport', () => {
  it('schedules clicks ahead and emits beats on time', () => {
    const { timers, sink, transport } = makeTransport(120, 1);
    const beats: number[] = [];
    transport.on('beat', (b) => beats.push(b.index));
    transport.start(0.1);
    timers.advance(3);
    // count-in: 4 beats at 0.1..1.6; music beat 0 at 2.1, beats every 0.5s
    expect(sink.clicks.slice(0, 5).map((c) => c.kind)).toEqual(['countIn', 'countIn', 'countIn', 'countIn', 'bar']);
    expect(transport.beatTime(0)).toBeCloseTo(2.1, 5);
    expect(beats.slice(0, 6)).toEqual([-4, -3, -2, -1, 0, 1]);
    expect(sink.clicks[4]!.time).toBeCloseTo(2.1, 5);
  });
  it('setBpm keeps the current beat position', () => {
    const { timers, transport } = makeTransport(120, 0);
    transport.start(0);
    timers.advance(1.0); // 2 beats in
    const posBefore = transport.beatAt(1.0);
    transport.setBpm(60);
    expect(transport.beatAt(1.0)).toBeCloseTo(posBefore, 6);
    expect(transport.beatTime(3)).toBeCloseTo(2.0, 6);
  });
  it('stop halts beats', () => {
    const { timers, transport } = makeTransport(120, 0);
    let n = 0;
    transport.on('beat', () => n++);
    transport.start(0); timers.advance(1.1); transport.stop(); timers.advance(2);
    expect(n).toBe(3);
  });
});
