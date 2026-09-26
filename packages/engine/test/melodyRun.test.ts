import { describe, expect, it } from 'vitest';
import { MelodyRun } from '../src/melodyRun.js';
import { makeTransport } from './helpers.js';

function run(spec: Partial<ConstructorParameters<typeof MelodyRun>[0]['spec']> = {}, bpm = 120, countInBars = 1) {
  const { clock, timers, sink, transport } = makeTransport(bpm, countInBars);
  const r = new MelodyRun({
    clock, transport,
    spec: {
      title: 'test', bpm, timeSig: { beats: 4, unit: 4 }, countInBars,
      bars: 2, swing: false, subdivision: 'eighth', clickBeats: null, ...spec,
    },
  });
  return { clock, timers, sink, r };
}

describe('click placement', () => {
  it('2 and 4 only: the count-in still gives you all four, the music does not', () => {
    const { timers, sink, transport } = makeTransport(120, 1);
    transport.clickBeats = [1, 3];
    transport.start(0);
    timers.advance(3);
    const countIn = sink.clicks.filter((c) => c.kind === 'countIn');
    expect(countIn).toHaveLength(4);
    // music starts at 2.0s, beats every 0.5s: only 2.5 (beat 1) and 3.5 (beat 3) sound
    const music = sink.clicks.filter((c) => c.kind !== 'countIn').map((c) => Math.round(c.time * 1000));
    expect(music).toEqual([2500]);
    timers.advance(1);
    expect(sink.clicks.filter((c) => c.kind !== 'countIn').map((c) => Math.round(c.time * 1000))).toEqual([2500, 3500]);
  });
});

describe('MelodyRun', () => {
  it('ignores the count-in, records the music, and stops itself at the bar count', () => {
    const { timers, r } = run({ bars: 2 });
    let ended = false;
    r.on('end', () => { ended = true; });
    r.start(0);
    expect(r.state).toBe('countIn');
    // a note during the count-in does not count
    r.feed({ type: 'on', note: 60, velocity: 90, time: 1.0 });
    timers.advance(2.1);
    expect(r.state).toBe('running');
    // eight beats of music from t=2.0, one note per beat, dead on
    for (let i = 0; i < 8; i++) {
      r.feed({ type: 'on', note: 60 + i, velocity: 90, time: 2.0 + i * 0.5 });
      r.feed({ type: 'off', note: 60 + i, velocity: 0, time: 2.0 + i * 0.5 + 0.3 });
    }
    timers.advance(4.0);   // two bars of music end at t=6.0
    expect(ended).toBe(true);
    expect(r.state).toBe('ended');
    const rep = r.report();
    expect(rep.onsets).toHaveLength(8);
    expect(rep.timing.count).toBe(8);
    expect(rep.timing.spreadMs).toBeLessThan(1);
    expect(rep.timing.grade).toBe('tight');
    expect(rep.melody).toBeNull();
  });

  it('reports the offset of each note as it is played', () => {
    const { timers, r } = run();
    const live: number[] = [];
    r.on('note', (n) => live.push(Math.round(n.offsetMs)));
    r.start(0);
    timers.advance(2.1);
    r.feed({ type: 'on', note: 60, velocity: 90, time: 2.0 });         // on the beat
    r.feed({ type: 'on', note: 62, velocity: 90, time: 2.54 });        // 40 ms late
    r.feed({ type: 'on', note: 64, velocity: 90, time: 2.97 });        // 30 ms early
    expect(live).toEqual([0, 40, -30]);
  });

  it('keeps the take so a head you played can become the reference', () => {
    const { timers, r } = run({ bars: 1 });
    r.start(0);
    timers.advance(2.1);
    const pitches = [60, 62, 64, 65];
    pitches.forEach((n, i) => {
      r.feed({ type: 'on', note: n, velocity: 90, time: 2.0 + i * 0.5 + 0.012 });
      r.feed({ type: 'off', note: n, velocity: 0, time: 2.0 + i * 0.5 + 0.44 });
    });
    timers.advance(2.6);
    const take = r.report().take;
    expect(take.source).toBe('recorded');
    expect(take.notes.map((n) => n.midi)).toEqual(pitches);
    expect(take.notes.map((n) => n.start)).toEqual([0, 1, 2, 3]);
  });

  it('a note still held when the run ends lasts to the end, not to the clock epoch', () => {
    const { timers, r } = run({ bars: 1 });
    r.start(0);
    timers.advance(2.1);
    r.feed({ type: 'on', note: 60, velocity: 90, time: 2.0 });   // held, never released
    timers.advance(2.6);                                          // one bar of music ends at t=4.0
    const take = r.report().take;
    expect(take.notes).toHaveLength(1);
    expect(take.notes[0]!.start).toBe(0);
    expect(take.notes[0]!.beats).toBe(4);
  });

  it('with a written melody it grades pitch as well as time', () => {
    const melody = {
      beatsPerBar: 4, source: 'builtin' as const,
      notes: [0, 1, 2, 3].map((i) => ({ midi: [60, 62, 64, 65][i]!, start: i, beats: 1 })),
    };
    const { timers, r } = run({ bars: 1, melody, formBeats: 4 });
    r.start(0);
    timers.advance(2.1);
    [60, 62, 64, 65].forEach((n, i) => r.feed({ type: 'on', note: n, velocity: 90, time: 2.0 + i * 0.5 + 0.02 }));
    timers.advance(2.6);
    const rep = r.report();
    expect(rep.melody).not.toBeNull();
    expect(rep.melody!.counts.missed).toBe(0);
    expect(rep.melody!.counts.wrongPitch).toBe(0);
    expect(rep.melody!.score).toBe(1);
  });

  it('a note the book holds, struck twice, comes back as a duration error', () => {
    const melody = {
      beatsPerBar: 4, source: 'builtin' as const,
      notes: [{ midi: 60, start: 0, beats: 4 }],       // one note, a whole bar long
    };
    const { timers, r } = run({ bars: 1, melody, formBeats: 4, swing: false });
    r.start(0);
    timers.advance(2.1);
    // played as two: the thing you do when you learned it off a recording
    r.feed({ type: 'on', note: 60, velocity: 90, time: 2.0 });
    r.feed({ type: 'off', note: 60, velocity: 0, time: 2.9 });
    r.feed({ type: 'on', note: 60, velocity: 90, time: 3.0 });
    r.feed({ type: 'off', note: 60, velocity: 0, time: 3.9 });
    timers.advance(2.6);
    const cmp = r.report().melody!;
    expect(cmp.counts.split).toBe(1);
    expect(cmp.notes[0]!.restrikes).toBe(1);
    expect(cmp.headline).toMatch(/durations are not/);
  });
});
