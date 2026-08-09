import { useId, useMemo, useState } from "react";
import type { ClientBar, CandleRange } from "@/lib/candles-client";
import { CANDLE_RANGES } from "@/lib/candles-client";

interface Props {
  bars: ClientBar[];
  currency: string;
  range: CandleRange;
  onRangeChange: (r: CandleRange) => void;
  loading?: boolean;
  /** Provider message shown when a range has no real data. */
  unavailableReason?: string | null;
  height?: number;
  /** Height of the volume histogram beneath the price panel. */
  volumeHeight?: number;
}

const GAIN = "rgb(120,200,140)";
const LOSS = "rgb(220,120,120)";
const GOLD = "rgba(201,168,76,";

/**
 * Reusable compass-themed candlestick chart: green/red OHLC bodies, a volume
 * histogram, brass timeframe pills, and a drag/tap crosshair with tooltip.
 * Native SVG only — no external chart library, no TradingView palette.
 */
export function CandlestickChart({
  bars,
  currency,
  range,
  onRangeChange,
  loading = false,
  unavailableReason = null,
  height = 240,
  volumeHeight = 56,
}: Props) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const VH = volumeHeight;

  const scales = useMemo(() => {
    if (bars.length < 2) return null;
    const max = Math.max(...bars.map((b) => b.h));
    const min = Math.min(...bars.map((b) => b.l));
    const range_ = max - min || 1;
    const maxVol = Math.max(...bars.map((b) => b.v), 1);
    return {
      min,
      max,
      maxVol,
      y: (v: number) => H - ((v - min) / range_) * (H * 0.9) - H * 0.05,
      vy: (v: number) => VH - (v / maxVol) * (VH - 4),
    };
  }, [bars, H, VH]);

  const slot = bars.length ? W / bars.length : W;
  const bodyW = Math.max(1.4, Math.min(slot * 0.62, 14));
  const active = hover != null ? bars[hover] : null;
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtTime = (t: number) => {
    const d = new Date(t * 1000);
    return range === "1D" || range === "1W"
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    if (!bars.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const ratio = (clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(bars.length - 1, Math.floor(ratio * bars.length)));
    setHover(idx);
  };

  const pills = (
    <div className="flex gap-2" style={{ marginBottom: 10 }}>
      {CANDLE_RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onRangeChange(r)}
          aria-pressed={r === range}
          title={`Show the ${r} timeframe`}
          className="t-mono"
          style={{
            flex: 1,
            padding: "6px 0",
            borderRadius: 999,
            fontSize: 10,
            letterSpacing: "0.1em",
            cursor: "pointer",
            transition: "all 160ms ease",
            border: `1px solid ${r === range ? `${GOLD}0.55)` : `${GOLD}0.18)`}`,
            background: r === range
              ? "linear-gradient(180deg, rgba(201,168,76,0.26), rgba(201,168,76,0.10))"
              : "transparent",
            boxShadow: r === range ? "inset 0 1px 0 rgba(255,236,190,0.25)" : "none",
            color: r === range ? "rgb(240,222,175)" : "rgba(200,175,130,0.6)",
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div>
        {pills}
        <div className="skeleton w-full rounded-2xl" style={{ height: H }} aria-label="Loading chart" />
        <div className="skeleton w-full rounded-xl" style={{ height: VH, marginTop: 6 }} />
      </div>
    );
  }

  if (!scales || bars.length < 2) {
    return (
      <div>
        {pills}
        <div
          className="flex flex-col items-center justify-center text-center"
          style={{
            height: H,
            borderRadius: 16,
            border: `1px dashed ${GOLD}0.28)`,
            background: "rgba(255,255,255,0.03)",
            padding: 20,
          }}
        >
          <p className="t-mono t-sec" style={{ fontSize: 9, letterSpacing: "0.18em" }}>
            NO CHART DATA
          </p>
          <p className="t-serif t-muted" style={{ fontSize: 12, marginTop: 8, maxWidth: 280 }}>
            {unavailableReason ?? `No ${range} price history available for this instrument.`}
          </p>
        </div>
      </div>
    );
  }

  const { y, vy, min, max } = scales;
  const cxOf = (i: number) => i * slot + slot / 2;

  return (
    <div className="relative w-full">
      {pills}

      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Candlestick chart, ${range} timeframe`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
        style={{ touchAction: "pan-y", display: "block" }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const gy = H * 0.05 + f * H * 0.9;
          return (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={gy}
              y2={gy}
              stroke={`${GOLD}0.14)`}
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {bars.map((c, i) => {
            const cx = cxOf(i);
            const up = c.c >= c.o;
            const color = up ? GAIN : LOSS;
            const top = y(Math.max(c.o, c.c));
            const bottom = y(Math.min(c.o, c.c));
            return (
              <g key={`${c.t}-${i}`}>
                <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" opacity="0.75" />
                <rect
                  x={cx - bodyW / 2}
                  y={top}
                  width={bodyW}
                  height={Math.max(1, bottom - top)}
                  fill={up ? "rgba(120,200,140,0.55)" : "rgba(220,120,120,0.55)"}
                  stroke={color}
                  strokeWidth="0.8"
                />
              </g>
            );
          })}
        </g>

        {active && hover != null && (
          <g>
            <line x1={cxOf(hover)} x2={cxOf(hover)} y1="0" y2={H} stroke={`${GOLD}0.5)`} strokeWidth="1" />
            <line x1="0" x2={W} y1={y(active.c)} y2={y(active.c)} stroke={`${GOLD}0.5)`} strokeWidth="1" />
          </g>
        )}
      </svg>

      {/* Volume histogram */}
      <svg
        width="100%"
        height={VH}
        viewBox={`0 0 ${W} ${VH}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Volume histogram"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
        style={{ touchAction: "pan-y", display: "block", marginTop: 6 }}
      >
        <line x1="0" x2={W} y1={VH - 0.5} y2={VH - 0.5} stroke={`${GOLD}0.2)`} strokeWidth="1" />
        {bars.map((c, i) => {
          const up = c.c >= c.o;
          const top = vy(c.v);
          return (
            <rect
              key={`v-${c.t}-${i}`}
              x={cxOf(i) - bodyW / 2}
              y={top}
              width={bodyW}
              height={Math.max(1, VH - top)}
              fill={up ? "rgba(120,200,140,0.38)" : "rgba(220,120,120,0.38)"}
            />
          );
        })}
        {hover != null && (
          <line x1={cxOf(hover)} x2={cxOf(hover)} y1="0" y2={VH} stroke={`${GOLD}0.5)`} strokeWidth="1" />
        )}
      </svg>

      {/* Crosshair tooltip / axis readout */}
      <div
        className="t-mono"
        style={{
          marginTop: 6,
          fontSize: 9,
          letterSpacing: "0.08em",
          color: "rgba(200,175,130,0.7)",
          minHeight: 30,
        }}
      >
        {active ? (
          <div
            className="glass-gold"
            style={{
              borderRadius: 12,
              border: `1px solid ${GOLD}0.3)`,
              background: "rgba(255,255,255,0.05)",
              padding: "6px 10px",
            }}
          >
            <div className="flex items-center justify-between">
              <span>{fmtTime(active.t)}</span>
              <span style={{ color: active.c >= active.o ? GAIN : LOSS }}>
                {currency} {fmt(active.c)}
              </span>
            </div>
            <div className="t-parch" style={{ marginTop: 2 }}>
              O {fmt(active.o)} · H {fmt(active.h)} · L {fmt(active.l)} · C {fmt(active.c)} · V{" "}
              {active.v.toLocaleString()}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span>{fmtTime(bars[0].t)}</span>
            <span>
              {currency} {fmt(min)} – {fmt(max)}
            </span>
            <span>{fmtTime(bars[bars.length - 1].t)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
