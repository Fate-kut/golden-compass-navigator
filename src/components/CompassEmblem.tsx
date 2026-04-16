export function CompassEmblem({ size = 70 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 70 70"
      style={{ filter: "drop-shadow(0 0 12px rgba(201,168,76,0.4))" }}
    >
      <circle cx="35" cy="35" r="30" fill="none" stroke="rgba(255,220,120,0.25)" strokeWidth="2" />
      <g stroke="rgba(255,220,120,0.6)" strokeWidth="1.5">
        <line x1="35" y1="7" x2="35" y2="12" />
        <line x1="35" y1="58" x2="35" y2="63" />
        <line x1="7" y1="35" x2="12" y2="35" />
        <line x1="58" y1="35" x2="63" y2="35" />
      </g>
      <polygon points="35,11 38,33 35,30 32,33" fill="#FFE082" />
      <polygon points="35,59 38,37 35,40 32,37" fill="rgba(90,60,20,0.8)" />
      <circle cx="35" cy="35" r="5" fill="url(#cg)" />
      <text
        x="35"
        y="25"
        textAnchor="middle"
        fontFamily="Cinzel Decorative,serif"
        fontSize="6"
        fill="#FFE082"
      >
        N
      </text>
      <defs>
        <radialGradient id="cg" cx="35%" cy="25%">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="60%" stopColor="#C9A84C" />
          <stop offset="100%" stopColor="#7A5818" />
        </radialGradient>
      </defs>
    </svg>
  );
}
