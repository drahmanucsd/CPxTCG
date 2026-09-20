import { PC_NAMES_FLAT } from '@shed/theory';

export interface HeatCell { root: number; col: string; total: number; correct: number }

/** 12 rows (keys) × columns (families or qualities); colour = accuracy, opacity = sample size. */
export function Heatmap({ cells, cols, colLabel }: { cells: HeatCell[]; cols: string[]; colLabel: (c: string) => string }) {
  const at = new Map(cells.map((c) => [`${c.root}:${c.col}`, c]));
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-1">
        <thead>
          <tr><th />{cols.map((c) => <th key={c} className="font-normal text-ink-dim px-1 py-1 whitespace-nowrap">{colLabel(c)}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: 12 }, (_, r) => (5 * r) % 12).map((root) => (
            <tr key={root}>
              <td className="text-ink-dim pr-2 text-right">{PC_NAMES_FLAT[root]}</td>
              {cols.map((c) => {
                const cell = at.get(`${root}:${c}`);
                if (!cell || !cell.total) return <td key={c}><div className="w-9 h-7 rounded bg-panel-2" /></td>;
                const acc = cell.correct / cell.total;
                const hue = Math.round(acc * 120);
                const alpha = Math.min(1, 0.35 + cell.total / 20);
                return (
                  <td key={c} title={`${cell.correct}/${cell.total}`}>
                    <div className="w-9 h-7 rounded flex items-center justify-center text-[10px] text-bg font-medium" style={{ background: `hsla(${hue} 70% 55% / ${alpha})` }}>{Math.round(acc * 100)}</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
