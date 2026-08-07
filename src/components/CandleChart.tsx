import { useId, useState } from "react";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Props {
  candles: Candle[];
  currency: string;
  height?: number;
}

/**
 * Native SVG candlestick chart — TradingView-inspired framing, compass palette.
 * No iframe, no external chart library: gold grid lines at low opacity,
 * gain/loss coloured bodies, and a crosshair readout on touch/hover.
 */
export function CandleChart({ candles, currency, height = 240 }: Props) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (candles.length < 2) {
    return (
      <div className="skeleton w-full rounded-2xl" style={{ height }} aria-label="Loading chart" />
    );
  }

  const W = 640;
  const H = height;
  const padB = 18;
  const plotH = H - padB;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const y = (v: number) => plotH - ((v - min) / range) * (plotH * 0.92) - plotH * 0.04;

  const slot = W / candles.length;
  const bodyW = Math.max(1.4, Math.min(slot * 0.62, 14));

  const gain = "rgb(120,200,140)";
  const loss = "rgb(220,120,120)";

  const active = hover != null ? candles[hover] : null;
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const onMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX;
    const ratio = (clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(candles.length - 1, Math.floor(ratio * candles.length)));
    setHover(idx);
  };

  return (
    <div className="relative w-full">
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Price candlestick chart"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onTouchEnd={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={W} height={plotH} />
          </clipPath>
        </defs>

        {/* Gold grid lines at low opacity */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const gy = plotH * 0.04 + f * plotH * 0.92;
          return (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={gy}
              y2={gy}
              stroke="rgba(201,168,76,0.14)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {candles.map((c, i) => {
            const cx = i * slot + slot / 2;
            const up = c.c >= c.o;
            const color = up ? gain : loss;
            const top = y(Math.max(c.o, c.c));
            const bottom = y(Math.min(c.o, c.c));
            return (
              <g key={c.t}>
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

        {/* Crosshair */}
        {active && hover != null && (
          <g>
            <line
              x1={hover * slot + slot / 2}
              x2={hover * slot + slot / 2}
              y1="0"
              y2={plotH}
              stroke="rgba(201,168,76,0.5)"
              strokeWidth="1"
            />
            <line
              x1="0"
              x2={W}
              y1={y(active.c)}
              y2={y(active.c)}
              stroke="rgba(201,168,76,0.5)"
              strokeWidth="1"
            />
          </g>
        )}
      </svg>

      <div
        className="flex items-center justify-between t-mono"
        style={{ fontSize: 9, letterSpacing: "0.08em", color: "rgba(200,175,130,0.7)", marginTop: 4 }}
      >
        {active ? (
          <>
            <span>{new Date(active.t * 1000).toLocaleDateString()}</span>
            <span className="t-parch">
              O {fmt(active.o)} · H {fmt(active.h)} · L {fmt(active.l)} · C {fmt(active.c)}
            </span>
          </>
        ) : (
          <>
            <span>{new Date(candles[0].t * 1000).toLocaleDateString()}</span>
            <span>
              {currency} {fmt(min)} – {fmt(max)}
            </span>
            <span>{new Date(candles[candles.length - 1].t * 1000).toLocaleDateString()}</span>
          </>
        )}
      </div>
    </div>
  );
}
