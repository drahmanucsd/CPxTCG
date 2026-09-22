import { PC_NAMES_FLAT } from '@shed/theory';
import type { KeyProgress } from '../lib/mastery';

/** Twelve keys in circle-of-fourths order, filled as they are mastered. */
const FOURTHS = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];

export function KeyRing({ keys, onPick, picked }: { keys: KeyProgress[]; onPick?: (k: number) => void; picked?: number[] }) {
  const by = new Map(keys.map((k) => [k.key as number, k]));
  return (
    <div className="flex flex-wrap gap-1">
      {FOURTHS.map((k) => {
        const p = by.get(k);
        const on = picked?.includes(k);
        const tone = p?.mastered ? 'bg-good/25 text-good'
          : p && p.total > 0 ? 'bg-warn/20 text-warn'
          : 'bg-panel-2 text-ink-faint';
        const title = p ? `${p.clean}/${p.total} clean at tempo` : 'not played yet';
        const cls = `rounded-md px-2 py-0.5 text-xs tabular-nums ${tone} ${on ? 'ring-1 ring-accent' : ''}`;
        return onPick
          ? <button key={k} className={cls} title={title} onClick={(e) => { e.preventDefault(); onPick(k); }}>{PC_NAMES_FLAT[k]}</button>
          : <span key={k} className={cls} title={title}>{PC_NAMES_FLAT[k]}</span>;
      })}
    </div>
  );
}
