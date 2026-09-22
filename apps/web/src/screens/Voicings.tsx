import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { COURSES } from '@shed/engine';
import { recentAttempts } from '../lib/stats';
import { courseProgress } from '../lib/mastery';
import { KeyRing } from '../components/KeyRing';

/**
 * The ladder. One course per voicing family, in teaching order, each showing the only progress
 * number that means anything to a learner: keys mastered out of twelve.
 */
export default function Voicings() {
  const rows = useLiveQuery(() => recentAttempts(60), []) ?? [];
  const progress = COURSES.map((c) => ({ course: c, p: courseProgress(rows, c) }));
  const nextUp = progress.find(({ p }) => p.mastered < 12)?.course.id;

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Voicings</div>
        <h1 className="text-2xl font-semibold tracking-tight">Ten families, in order</h1>
        <p className="text-ink-dim text-sm mt-1 max-w-2xl">
          Each one is staged: see it, copy it, find it, play it in time. The app picks the tempo and
          the keys. You are done with a family when you can play it clean in all twelve keys.
        </p>
      </div>

      <ol className="space-y-2">
        {progress.map(({ course, p }) => (
          <li key={course.id}>
            <Link
              to={`/voicings/${course.id}`}
              className={`card block hover:border-accent/60 ${course.id === nextUp ? 'border-accent/60' : ''}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-ink-faint tabular-nums w-5">{course.order}</span>
                <span className="font-medium">{course.name}</span>
                {course.id === nextUp && <span className="text-xs text-accent">next up</span>}
                <span className="ml-auto text-sm text-ink-dim tabular-nums">{p.mastered}/12 keys</span>
              </div>
              <div className="text-sm text-ink-dim mt-1 ml-8">{course.blurb}</div>
              <div className="mt-2 ml-8"><KeyRing keys={p.keys} /></div>
            </Link>
          </li>
        ))}
      </ol>

      <div className="text-sm text-ink-faint">
        Want to build your own drill instead? <Link className="text-accent" to="/drills">The drill library and editor</Link> are still there.
      </div>
    </div>
  );
}
