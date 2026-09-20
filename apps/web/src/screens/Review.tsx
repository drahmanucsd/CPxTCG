import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DrillSpec, TargetResult } from '@shed/engine';
import { PRESET_BY_ID } from '@shed/engine';
import { db } from '../db';
import { ChordText } from '../components/ChordDisplay';
import { Keyboard } from '../components/Keyboard';
import { FAMILY_LABEL } from '../lib/suffix';
import { useSettings } from '../store/settings';
import { useState } from 'react';
import { playVoicing } from '../audio/context';

export default function Review() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const session = useLiveQuery(() => db.sessions.get(sessionId ?? ''), [sessionId]);
  const [open, setOpen] = useState<number | null>(null);
  if (!session) return <div className="text-ink-dim">Loading…</div>;
  const s = session.summary;
  const misses = s.results.filter((r) => !r.ok);
  const grouped = new Map<string, TargetResult[]>();
  for (const m of misses) { const k = `${m.chordText} ${m.family}`; grouped.set(k, [...(grouped.get(k) ?? []), m]); }
  const acc = s.total ? Math.round((100 * s.correct) / s.total) : 0;
  const plan = readPlan();
  const nextBlock = plan && plan.ids[plan.index] === session.specId && plan.index + 1 < plan.ids.length ? { id: plan.ids[plan.index + 1]!, title: plan.titles[plan.index + 1]! } : null;
  const goNext = () => { if (!plan || !nextBlock) return; sessionStorage.setItem('shed.plan', JSON.stringify({ ...plan, index: plan.index + 1 })); nav(`/drill/${nextBlock.id}`); };

  const drillThese = async () => {
    const base = PRESET_BY_ID[session.specId] ?? (await db.drills.get(session.specId))?.spec;
    const chords = misses.map((m) => ({ chord: m.chord, beats: 4 }));
    const spec: DrillSpec = {
      ...(base ?? { families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict', lookAhead: 'always' } as DrillSpec),
      id: crypto.randomUUID(), name: `Fix: ${session.specName}`, description: `The ${misses.length} chords you missed, free time.`,
      generator: { kind: 'progression', chords, label: 'misses' }, pacing: { mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, holdMs: 350 }, length: { passes: 2 }, ladder: undefined,
    };
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: true });
    nav(`/drill/${spec.id}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Session review</div>
        <h1 className="text-2xl font-semibold tracking-tight">{session.specName}</h1>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Accuracy" value={`${acc}%`} tone={acc >= 90 ? 'good' : acc >= 70 ? 'warn' : 'bad'} />
        <Stat label="Chords" value={`${s.correct} / ${s.total}`} />
        <Stat label="Avg lateness" value={s.avgLatenessMs === null ? '—' : `${s.avgLatenessMs > 0 ? '+' : ''}${s.avgLatenessMs} ms`} />
        <Stat label={s.finalBpm ? 'Final tempo' : 'Hints'} value={s.finalBpm ? `${s.finalBpm} bpm` : String(s.hintsUsed)} />
      </div>
      {misses.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="label">What you missed</div>
            <button className="btn btn-primary" onClick={() => void drillThese()}>Drill these {misses.length}</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[...grouped.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, rs]) => {
              const r = rs[0]!;
              const isOpen = open === r.index;
              return (
                <div key={k} className="card cursor-pointer" onClick={() => setOpen(isOpen ? null : r.index)}>
                  <div className="flex items-center gap-3">
                    <ChordText chord={r.chord} style={settings.displayStyle} className="text-2xl font-semibold" />
                    <span className="text-xs text-ink-dim">{FAMILY_LABEL[r.family] ?? r.family} · {r.label}</span>
                    <span className="ml-auto text-bad text-sm">×{rs.length}</span>
                  </div>
                  <div className="text-sm text-ink-dim mt-1">{r.message}</div>
                  {isOpen && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <Keyboard hint={r.targetNotes} bad={r.playedNotes.filter((n) => !r.targetNotes.includes(n))} good={r.playedNotes.filter((n) => r.targetNotes.includes(n))} labels />
                      <button className="btn btn-ghost !py-1 mt-2" onClick={() => playVoicing(r.targetNotes)}>Play the voicing</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="card text-good">Clean run. {s.finalBpm ? 'Push the tempo.' : 'Try it timed.'}</div>
      )}
      <section>
        <div className="label mb-2">Every chord</div>
        <div className="flex flex-wrap gap-1.5">
          {s.results.map((r) => (
            <span key={r.index} title={`${r.message}${r.latenessMs !== null ? ` · ${r.latenessMs} ms` : ''}`} className={`rounded-md px-2 py-1 text-sm ${r.ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
              <ChordText chord={r.chord} style={settings.displayStyle} />{r.hints > 0 && <sup className="text-accent ml-0.5">h</sup>}{r.spoken && <sup className={`ml-0.5 ${r.spoken.ok ? 'text-good' : 'text-bad'}`} title={r.spoken.heard}>🎤</sup>}
            </span>
          ))}
        </div>
      </section>
      <div className="flex gap-2">
        {nextBlock && <button className="btn btn-primary" onClick={goNext}>Next block: {nextBlock.title} →</button>}
        <Link to={`/drill/${session.specId}`} className={`btn ${nextBlock ? 'btn-ghost' : 'btn-primary'}`}>Again</Link>
        <Link to="/" className="btn btn-ghost">Done</Link>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  return <div className="card"><div className="label">{label}</div><div className={`text-2xl font-semibold mt-1 ${tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : ''}`}>{value}</div></div>;
}

function readPlan(): { ids: string[]; titles: string[]; index: number } | null {
  try { const raw = sessionStorage.getItem('shed.plan'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
