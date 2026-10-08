import type { SkillId } from '@chog-city/data';
import type { SVGProps } from 'react';

// Hand-drawn skill glyphs. 24x24 grid, 2.2 stroke, round joins: the same thick ink line as the Chog art.
// Filled parts use currentColor; holes use evenodd so they work on any background.

type P = SVGProps<SVGSVGElement>;

function Glyph({ children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

/** A ring sector, for the radiation sign. Angles in degrees, 0 = right, clockwise. */
function sector(r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => {
    const t = (a * Math.PI) / 180;
    return `${(12 + r * Math.cos(t)).toFixed(2)} ${(12 + r * Math.sin(t)).toFixed(2)}`;
  };
  return `M${pt(r0, a0)} L${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
}

export const SKILL_ICON: Record<SkillId, (p: P) => React.ReactElement> = {
  muscle: (p) => (
    <Glyph {...p}>
      <path d="M7.4 12h9.2" strokeWidth={2.6} />
      <rect x="3.6" y="6.8" width="3.8" height="10.4" rx="1.2" fill="currentColor" strokeWidth={1.6} />
      <rect x="16.6" y="6.8" width="3.8" height="10.4" rx="1.2" fill="currentColor" strokeWidth={1.6} />
      <path d="M1.8 12h1.8M20.4 12h1.8" strokeWidth={2.6} />
    </Glyph>
  ),
  stealth: (p) => (
    <Glyph {...p}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        stroke="none"
        d="M2 11.2C2 8.9 3.8 7.8 6 7.8c2.3 0 3.8 1.1 6 1.1s3.7-1.1 6-1.1c2.2 0 4 1.1 4 3.4 0 2.9-2 5.3-4.9 5.3-2.1 0-3.2-1.7-5.1-1.7s-3 1.7-5.1 1.7C4 16.5 2 14.1 2 11.2zm5.6-1.3c-1.3 0-2.2.8-2.2 1.8s.9 1.6 2.2 1.6 2.3-.6 2.3-1.6-1-1.8-2.3-1.8zm8.8 0c-1.3 0-2.3.8-2.3 1.8s1 1.6 2.3 1.6 2.2-.6 2.2-1.6-.9-1.8-2.2-1.8z"
      />
    </Glyph>
  ),
  laser: (p) => (
    <Glyph {...p}>
      <path d="M2.5 12S5.6 7 11 7s8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5z" />
      <circle cx="11" cy="12" r="2.3" fill="currentColor" stroke="none" />
      <path d="M13.5 12h8" strokeWidth={2.6} />
    </Glyph>
  ),
  blade: (p) => (
    <Glyph {...p}>
      <path
        d="M9.8 14.2 19.6 4.4c.6-.6 1.6-.1 1.4.7-.8 4.4-4.1 8.2-8.2 10.3z"
        fill="currentColor"
        strokeWidth={1.6}
      />
      <path d="m3.6 18.6 4.4-4.4 1.9 1.9-4.4 4.4a1.3 1.3 0 0 1-1.9 0 1.3 1.3 0 0 1 0-1.9z" />
    </Glyph>
  ),
  smooth: (p) => (
    <Glyph {...p}>
      <path
        d="M10.3 12 3.5 7.6c-.5-.3-1 0-1 .6v7.6c0 .6.5.9 1 .6zM13.7 12l6.8-4.4c.5-.3 1 0 1 .6v7.6c0 .6-.5.9-1 .6z"
        fill="currentColor"
        strokeWidth={1.6}
      />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" rx="1.2" fill="currentColor" strokeWidth={1.6} />
    </Glyph>
  ),
  money: (p) => (
    <Glyph {...p}>
      <ellipse cx="12" cy="6.4" rx="7" ry="2.7" />
      <path d="M5 6.4v3.8c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6.4" />
      <path d="M5 10.2V14c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-3.8" />
      <path d="M5 14v3.6c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V14" />
    </Glyph>
  ),
  tech: (p) => (
    <Glyph {...p}>
      <path d="M2.8 9.6C2.8 8.2 3.9 7 5.3 7h13.4c1.4 0 2.5 1.2 2.5 2.6v4.2c0 1.4-1.1 2.5-2.5 2.5h-3.4l-1.7-2.1h-3.2l-1.7 2.1H5.3c-1.4 0-2.5-1.1-2.5-2.5z" />
      <path d="M6.3 10.6h3.2M14.5 10.6h3.2" />
    </Glyph>
  ),
  magic: (p) => (
    <Glyph {...p}>
      <path d="M6.6 17.2 11 4.6c.4-1.1 2-1.1 2.4 0l1.1 3.4 2.2-1.1-.8 3.6 1.5 6.7" />
      <path d="M3.2 18.2c2.6 1.9 15 1.9 17.6 0" />
      <path
        d="m11.7 11.6.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z"
        fill="currentColor"
        strokeWidth={1}
      />
    </Glyph>
  ),
  royal: (p) => (
    <Glyph {...p}>
      <path d="m3.4 7.8 4.3 3.7L12 4.8l4.3 6.7 4.3-3.7-1.8 9.5H5.2z" fill="currentColor" strokeWidth={1.8} />
      <path d="M5.4 20.3h13.2" />
    </Glyph>
  ),
  guard: (p) => (
    <Glyph {...p}>
      <path d="M12 2.8 19 5.5v5.4c0 4.6-3 8.4-7 10.3-4-1.9-7-5.7-7-10.3V5.5z" />
      <path
        d="m12 7.9 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"
        fill="currentColor"
        strokeWidth={1.1}
      />
    </Glyph>
  ),
  jailbird: (p) => (
    <Glyph {...p}>
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="2.2" />
      <path d="M8 3.6v16.8M12 3.6v16.8M16 3.6v16.8" />
    </Glyph>
  ),
  runner: (p) => (
    <Glyph {...p}>
      <path d="M3 15.8v-3.9c0-.6.5-1 1.1-.9 1.7.3 3.2-.5 4-1.9l1-1.9c.3-.5.9-.6 1.3-.2l1.1 1.1c1.6 1.6 3.6 2.6 5.8 2.9l1.5.2c1.5.2 2.7 1.5 2.7 3v1.6c0 .6-.4 1-1 1H4c-.6 0-1-.4-1-1z" />
      <path d="M3 19.4h18M12.5 9.8l-1.4 1.6M14.8 11.2l-1.2 1.6" />
    </Glyph>
  ),
  clown: (p) => (
    <Glyph {...p}>
      <path d="M4.2 13.5C4.6 8 8 4.8 12 4.8s7.4 3.2 7.8 8.7" strokeDasharray="0.1 3.4" />
      <circle cx="12" cy="5.2" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="5.6" cy="17.4" r="2.9" fill="currentColor" stroke="none" />
      <circle cx="18.4" cy="17.4" r="2.9" fill="currentColor" stroke="none" />
    </Glyph>
  ),
  charm: (p) => (
    <Glyph {...p}>
      <path
        d="M12 20.2 4.6 13.1C2.4 11 2.4 7.6 4.6 5.6s5.4-1.6 7.4.8c2-2.4 5.3-2.8 7.4-.8s2.2 5.4 0 7.5z"
        fill="currentColor"
        strokeWidth={1.8}
      />
    </Glyph>
  ),
  worker: (p) => (
    <Glyph {...p}>
      <path d="m13.4 4.3 6.3 6.3-2.6 2.6-6.3-6.3z" fill="currentColor" strokeWidth={1.8} />
      <path d="m12.4 9.6-8 8a1.6 1.6 0 0 0 2.3 2.3l8-8" />
    </Glyph>
  ),
  undead: (p) => (
    <Glyph {...p}>
      <path d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.6 1.3 4.6 3.3 5.8v2.7c0 .6.4 1.1 1 1.1h7.4c.6 0 1-.5 1-1.1v-2.7c2-1.2 3.3-3.2 3.3-5.8C20 6.2 16.4 3 12 3z" />
      <circle cx="9" cy="10.9" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.9" r="1.9" fill="currentColor" stroke="none" />
      <path d="M10.6 20v-2.2M13.4 20v-2.2" strokeWidth={1.8} />
    </Glyph>
  ),
  toxic: (p) => (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path
        d={`${sector(2.8, 7.2, -120, -60)} ${sector(2.8, 7.2, 0, 60)} ${sector(2.8, 7.2, 120, 180)}`}
        fill="currentColor"
        stroke="none"
      />
    </Glyph>
  ),
};

export function SkillIcon({ skill, ...p }: P & { skill: SkillId }) {
  const Icon = SKILL_ICON[skill];
  return <Icon {...p} />;
}
