import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { PRESETS, PRESET_BY_ID, type DrillSpec } from '@shed/engine';
import { PC_NAMES_FLAT, makeChord } from '@shed/theory';
import { db } from '../db';
import { recentAttempts, streakDays, weakSpots } from '../lib/stats';
import { FAMILY_LABEL } from '../lib/suffix';
import { useSettings } from '../store/settings';

interface Block { title: string; detail: string; spec: DrillSpec; kind: 'warmup' | 'weak' | 'core' | 'tune' | 'free' }

function buildPlan(rows: Awaited<ReturnType<typeof recentAttempts>>, level: string): Block[] {
  const blocks: Block[] = [];
  const weak = weakSpots(rows, 3);
  const warm = level === 'learning' ? PRESET_BY_ID['learn-rootless-iiVI']! : PRESET_BY_ID['guide-tones-iiVI']!;
  blocks.push({ title: 'Warm-up', detail: warm.name, spec: warm, kind: 'warmup' });
  if (weak.length) {
    const chords = weak.flatMap((w) => Array.from({ length: 4 }, () => ({ chord: makeChord(w.root, w.suffix), beats: 4 })));
    const fam = [...new Set(weak.map((w) => w.family))];
    const spec: DrillSpec = {
      id: 'today-weak', name: 'Weak spots', description: weak.map((w) => `${PC_NAMES_FLAT[w.root]}${w.suffix}`).join(', '), generator: { kind: 'progression', chords },
      families: fam, strictness: 'shape', voiceLeading: 'off', pacing: { mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, holdMs: 300 }, lookAhead: 'never', length: { passes: 1 },
    };
    blocks.push({ title: 'Weak spots', detail: `${weak.map((w) => `${PC_NAMES_FLAT[w.root]}${w.suffix} ${FAMILY_LABEL[w.family] ?? w.family}`).join(' · ')}`, spec, kind: 'weak' });
  }
  const core = level === 'learning' ? PRESET_BY_ID['shells-iiVI']! : level === 'tunes' ? PRESET_BY_ID['jazz-blues-F']! : PRESET_BY_ID['rootless-iiVI-random-2beats']!;
  blocks.push({ title: 'Core', detail: core.name, spec: core, kind: 'core' });
  const stretch = level === 'fluency' ? PRESET_BY_ID['random-everything']! : PRESET_BY_ID['turnaround-IviiiV']!;
  blocks.push({ title: 'Stretch', detail: stretch.name, spec: stretch, kind: 'free' });
  return blocks;
}

export default function Today() {
  const nav = useNavigate();
  const settings = useSettings();
  const rows = useLiveQuery(() => recentAttempts(30), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(60).toArray(), []) ?? [];
  const plan = buildPlan(rows, settings.level);
  const startBlock = async (b: Block) => {
    if (!PRESET_BY_ID[b.spec.id]) await db.drills.put({ id: b.spec.id, spec: b.spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    nav(`/drill/${b.spec.id}`);
  };
  const last = sessions[0];
  return (
    <div className="space-y-8">
      {!settings.onboarded && (
        <div className="card space-y-3">
          <div className="text-lg font-medium">Where are you?</div>
          <div className="grid sm:grid-cols-3 gap-2">
            {([['learning', 'Learning voicings', 'Rootless forms, shells, one key at a time'], ['tunes', 'Learning tunes', 'I have voicings; I want to play changes in time'], ['fluency', 'Chasing fluency', 'Any voicing, any key, fast, tell me what I\'m bad at']] as const).map(([k, t, d]) => (
              <button key={k} className={`card text-left hover:border-accent/60 ${settings.level === k ? 'border-accent' : ''}`} onClick={() => settings.set({ level: k, onboarded: true })}><div className="font-medium">{t}</div><div className="text-sm text-ink-dim">{d}</div></button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-end justify-between">
        <div>
          <div className="label">Today</div>
          <h1 className="text-3xl font-semibold tracking-tight">{plan.length} blocks · ~{plan.length * 6} min</h1>
        </div>
        <button className="btn btn-primary text-base px-6 py-3" onClick={() => void startBlock(plan[0]!)}>Start</button>
      </div>
      <ol className="space-y-2">
        {plan.map((b, i) => (
          <li key={i} className="card flex items-center gap-4">
            <span className="w-7 h-7 rounded-full bg-panel-2 flex items-center justify-center text-sm text-ink-dim">{i + 1}</span>
            <div className="flex-1 min-w-0"><div className="font-medium">{b.title}</div><div className="text-sm text-ink-dim truncate">{b.detail}</div></div>
            <button className="btn btn-ghost !py-1.5" onClick={() => void startBlock(b)}>Go</button>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-3 gap-3">
        <Link to="/progress" className="card hover:border-accent/60"><div className="label">Streak</div><div className="text-2xl font-semibold mt-1">{streakDays(sessions)} d</div></Link>
        <Link to="/progress" className="card hover:border-accent/60"><div className="label">Sessions</div><div className="text-2xl font-semibold mt-1">{sessions.length}</div></Link>
        {last ? <Link to={`/drill/${last.specId}`} className="card hover:border-accent/60"><div className="label">Continue</div><div className="text-sm font-medium mt-1 truncate">{last.specName}</div></Link> : <Link to="/drills" className="card hover:border-accent/60"><div className="label">Browse</div><div className="text-sm font-medium mt-1">{PRESETS.length} drills</div></Link>}
      </div>
    </div>
  );
}
