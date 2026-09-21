import type { TargetResult } from '@shed/engine';

/**
 * One dot per chord whose notes were right, placed on a ±range ms axis, with the "in time" band
 * shaded. A mean hides the shape of your timing; this doesn't — two humps, a drift, or a tight
 * cluster off to one side all read at a glance.
 */
export function TimingStrip({ results, windowMs = 120, range = 300, medianMs }: {
  results: TargetResult[];
  windowMs?: number;
  range?: number;
  medianMs?: number;
}) {
  const pts = results.filter((r) => r.latenessMs !== null && r.ok).map((r) => ({ ms: r.latenessMs!, late: r.outcome !== 'clean' }));
  const W = 600, H = 56, mid = W / 2;
  const x = (ms: number) => mid + (Math.max(-range, Math.min(range, ms)) / range) * (mid - 6);
  const bandW = (windowMs / range) * (mid - 6);
  // spread the dots vertically so overlapping hits stay countable
  const rows = 5;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 72 }} role="img" aria-label="timing offsets">
      <rect x={mid - bandW} y={6} width={bandW * 2} height={H - 22} rx={4} fill="var(--color-good)" opacity={0.12} />
      <line x1={mid} y1={4} x2={mid} y2={H - 14} stroke="var(--color-good)" strokeWidth={1.5} opacity={0.6} />
      {[-range, 0, range].map((ms) => (
        <text key={ms} x={x(ms)} y={H - 4} fontSize={9} textAnchor={ms < 0 ? 'start' : ms > 0 ? 'end' : 'middle'} fill="#5b6570">{ms > 0 ? `+${ms} late` : ms < 0 ? `${ms} early` : 'on the beat'}</text>
      ))}
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={x(p.ms)}
          cy={12 + (i % rows) * ((H - 34) / (rows - 1))}
          r={3.2}
          fill={p.late ? 'var(--color-warn)' : 'var(--color-good)'}
          opacity={0.85}
        />
      ))}
      {medianMs !== undefined && (
        <line x1={x(medianMs)} y1={4} x2={x(medianMs)} y2={H - 14} stroke="var(--color-accent)" strokeWidth={2} strokeDasharray="3 2" />
      )}
    </svg>
  );
}
