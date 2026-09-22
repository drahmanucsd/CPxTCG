import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { COURSE_BY_ID, STAGES, stageSpec, type StageId } from '@shed/engine';
import { PC_NAMES_FLAT, chooseVoicing, generateVoicings, iiVI, type PitchClass, type Voicing } from '@shed/theory';
import { db } from '../db';
import { recentAttempts } from '../lib/stats';
import { courseProgress, nextStage } from '../lib/mastery';
import { KeyRing } from '../components/KeyRing';
import { BackLink } from '../components/BackLink';
import { Keyboard } from '../components/Keyboard';
import { ChordText } from '../components/ChordDisplay';
import { playVoicing, unlockAudio } from '../audio/context';
import { useSettings } from '../store/settings';

const DEGREE: Record<number, string> = { 0: '1', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '11', 6: 'b5', 7: '5', 8: 'b13', 9: '13', 10: 'b7', 11: '7' };

export default function Course() {
  const { courseId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const course = COURSE_BY_ID[courseId ?? ''];
  const rows = useLiveQuery(() => recentAttempts(60), []) ?? [];
  const [keys, setKeys] = useState<PitchClass[] | null>(null);

  const p = useMemo(() => (course ? courseProgress(rows, course) : null), [rows, course]);
  if (!course || !p) return <div className="text-ink-dim">No such course.</div>;

  const saved = settings.courseStage[course.id];
  const current = nextStage(saved, p);
  const chosen = keys ?? course.firstKeys;

  /** The ii-V-I this course teaches, in the first chosen key, voice-led. */
  const demo: Array<{ label: string; v: Voicing }> = (() => {
    const prog = iiVI(chosen[0] ?? 0, {});
    const out: Array<{ label: string; v: Voicing }> = [];
    let prev: Voicing | null = null;
    for (const pc of prog) {
      let cands: Voicing[] = [];
      for (const f of course.families) cands = cands.concat(generateVoicings(pc.chord, f));
      const v: Voicing | undefined = chooseVoicing(prev, cands) ?? cands[0];
      if (!v) continue;
      out.push({ label: pc.roman ?? pc.chord.text, v });
      prev = v;
    }
    return out;
  })();

  const start = async (stage: StageId) => {
    const spec = { ...stageSpec(course, stage, { keys: chosen }), id: `course:${course.id}:${stage}` };
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    settings.set({ courseStage: { ...settings.courseStage, [course.id]: stage } });
    nav(`/drill/${spec.id}`);
  };

  const setStage = (s: StageId) => settings.set({ courseStage: { ...settings.courseStage, [course.id]: s } });
  const idx = (s: StageId) => STAGES.findIndex((x) => x.id === s);

  return (
    <div className="space-y-6">
      <div>
        <BackLink to="/voicings" label="Voicings" />
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{course.name}</h1>
        <p className="text-ink-dim mt-1 max-w-2xl">{course.blurb}</p>
      </div>

      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="label">Keys</div>
          <div className="text-sm text-ink-dim tabular-nums">{p.mastered}/12 mastered</div>
        </div>
        <KeyRing keys={p.keys} picked={chosen as number[]} onPick={(k) => {
          const has = chosen.includes(k as PitchClass);
          const next = has ? chosen.filter((x) => x !== k) : [...chosen, k as PitchClass];
          setKeys(next.length ? next : course.firstKeys);
        }} />
        <div className="flex gap-2 text-sm">
          <button className="btn btn-ghost !py-1" onClick={() => setKeys(course.firstKeys)}>First six</button>
          <button className="btn btn-ghost !py-1" onClick={() => setKeys([0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7])}>All twelve</button>
          <button className="btn btn-ghost !py-1" onClick={() => setKeys(p.keys.filter((k) => !k.mastered).map((k) => k.key))}>The ones I miss</button>
        </div>
      </section>

      {/* Stage 1 is a screen, not a drill: the shape, the degrees, and the sound. */}
      {current === 'show' && (
        <section className="card space-y-4">
          <div>
            <div className="label">Show me</div>
            <div className="text-sm text-ink-dim mt-1">A ii-V-I in {PC_NAMES_FLAT[chosen[0] ?? 0]}, voice-led the way the drill will ask for it.</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {demo.map(({ label, v }) => (
              <div key={label} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <ChordText chord={v.chord} style={settings.displayStyle} className="text-xl font-semibold" />
                  <span className="text-xs text-ink-faint">{label}</span>
                </div>
                <div className="text-xs text-accent">{v.degrees.join(' · ')}</div>
                <Keyboard from={48} to={79} labels hint={v.notes} toneLabels={Object.fromEntries(v.notes.map((n) => [n % 12, DEGREE[(n - v.chord.root + 144) % 12] ?? '']))} />
                <button className="btn btn-ghost !py-1 w-full" onClick={() => { void unlockAudio().then(() => playVoicing(v.notes)); }}>Hear it</button>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => { void unlockAudio().then(() => demo.forEach(({ v }, i) => setTimeout(() => playVoicing(v.notes, 1.4), i * 900))); }}>Hear the whole ii-V-I</button>
        </section>
      )}

      <section className="space-y-2">
        <div className="label">Stages</div>
        <ol className="space-y-2">
          {STAGES.map((s) => {
            const locked = idx(s.id) > idx(current);
            const done = idx(s.id) < idx(current);
            return (
              <li key={s.id} className={`card flex items-center gap-4 ${locked ? 'opacity-50' : ''}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${done ? 'bg-good/25 text-good' : s.id === current ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-faint'}`}>
                  {done ? '✓' : idx(s.id) + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-sm text-ink-dim">{s.blurb}</div>
                </div>
                {s.id === 'show'
                  ? <button className="btn btn-ghost !py-1.5" onClick={() => setStage(current === 'show' ? 'copy' : 'show')}>{current === 'show' ? 'Done, next' : 'Show'}</button>
                  : <button className="btn btn-ghost !py-1.5" disabled={locked} onClick={() => void start(s.id)}>{locked ? 'Locked' : s.id === current ? 'Start' : 'Replay'}</button>}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
