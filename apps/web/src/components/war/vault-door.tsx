/** A round vault door in a gang's colour, with a light per defence level. */
export function VaultDoor({ color, tier, size = 64 }: { color: string; tier: number; size?: number }) {
  const bolts = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r="30" fill="#2b2a33" stroke="#111" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="25" fill={color} stroke="#111" strokeWidth="2" />
      <circle cx="32" cy="32" r="19" fill="#d9d6e6" stroke="#111" strokeWidth="2" />
      {bolts.map((a) => (
        <circle key={a} cx={32 + Math.cos(a) * 22} cy={32 + Math.sin(a) * 22} r="1.8" fill="#111" />
      ))}
      {[0, 60, 120].map((deg) => (
        <rect
          key={deg}
          x="30.5"
          y="16"
          width="3"
          height="32"
          rx="1.5"
          fill="#55536a"
          stroke="#111"
          strokeWidth="1"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="6" fill="#8c94ab" stroke="#111" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx={22 + i * 10}
          cy="58"
          r="3"
          fill={i < tier ? '#ff3b3b' : '#3a3946'}
          stroke="#111"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}
