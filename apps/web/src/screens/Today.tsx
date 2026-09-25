import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import { COURSES, STAGES, TUNE_STAGE_BY_ID, stageSpec, type Course, type StageId, type TuneStageId } from '@shed/engine';
import { PC_NAMES_FLAT, builtinSongs, difficultyOf } from '@shed/theory';
import { db } from '../db';
import { recentAttempts, streakDays } from '../lib/stats';
import { courseProgress, nextStage } from '../lib/mastery';
import { dueTune, tuneProgress } from '../lib/repertoire';
import { tuneDrillSpec } from '../lib/songs';
import { useSettings } from '../store/settings';

/**
 * One button. The daily path never leaves this screen (docs/11-platform.md §UX 6).
 * Three blocks: the course stage you are on, the keys inside it you keep missing, and one tune.
 */
export default function Today() {
  const nav = useNavigate();
  const settings = useSettings();
  const rows = useLiveQuery(() => recentAttempts(60), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(200).toArray(), []) ?? [];
  const mine = useLiveQuery(() => db.songs.toArray(), []) ?? [];

  const progress = COURSES.map((c) => ({ course: c, p: courseProgress(rows, c) }));
  const active = progress.find(({ p }) => p.mastered < 12) ?? progress[0]!;
  const stage = nextStage(settings.courseStage[active.course.id], active.p);
  const weakKeys = active.p.keys.filter((k) => !k.mastered && k.total > 0).map((k) => k.key);

  const songs = [...builtinSongs(), ...mine.map((m) => m.song)];
  const tunes = songs.map((s) => ({ song: s, t: tuneProgress(sessions, s.id) }));
  const due = dueTune(tunes.map((x) => x.t));
  // nothing in progress: suggest the easiest tune rather than the alphabetically first
  const easiest = [...tunes].sort((a, b) => difficultyOf(a.song).score - difficultyOf(b.song).score)[0];
  const dueSong = due ? tunes.find((x) => x.t.songId === due.songId)?.song : easiest?.song;

  const startStage = async (course: Course, s: StageId, keys?: number[]) => {
    const spec = { ...stageSpec(course, s, keys?.length ? { keys: keys as never } : {}), id: `course:${course.id}:${s}` };
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    settings.set({ courseStage: { ...settings.courseStage, [course.id]: s } });
    nav(`/drill/${spec.id}`);
  };

  const tuneStageId: TuneStageId = dueSong ? (settings.tuneStage[dueSong.id] ?? 'listen') : 'listen';
  const tuneStage = TUNE_STAGE_BY_ID[tuneStageId];

  const startTune = async () => {
    if (!dueSong) return;
    if (tuneStageId === 'listen') { nav(`/tunes/${encodeURIComponent(dueSong.id)}`); return; }
    if (tuneStageId === 'melody') { nav(`/melody/${encodeURIComponent(dueSong.id)}`); return; }
    const spec = tuneDrillSpec(dueSong, {
      mode: 'changes', families: active.course.families, voiceLeading: 'off',
      band: { style: 'swing', bass: true, drums: true }, bpm: dueSong.tempo ?? 120,
      transpose: 0, range: null, passes: 2, halfTime: false,
      melody: tuneStage.handSplit, reveal: tuneStage.reveal,
    });
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    nav(`/drill/${spec.id}`);
  };

  const stageName = STAGES.find((s) => s.id === stage)?.name ?? '';
  const primary = stage === 'show'
    ? () => nav(`/voicings/${active.course.id}`)
    : () => void startStage(active.course, stage);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label">Today</div>
          <h1 className="text-3xl font-semibold tracking-tight">{active.course.name}</h1>
          <div className="text-ink-dim mt-1">{stageName} · {active.p.mastered}/12 keys</div>
        </div>
        <button className="btn btn-primary text-base px-6 py-3" onClick={primary}>Start</button>
      </div>

      <ol className="space-y-2">
        <li className="card flex items-center gap-4">
          <Num n={1} />
          <div className="flex-1 min-w-0">
            <div className="font-medium">{stageName}</div>
            <div className="text-sm text-ink-dim truncate">{STAGES.find((s) => s.id === stage)?.blurb}</div>
          </div>
          <button className="btn btn-ghost !py-1.5" onClick={primary}>Go</button>
        </li>

        {weakKeys.length > 0 && (
          <li className="card flex items-center gap-4">
            <Num n={2} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">The keys you keep missing</div>
              <div className="text-sm text-ink-dim truncate">{weakKeys.map((k) => PC_NAMES_FLAT[k]).join(' · ')}</div>
            </div>
            <button className="btn btn-ghost !py-1.5" onClick={() => void startStage(active.course, 'clock', weakKeys)}>Go</button>
          </li>
        )}

        <li className="card flex items-center gap-4">
          <Num n={weakKeys.length ? 3 : 2} />
          <div className="flex-1 min-w-0">
            <div className="font-medium">{dueSong ? `${dueSong.title} — ${tuneStage.name.toLowerCase()}` : 'Start a tune'}</div>
            <div className="text-sm text-ink-dim truncate">
              {due?.status === 'rusty' ? `Known, but you have not played it for ${due.daysSince} days.`
                : dueSong ? tuneStage.blurb
                : 'Pick a standard and put this voicing on it.'}
            </div>
          </div>
          {dueSong
            ? <button className="btn btn-ghost !py-1.5" onClick={() => void startTune()}>Go</button>
            : <Link className="btn btn-ghost !py-1.5" to="/tunes">Browse</Link>}
        </li>
      </ol>

      <div className="grid grid-cols-3 gap-3">
        <Link to="/voicings" className="card hover:border-accent/60">
          <div className="label">Voicings</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{progress.filter((p) => p.p.mastered >= 12).length}/{COURSES.length}</div>
        </Link>
        <Link to="/tunes" className="card hover:border-accent/60">
          <div className="label">Tunes known</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{tunes.filter((t) => t.t.status === 'known').length}</div>
        </Link>
        <Link to="/progress" className="card hover:border-accent/60">
          <div className="label">Streak</div>
          <div className="text-2xl font-semibold mt-1 tabular-nums">{streakDays(sessions)} d</div>
        </Link>
      </div>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="w-7 h-7 rounded-full bg-panel-2 flex items-center justify-center text-sm text-ink-dim shrink-0">{n}</span>;
}
