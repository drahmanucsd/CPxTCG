import type { MelodyComparison, TimingReport } from '@shed/theory';

/**
 * What you get after playing a head against the click.
 *
 * Ordered the way a teacher would say it, not the way the data comes out:
 *   the verdict → where you sat → did you rush → how you swung → the one spot to look at.
 *
 * Nothing here is pass/fail. Placement and swing are descriptions of a performance; only the
 * spread is a problem, and it is the only number given a score.
 */
export function TimingReportView({ report, melody, bpm }: { report: TimingReport; melody?: MelodyComparison | null; bpm: number }) {
  if (!report.count) {
    return <div className="card text-ink-dim">{report.headline}. {report.detail[0]}</div>;
  }
  const tone = report.grade === 'tight' ? 'text-good' : report.grade === 'good' ? 'text-ink' : report.grade === 'loose' ? 'text-warn' : 'text-bad';

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="label">How your time was</div>
            <h2 className={`text-2xl font-semibold tracking-tight ${tone}`}>{report.headline}</h2>
          </div>
          <div className="text-right shrink-0">
            <div className="label">Steady</div>
            <div className="text-3xl font-semibold tabular-nums">{report.steadiness}</div>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm text-ink-dim">
          {report.detail.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Spread" value={`±${Math.round(report.spreadMs / 2)} ms`} sub={`${report.spreadPercentOfBeat}% of a beat`} />
        <Stat
          label="Sits"
          value={report.placement === 'on top' ? 'on top' : `${Math.abs(Math.round(report.medianMs))} ms ${report.placement}`}
          sub={report.placement === 'on top' ? 'right on the click' : 'median offset'}
        />
        <Stat
          label="Your tempo"
          value={report.playedBpm === null ? '—' : String(Math.round(report.playedBpm))}
          sub={report.playedBpm === null ? 'not enough notes' : `click was ${Math.round(bpm)}`}
          tone={report.playedBpm !== null && Math.abs(report.playedBpm - bpm) > 2 ? (report.playedBpm > bpm ? 'warn' : 'warn') : undefined}
        />
        <Stat
          label="Your eighths"
          value={report.swing ? `${report.swing.ratio.toFixed(1)} : 1` : '—'}
          sub={report.swing ? `groove wants ${report.swing.expectedRatio.toFixed(1)} : 1` : 'no off-beats played'}
          tone={report.swing && report.swing.verdict !== 'matched' ? 'warn' : undefined}
        />
      </div>

      <section className="card space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="label">Every note against the beat</div>
          <div className="text-xs text-ink-faint">{report.onGrid}/{report.count} inside ±{report.windowMs} ms</div>
        </div>
        <OffsetScatter report={report} />
      </section>

      {report.byPosition.length > 1 && (
        <section className="card space-y-2">
          <div className="label">Where in the bar</div>
          <div className="text-xs text-ink-faint">Average offset at each spot. A bar that leans one way all the way through is a lay-back; one spot leaning on its own is a habit.</div>
          <PositionBars report={report} />
        </section>
      )}

      {melody && (
        <section className="card space-y-2">
          <div className="label">Against the written head</div>
          <div className="text-sm">
            {melody.headline}
            {' · '}
            <span className="text-ink-dim">
              {melody.counts.clean}/{melody.notes.length} clean
              {melody.counts.wrongPitch ? `, ${melody.counts.wrongPitch} wrong` : ''}
              {melody.counts.split ? `, ${melody.counts.split} split` : ''}
              {melody.counts.merged ? `, ${melody.counts.merged} run together` : ''}
              {melody.counts.flat ? `, ${melody.counts.flat} flattened` : ''}
              {melody.counts.missed ? `, ${melody.counts.missed} missing` : ''}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-0.5 ${tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-ink-faint mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Every note as a dot: horizontal is time through the take, vertical is how far off it was.
 * A tilt is a drift; a cloud is unsteadiness; a cluster off-centre is a lay-back. Three very
 * different problems that all average to the same number.
 */
function OffsetScatter({ report }: { report: TimingReport }) {
  const W = 640, H = 120, pad = 18;
  const range = Math.max(60, Math.min(400, Math.ceil(Math.max(...report.notes.map((n) => Math.abs(n.offsetMs))) / 25) * 25));
  const maxBeat = Math.max(1, ...report.notes.map((n) => n.gridBeat));
  const x = (b: number) => pad + (b / maxBeat) * (W - pad * 2);
  const y = (ms: number) => H / 2 - (Math.max(-range, Math.min(range, ms)) / range) * (H / 2 - pad);
  const band = (report.windowMs / range) * (H / 2 - pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 150 }} role="img" aria-label="note offsets through the take">
      <rect x={pad} y={H / 2 - band} width={W - pad * 2} height={band * 2} fill="var(--color-good)" opacity={0.1} />
      <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="var(--color-good)" strokeWidth={1} opacity={0.6} />
      <text x={2} y={y(range) + 4} fontSize={9} fill="#5b6570">+{range}</text>
      <text x={2} y={H / 2 + 3} fontSize={9} fill="#5b6570">0</text>
      <text x={2} y={y(-range) + 4} fontSize={9} fill="#5b6570">−{range}</text>
      <text x={W - pad} y={H - 3} fontSize={9} textAnchor="end" fill="#5b6570">late is up · bar {Math.floor(maxBeat / 4) + 1}</text>
      {report.notes.map((n, i) => (
        <circle
          key={i} cx={x(n.gridBeat)} cy={y(n.offsetMs)} r={3}
          fill={Math.abs(n.offsetMs) <= report.windowMs ? 'var(--color-good)' : 'var(--color-warn)'}
          opacity={0.8}
        />
      ))}
      {report.playedBpm !== null && (
        <line
          x1={x(0)} y1={y(report.medianMs - (report.driftMsPerBar / 4) * (maxBeat / 2))}
          x2={x(maxBeat)} y2={y(report.medianMs + (report.driftMsPerBar / 4) * (maxBeat / 2))}
          stroke="var(--color-accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8}
        />
      )}
    </svg>
  );
}

function PositionBars({ report }: { report: TimingReport }) {
  const max = Math.max(30, ...report.byPosition.map((p) => Math.abs(p.meanMs)));
  return (
    <div className="space-y-1">
      {report.byPosition.map((p) => {
        const pct = (Math.abs(p.meanMs) / max) * 50;
        const late = p.meanMs > 0;
        return (
          <div key={`${p.beat}:${p.slot}`} className="flex items-center gap-2 text-xs">
            <div className="w-8 text-right tabular-nums text-ink-dim">{p.label}</div>
            <div className="flex-1 h-3 relative bg-panel-2 rounded">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className={`absolute inset-y-0 rounded ${late ? 'bg-warn/70' : 'bg-accent/70'}`}
                style={late ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
              />
            </div>
            <div className="w-16 tabular-nums text-ink-faint">{p.meanMs > 0 ? '+' : ''}{Math.round(p.meanMs)} ms</div>
            <div className="w-8 tabular-nums text-ink-faint">×{p.n}</div>
          </div>
        );
      })}
    </div>
  );
}
