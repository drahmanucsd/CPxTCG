import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DrillSpec, Outcome, TargetResult } from '@shed/engine';
import { PRESET_BY_ID } from '@shed/engine';
import { db } from '../db';
import { ChordText } from '../components/ChordDisplay';
import { Keyboard } from '../components/Keyboard';
import { TimingStrip } from '../components/TimingStrip';
import { BackLink } from '../components/BackLink';
import { FAMILY_LABEL, suffixOf } from '../lib/suffix';
import { useSettings } from '../store/settings';
import { getAudio, playVoicing, unlockAudio } from '../audio/context';
import {
  OUTCOME_BG, OUTCOME_LABEL, byKey, byPosition, byQuality, fmtDuration, fmtMs, latencySuspect, normalize, verdictFor, type Cell,
} from '../lib/review';

const OUTCOMES: Outcome[] = ['clean', 'timing', 'wrong', 'blank'];

export default function Review() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const session = useLiveQuery(() => db.sessions.get(sessionId ?? ''), [sessionId]);
  const history = useLiveQuery(
    async () => (session ? db.sessions.where('specId').equals(session.specId).sortBy('startedAt') : []),
    [session?.specId],
  ) ?? [];
  const [filter, setFilter] = useState<Outcome | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);

  const s = useMemo(() => (session ? normalize(session.summary) : null), [session]);
  if (!session || !s) return <div className="text-ink-dim">Loading…</div>;

  const timed = !!s.finalBpm;
  const v = verdictFor(s, { timed });
  const pct = (n: number) => (s.total ? Math.round((100 * n) / s.total) : 0);
  const shown = filter ? s.results.filter((r) => r.outcome === filter) : s.results;
  const latency = latencySuspect(s.timing);

  // previous runs of this same drill, oldest first, this one last
  const runs = history.map((h) => {
    const n = normalize(h.summary);
    return { id: h.id, at: h.startedAt, clean: n.total ? n.clean / n.total : 0, bpm: n.finalBpm };
  });
  const prev = runs[runs.findIndex((r) => r.id === session.id) - 1];
  const delta = prev ? pct(s.clean) - Math.round(prev.clean * 100) : null;
  const bestCleanTempo = Math.max(0, ...runs.filter((r) => r.clean >= 0.9).map((r) => r.bpm));

  const plan = readPlan();
  const nextBlock = plan && plan.ids[plan.index] === session.specId && plan.index + 1 < plan.ids.length
    ? { id: plan.ids[plan.index + 1]!, title: plan.titles[plan.index + 1]! } : null;
  const goNext = () => {
    if (!plan || !nextBlock) return;
    sessionStorage.setItem('shed.plan', JSON.stringify({ ...plan, index: plan.index + 1 }));
    nav(`/drill/${nextBlock.id}`);
  };

  /** The one action the verdict recommends. Everything else is a secondary link. */
  const takeAction = async () => {
    const base = PRESET_BY_ID[session.specId] ?? (await db.drills.get(session.specId))?.spec;
    if (v.kind === 'misses' && v.focus.length) return void drillThese(v.focus, base);
    if ((v.kind === 'slower' || v.kind === 'faster' || v.kind === 'noHints') && base && v.bpm) {
      const spec: DrillSpec = {
        ...base, id: crypto.randomUUID(), name: `${base.name} · ${v.bpm}`,
        pacing: { ...base.pacing, bpm: v.bpm }, ladder: undefined,
      };
      await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
      return nav(`/drill/${spec.id}`);
    }
    nav(`/drill/${session.specId}`);
  };

  const drillThese = async (rs: TargetResult[], base?: DrillSpec) => {
    const spec: DrillSpec = {
      ...(base ?? { families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict', lookAhead: 'always' } as DrillSpec),
      id: crypto.randomUUID(), name: `Fix: ${session.specName}`, description: `The ${rs.length} chords you missed, free time.`,
      generator: { kind: 'progression', chords: rs.map((m) => ({ chord: m.chord, beats: 4 })), label: 'misses' },
      pacing: { mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, advance: 'onCorrect', holdMs: 350 },
      length: { passes: 2 }, ladder: undefined,
    };
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: true });
    nav(`/drill/${spec.id}`);
  };

  const replay = async () => {
    const ev = session.midi ?? [];
    if (!ev.length) return;
    await unlockAudio();
    const { ctx, piano } = getAudio();
    const t0 = ctx.currentTime + 0.1;
    const ons = new Map<number, number>();
    for (const [type, note, t, vel] of ev) {
      if (type === 1) ons.set(note, t);
      else { const on = ons.get(note); if (on !== undefined) { piano.play(note, t0 + on, Math.max(0.15, t - on), vel / 127); ons.delete(note); } }
    }
    for (const [note, on] of ons) piano.play(note, t0 + on, 0.6, 0.7);
    setReplaying(true);
    setTimeout(() => setReplaying(false), (ev[ev.length - 1]![2] + 1) * 1000);
  };

  const actionLabel = v.kind === 'misses' ? `Drill those ${new Set(v.focus.map((f) => f.chordText)).size}`
    : v.kind === 'slower' ? `Again at ${v.bpm}`
    : v.kind === 'faster' ? `Push to ${v.bpm}`
    : v.kind === 'noHints' ? `Again at ${v.bpm}, no hints`
    : 'Again';

  return (
    <div className="space-y-6">
      <div>
        <BackLink to="/" label="Today" />
        <div className="flex flex-wrap items-baseline gap-3 mt-1">
          <h1 className="text-2xl font-semibold tracking-tight">{session.specName}</h1>
          <span className="text-sm text-ink-dim tabular-nums">
            {timed ? `${s.startBpm === s.finalBpm ? '' : `${s.startBpm} → `}${s.finalBpm} bpm · ` : ''}{fmtDuration(session.endedAt - session.startedAt)}
          </span>
        </div>
      </div>

      {/* the verdict, and the one thing to do about it */}
      <div className="card flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="label">Verdict</div>
          <div className="text-lg mt-0.5">{v.line}</div>
        </div>
        <button className="btn btn-primary" onClick={() => void takeAction()}>{actionLabel}</button>
      </div>

      {/* the four outcomes — click one to filter the run below */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {OUTCOMES.map((o) => {
          const n = s.outcomes[o];
          const on = filter === o;
          return (
            <button
              key={o}
              className={`card text-left ${on ? 'border-accent' : n ? '' : 'opacity-50'}`}
              onClick={() => setFilter(on ? null : n ? o : null)}
              aria-pressed={on}
            >
              <div className="label">{OUTCOME_LABEL[o]}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-semibold tabular-nums ${n ? '' : 'text-ink-faint'}`}>{n}</span>
                <span className="text-sm text-ink-dim tabular-nums">{pct(n)}%</span>
                {o === 'clean' && delta !== null && <span className={`text-xs tabular-nums ${delta > 0 ? 'text-good' : delta < 0 ? 'text-bad' : 'text-ink-faint'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
              </div>
              {o === 'clean' && s.assisted > 0 && <div className="text-xs text-accent mt-1">{s.assisted} with a hint</div>}
            </button>
          );
        })}
      </div>

      {timed && s.timing && s.timing.offsets.length > 0 && (
        <section className="card space-y-1">
          <div className="flex items-baseline justify-between">
            <div className="label">Timing</div>
            <div className="text-sm text-ink-dim tabular-nums">median {fmtMs(s.timing.medianMs)} · spread {Math.round(s.timing.spreadMs)} ms</div>
          </div>
          <TimingStrip results={s.results} medianMs={s.timing.medianMs} />
          {latency !== null && (
            <div className="text-xs text-ink-dim">
              A steady {fmtMs(latency)} with a tight spread usually means input latency, not playing.{' '}
              <Link className="text-accent" to="/devices">Calibrate it</Link> instead of practising around it.
            </div>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <div className="label">Where it broke</div>
        <Breakdown title="By key" cells={byKey(s.results)} />
        <Breakdown title="By quality" cells={byQuality(s.results, (r) => suffixOf(r.chord))} />
        {byPosition(s.results).length > 0 && <Breakdown title="In the phrase" cells={byPosition(s.results)} />}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="label">The run{filter ? ` · ${OUTCOME_LABEL[filter].toLowerCase()} only` : ''}</div>
          {filter && <button className="text-xs text-ink-faint hover:text-ink" onClick={() => setFilter(null)}>show all</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((r) => (
            <button
              key={r.index}
              className={`rounded-md px-2 py-1 text-sm ${OUTCOME_BG[r.outcome]} ${open === r.index ? 'ring-1 ring-accent' : ''}`}
              title={`${r.message}${r.latenessMs !== null ? ` · ${fmtMs(r.latenessMs)}` : ''}${r.repeats ? ` · ${r.repeats} repeats` : ''}`}
              onClick={() => setOpen(open === r.index ? null : r.index)}
            >
              <ChordText chord={r.chord} style={settings.displayStyle} />
              {r.assisted && <sup className="text-accent ml-0.5">h</sup>}
            </button>
          ))}
          {!shown.length && <div className="text-sm text-ink-faint">None — nothing landed in this bucket.</div>}
        </div>
        {open !== null && (() => {
          const r = s.results.find((x) => x.index === open);
          if (!r) return null;
          return (
            <div className="card space-y-2">
              <div className="flex flex-wrap items-baseline gap-3">
                <ChordText chord={r.chord} style={settings.displayStyle} className="text-2xl font-semibold" />
                <span className="text-xs text-ink-dim">{FAMILY_LABEL[r.family] ?? r.family} · {r.label}</span>
                <span className={`text-sm ${r.outcome === 'clean' ? 'text-good' : r.outcome === 'timing' ? 'text-warn' : 'text-bad'}`}>{r.message}</span>
                {r.latenessMs !== null && <span className="text-sm text-ink-dim tabular-nums">{fmtMs(r.latenessMs)}</span>}
              </div>
              <Keyboard
                hint={r.targetNotes.filter((n) => !r.playedNotes.includes(n))}
                good={r.playedNotes.filter((n) => r.targetNotes.includes(n))}
                bad={r.playedNotes.filter((n) => !r.targetNotes.includes(n))}
                labels
              />
              <button className="btn btn-ghost !py-1" onClick={() => playVoicing(r.targetNotes)}>Play the voicing</button>
            </div>
          );
        })()}
      </section>

      {runs.length > 1 && (
        <section className="card">
          <div className="flex items-baseline justify-between">
            <div className="label">This drill, last {Math.min(10, runs.length)} runs</div>
            {bestCleanTempo > 0 && <div className="text-sm text-ink-dim tabular-nums">best clean tempo {bestCleanTempo}</div>}
          </div>
          <div className="flex items-end gap-1 h-12 mt-2">
            {runs.slice(-10).map((r) => (
              <div key={r.id} className="flex-1 bg-panel-2 rounded-sm relative" style={{ height: '100%' }} title={`${Math.round(r.clean * 100)}% clean at ${r.bpm}`}>
                <div className={`absolute bottom-0 left-0 right-0 rounded-sm ${r.id === session.id ? 'bg-accent' : 'bg-good/60'}`} style={{ height: `${Math.max(2, r.clean * 100)}%` }} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {nextBlock && <button className="btn btn-primary" onClick={goNext}>Next block: {nextBlock.title} →</button>}
        <Link to={`/drill/${session.specId}`} className="btn btn-ghost">Same again</Link>
        {v.kind !== 'misses' && v.focus.length > 0 && <button className="btn btn-ghost" onClick={() => void drillThese(v.focus, PRESET_BY_ID[session.specId])}>Drill the misses</button>}
        {session.midi && session.midi.length > 0 && <button className="btn btn-ghost" onClick={() => void replay()} disabled={replaying}>{replaying ? 'Replaying…' : 'Replay what I played'}</button>}
        <Link to="/" className="btn btn-ghost">Done</Link>
      </div>
    </div>
  );
}

/** A row of cells with accuracy shading — cold cells are the point. */
function Breakdown({ title, cells }: { title: string; cells: Cell[] }) {
  if (!cells.length) return null;
  return (
    <div className="flex items-start gap-3">
      <div className="text-xs text-ink-faint w-20 shrink-0 pt-1.5">{title}</div>
      <div className="flex flex-wrap gap-1">
        {cells.map((c) => {
          const acc = c.total ? c.clean / c.total : 0;
          const tone = acc >= 0.9 ? 'bg-good/25 text-good' : acc >= 0.6 ? 'bg-warn/20 text-warn' : 'bg-bad/20 text-bad';
          return (
            <span key={c.key} className={`rounded-md px-2 py-1 text-xs tabular-nums ${tone}`} title={`${c.clean}/${c.total} clean`}>
              {c.label} {Math.round(acc * 100)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

function readPlan(): { ids: string[]; titles: string[]; index: number } | null {
  try { const raw = sessionStorage.getItem('shed.plan'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
