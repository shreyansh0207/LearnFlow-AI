import { cn } from "@/lib/utils";

/**
 * Lightweight, dependency-free charts rendered on the server.
 * Single series → primary hue, no legend (the card title names the series).
 * Every mark is focusable with a hover/focus tooltip, and a table view is provided.
 */

export type BarDatum = { label: string; sublabel?: string; value: number; display: string };

export function BarChart({ data, ariaLabel, unit, height = 140 }: { data: BarDatum[]; ariaLabel: string; unit: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure>
      <div role="img" aria-label={ariaLabel} className="relative">
        {/* Recessive gridline at the max value */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" aria-hidden />
        <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-muted" aria-hidden>
          {Math.round(max)} {unit}
        </span>
        <div className="flex items-end gap-[2px]" style={{ height }}>
          {data.map((d) => {
            const h = d.value > 0 ? Math.max(3, (d.value / max) * height) : 0;
            return (
              <div key={d.label} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={`${d.label}: ${d.display}`}>
                <div className={cn("w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80", d.value === 0 && "bg-transparent")} style={{ height: h }} />
                {d.value === 0 && <div className="absolute bottom-0 h-[2px] w-full max-w-7 rounded bg-border" aria-hidden />}
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md group-hover:block group-focus:block">
                  <span className="font-medium text-ink">{d.display}</span>
                  <span className="block text-muted">{d.label}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-[2px] border-t border-border pt-1.5" aria-hidden>
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 truncate text-center text-[10px] text-muted">
              {data.length > 14 ? (i % Math.ceil(data.length / 7) === 0 ? d.sublabel ?? d.label : "") : d.sublabel ?? d.label}
            </span>
          ))}
        </div>
      </div>
      <ChartTable caption={ariaLabel} rows={data.map((d) => [d.label, d.display])} headers={["Day", "Value"]} />
    </figure>
  );
}

export type LinePoint = { label: string; value: number; display: string };

/** Values in 0..1 (scores). */
export function ScoreLineChart({ points, ariaLabel, height = 140 }: { points: LinePoint[]; ariaLabel: string; height?: number }) {
  const w = 600;
  const pad = 10;
  const x = (i: number) => (points.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (points.length - 1));
  const y = (v: number) => pad + (1 - v) * (height - pad * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <figure>
      <div className="relative" role="img" aria-label={ariaLabel}>
        <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full overflow-visible" preserveAspectRatio="none" style={{ height }}>
          {[0, 0.5, 1].map((g) => (
            <line key={g} x1={0} x2={w} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray={g === 0 ? undefined : "4 4"} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {points.length > 1 && <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
        </svg>
        {/* Markers as HTML so they stay round and get focusable tooltips. */}
        {points.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            tabIndex={0}
            aria-label={`${p.label}: ${p.display}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2 p-2"
            style={{ left: `${(x(i) / w) * 100}%`, top: y(p.value) }}
          >
            <span className="block size-2.5 rounded-full border-2 border-surface bg-primary" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md group-hover:block group-focus:block">
              <span className="font-medium text-ink">{p.display}</span>
              <span className="block text-muted">{p.label}</span>
            </span>
          </div>
        ))}
        <div className="pointer-events-none absolute inset-y-0 -left-1 flex flex-col justify-between py-1 text-[10px] text-muted" aria-hidden>
          <span>100%</span>
          <span>0%</span>
        </div>
      </div>
      <ChartTable caption={ariaLabel} rows={points.map((p) => [p.label, p.display])} headers={["Attempt", "Score"]} />
    </figure>
  );
}

function ChartTable({ caption, headers, rows }: { caption: string; headers: [string, string]; rows: string[][] }) {
  return (
    <details className="mt-3 text-xs text-muted">
      <summary className="cursor-pointer select-none">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="py-1 font-medium">{headers[0]}</th>
            <th className="py-1 text-right font-medium">{headers[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{r[0]}</td>
              <td className="py-1 text-right tabular-nums text-ink">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
