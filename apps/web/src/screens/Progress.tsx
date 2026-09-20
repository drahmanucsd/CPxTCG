import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { useState } from 'react';
import { db } from '../db';
import { Heatmap } from '../components/Heatmap';
import { heatByFamily, heatByQuality, recentAttempts, streakDays, weakSpots } from '../lib/stats';
import { FAMILY_LABEL } from '../lib/suffix';
import { PC_NAMES_FLAT } from '@shed/theory';

export default function Progress() {
  const rows = useLiveQuery(() => recentAttempts(60), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(30).toArray(), []) ?? [];
  const [by, setBy] = useState<'family' | 'quality'>('family');
  const heat = by === 'family' ? heatByFamily(rows) : heatByQuality(rows);
  const weak = weakSpots(rows, 6);
  const minutesThisWeek = Math.round(sessions.filter((s) => s.startedAt > Date.now() - 7 * 86_400_000).reduce((a, s) => a + (s.endedAt - s.startedAt), 0) / 60_000);
  const exportJson = async () => {
    const data = { sessions: await db.sessions.toArray(), attempts: await db.attempts.toArray(), drills: await db.drills.toArray(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shed-export-${Date.now()}.json`; a.click();
  };
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <button className="btn btn-ghost" onClick={() => void exportJson()}>Export JSON</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card"><div className="label">Streak</div><div className="text-2xl font-semibold mt-1">{streakDays(sessions)} days</div></div>
        <div className="card"><div className="label">This week</div><div className="text-2xl font-semibold mt-1">{minutesThisWeek} min</div></div>
        <div className="card"><div className="label">Chords (60 days)</div><div className="text-2xl font-semibold mt-1">{rows.length}</div></div>
      </div>
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="label">Heatmap</div>
          <div className="flex gap-1 text-xs">
            <button className={`rounded-full px-3 py-1 ${by === 'family' ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim'}`} onClick={() => setBy('family')}>by voicing</button>
            <button className={`rounded-full px-3 py-1 ${by === 'quality' ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim'}`} onClick={() => setBy('quality')}>by chord type</button>
          </div>
        </div>
        {rows.length ? <Heatmap cells={heat.cells} cols={heat.cols} colLabel={(c) => (by === 'family' ? FAMILY_LABEL[c] ?? c : c)} /> : <div className="text-ink-dim text-sm">Run a drill and this fills in.</div>}
      </section>
      {weak.length > 0 && (
        <section>
          <div className="label mb-2">Weak spots</div>
          <div className="flex flex-wrap gap-2">
            {weak.map((w) => <span key={`${w.root}${w.suffix}${w.family}`} className="rounded-lg bg-panel px-3 py-2 text-sm"><span className="font-medium">{PC_NAMES_FLAT[w.root]}{w.suffix}</span> <span className="text-ink-dim">{FAMILY_LABEL[w.family] ?? w.family} · {Math.round(w.acc * 100)}%</span></span>)}
          </div>
        </section>
      )}
      <section>
        <div className="label mb-2">Sessions</div>
        <div className="divide-y divide-line/60">
          {sessions.map((s) => (
            <Link key={s.id} to={`/review/${s.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-accent">
              <span className="text-ink-faint w-28 shrink-0">{new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="flex-1 truncate">{s.specName}</span>
              <span className={s.total && s.correct / s.total >= 0.9 ? 'text-good' : 'text-ink-dim'}>{s.total ? Math.round((100 * s.correct) / s.total) : 0}%</span>
              {s.finalBpm > 0 && <span className="text-ink-faint w-16 text-right">{s.finalBpm} bpm</span>}
            </Link>
          ))}
          {!sessions.length && <div className="text-ink-dim text-sm py-2">No sessions yet.</div>}
        </div>
      </section>
    </div>
  );
}
