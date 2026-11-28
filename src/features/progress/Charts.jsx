// Grafici leggeri in SVG, senza librerie: linea con punti e barre. Colori dai token del tema.
const W = 560, H = 160, PAD = { l: 36, r: 8, t: 10, b: 22 };
const shortDay = iso => { const d = new Date(`${iso}T12:00:00`); return `${d.getDate()}/${d.getMonth() + 1}`; };
const fmt = (n, d) => n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: 0, useGrouping: "always" });

const scale = (values, padding = 0.1) => {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.05 || 1;
  return [min - span * padding, max + span * padding];
};

/** Linea delle medie settimanali (points: [{x: iso, value}]) con eventuali valori giornalieri in grigio (raw). */
export function LineChart({ points, raw = [], decimals = 1, unit = "", label }) {
  const valid = points.filter(p => p.value !== null);
  if (valid.length === 0) return <p className="muted" style={{ margin: 0 }}>Ancora nessun dato.</p>;
  const all = [...valid.map(p => p.value), ...raw.map(p => p.value)];
  const [lo, hi] = scale(all);
  const xs = points.map(p => p.x);
  const x0 = new Date(`${xs[0]}T12:00:00`).getTime() - 6 * 864e5, x1 = new Date(`${xs.at(-1)}T12:00:00`).getTime();
  const X = iso => PAD.l + ((new Date(`${iso}T12:00:00`).getTime() - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const Y = v => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const path = valid.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const last = valid.at(-1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label}: ultima media ${fmt(last.value, decimals)}${unit ? ` ${unit}` : ""}`}>
      {ticks.map(t => (
        <g key={t}><line className="grid" x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} />
          <text x={PAD.l - 6} y={Y(t) + 4} textAnchor="end">{fmt(t, decimals)}</text></g>
      ))}
      {raw.filter(p => new Date(`${p.x}T12:00:00`).getTime() >= x0).map(p => <circle key={`r${p.x}`} className="raw" cx={X(p.x)} cy={Y(p.value)} r="2" />)}
      <path className="line" d={path} />
      <g className="dots">{valid.map(p => <circle key={p.x} cx={X(p.x)} cy={Y(p.value)} r="3.5"><title>{`Settimana al ${shortDay(p.x)}: ${fmt(p.value, decimals)}${unit ? ` ${unit}` : ""}${p.count ? ` (${p.count} rilevazioni)` : ""}`}</title></circle>)}</g>
      {[points[0], points[Math.floor(points.length / 2)], points.at(-1)].map(p => (
        <text key={`x${p.x}`} x={X(p.x)} y={H - 4} textAnchor="middle">{shortDay(p.x)}</text>
      ))}
    </svg>
  );
}

/** Barre per settimana (sedute fatte). */
export function BarChart({ bars, label }) {
  const max = Math.max(1, ...bars.map(b => b.value));
  const bw = (W - PAD.l - PAD.r) / bars.length;
  const Y = v => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${bars.map(b => b.value).join(", ")}`}>
      {[0, max].map(t => (
        <g key={t}><line className="grid" x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} />
          <text x={PAD.l - 6} y={Y(t) + 4} textAnchor="end">{t}</text></g>
      ))}
      {bars.map((b, i) => (
        <g key={b.x}>
          <rect className="bar" x={PAD.l + i * bw + bw * 0.2} width={bw * 0.6} y={Y(b.value)} height={Math.max(0, Y(0) - Y(b.value))} rx="3">
            <title>{`Settimana al ${shortDay(b.x)}: ${b.value}${b.note ? ` · ${b.note}` : ""}`}</title>
          </rect>
          {(i === 0 || i === bars.length - 1 || i === Math.floor(bars.length / 2)) &&
            <text x={PAD.l + i * bw + bw / 2} y={H - 4} textAnchor="middle">{shortDay(b.x)}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Mini linea per una riga di tabella (carichi). */
export function Sparkline({ points, label }) {
  const w = 120, h = 32;
  const vals = points.map(p => p.value);
  const [lo, hi] = scale(vals, 0.15);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i / (points.length - 1 || 1)) * (w - 4) + 2},${(1 - (p.value - lo) / (hi - lo)) * (h - 4) + 2}`).join(" ");
  return <svg className="chart" viewBox={`0 0 ${w} ${h}`} style={{ width: w }} role="img" aria-label={label}><path className="line" d={d} /></svg>;
}
