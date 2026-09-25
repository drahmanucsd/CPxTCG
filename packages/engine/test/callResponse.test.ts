import { describe, expect, it } from 'vitest';
import { FIGURE_BY_ID, figureBeats } from '@shed/theory';
import { CallResponse, type CallResponseSpec } from '../src/callResponse.js';
import { makeTransport } from './helpers.js';

const BPM = 120;
const BEAT = 0.5;

function make(over: Partial<CallResponseSpec> = {}) {
  const { timers, transport, sink } = makeTransport(BPM, 1);
  const spec: CallResponseSpec = {
    figure: FIGURE_BY_ID['push-into-1']!,
    bpm: BPM, timeSig: { beats: 4, unit: 4 }, countInBars: 1, swing: false,
    clickBeats: null, callEvery: true, target: 2, windowMs: 80, voice: [72],
    ...over,
  };
  const cr = new CallResponse({ spec, transport });
  return { timers, transport, sink, cr };
}

/** Music beat 0 is at t = 2.0 with a one-bar count-in at 120. */
const t = (beat: number) => 2.0 + beat * BEAT;

describe('CallResponse', () => {
  it('plays the call at the figure’s placements, then hands the same bars back to you', () => {
    const { timers, cr } = make();
    const phases: string[] = [];
    const plays: number[] = [];
    cr.on('phase', (p) => phases.push(p.phase));
    cr.on('play', (p) => plays.push(Math.round((p.time - 2.0) * 1000) / 1000));
    cr.start(0);
    timers.advance(2.2);
    expect(phases).toEqual(['countIn', 'call']);
    timers.advance(2.5);                       // through the first bar of the call
    // push-into-1 is two bars: 1 2 3 4& then silence
    expect(figureBeats(cr.spec.figure, BPM, false)).toEqual([0, 1, 2, 3.5]);
    expect(plays).toEqual([0, 0.5, 1, 1.75]);
    // eight beats of call, then the response window opens
    timers.advance(1.5);
    expect(cr.phase).toBe('response');
  });

  it('a clean answer twice in a row ends the run', () => {
    const { timers, cr } = make({ target: 2 });
    const streaks: number[] = [];
    let ended = false;
    cr.on('result', (r) => streaks.push(r.streak));
    cr.on('end', () => { ended = true; });
    cr.start(0);
    // round 1: call beats 0-7, response beats 8-15
    timers.advance(6.2);
    expect(cr.phase).toBe('response');
    for (const b of [0, 1, 2, 3.5]) cr.feed({ type: 'on', note: 60, velocity: 90, time: t(8 + b) });
    timers.advance(4.0);
    // round 2: call beats 16-23, response 24-31
    timers.advance(4.0);
    expect(cr.phase).toBe('response');
    for (const b of [0, 1, 2, 3.5]) cr.feed({ type: 'on', note: 60, velocity: 90, time: t(24 + b) });
    timers.advance(4.2);
    expect(streaks).toEqual([1, 2]);
    expect(ended).toBe(true);
    expect(cr.best).toBe(2);
  });

  it('flattening the push breaks the streak and says so', () => {
    const { timers, cr } = make({ target: 3 });
    const results: string[] = [];
    const streaks: number[] = [];
    cr.on('result', (r) => { results.push(r.verdict.headline); streaks.push(r.streak); });
    cr.start(0);
    timers.advance(6.2);
    for (const b of [0, 1, 2, 3.5]) cr.feed({ type: 'on', note: 60, velocity: 90, time: t(8 + b) });
    timers.advance(8.0);
    // second answer: the push put on the downbeat of the next bar
    for (const b of [0, 1, 2, 4]) cr.feed({ type: 'on', note: 60, velocity: 90, time: t(24 + b) });
    timers.advance(4.2);
    expect(streaks).toEqual([1, 0]);
    expect(results[1]).toMatch(/flattened the push/);
  });

  it('notes played during the call are not an answer', () => {
    const { timers, cr } = make();
    cr.start(0);
    timers.advance(2.2);
    expect(cr.phase).toBe('call');
    for (const b of [0, 1, 2, 3.5]) cr.feed({ type: 'on', note: 60, velocity: 90, time: t(b) });
    let verdict: string | null = null;
    cr.on('result', (r) => { verdict = r.verdict.headline; });
    timers.advance(8.0);   // through the response window, answering nothing
    expect(verdict).toBe('Nothing landed');
  });

  it('call once, then keep going: no call between answers', () => {
    const { timers, cr } = make({ callEvery: false, target: 99, maxRounds: 3 });
    const phases: string[] = [];
    cr.on('phase', (p) => phases.push(p.phase));
    cr.start(0);
    timers.advance(20);
    expect(phases.filter((p) => p === 'call')).toHaveLength(1);
    expect(phases.filter((p) => p === 'response').length).toBeGreaterThan(1);
  });

  it('stops after maxRounds even when nothing is ever right', () => {
    const { timers, cr } = make({ target: 5, maxRounds: 2, callEvery: false });
    let rounds = 0;
    cr.on('end', (e) => { rounds = e.rounds; });
    cr.start(0);
    timers.advance(30);
    expect(rounds).toBe(2);
    expect(cr.phase).toBe('ended');
  });
});
