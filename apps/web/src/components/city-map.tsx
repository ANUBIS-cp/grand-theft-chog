'use client';
import { DISTRICTS, GANGS, type DistrictId, type GangId } from '@chog-city/data';
import { DISTRICT_COLOR, GANG_COLOR } from '@/lib/theme';

// The city as a board-game map: one block per district, drawn on a 400 x 520 grid.
// Water runs along the bottom; the Radioactive Zone is fenced in the corner.

type Box = { x: number; y: number; w: number; h: number };
export const BLOCKS: Record<DistrictId, Box> = {
  'green-park': { x: 10, y: 10, w: 140, h: 140 },
  'blue-heights': { x: 160, y: 10, w: 120, h: 140 },
  'purple-hill': { x: 290, y: 10, w: 100, h: 200 },
  'lemon-row': { x: 10, y: 160, w: 140, h: 170 },
  'mon-square': { x: 160, y: 160, w: 120, h: 170 },
  'pink-strip': { x: 290, y: 220, w: 100, h: 180 },
  'aqua-docks': { x: 10, y: 340, w: 270, h: 90 },
  'radioactive-zone': { x: 290, y: 410, w: 100, h: 100 },
};

export interface MapPing {
  id: number;
  district: DistrictId;
  /** 0..1 spot inside the block, so pings don't stack. */
  u: number;
  v: number;
}

function Block({
  d,
  holder,
  leader,
  closed,
  mine,
  onPick,
}: {
  d: DistrictId;
  holder: GangId | null;
  leader: GangId | null;
  closed: boolean;
  mine: boolean;
  onPick: (d: DistrictId) => void;
}) {
  const b = BLOCKS[d];
  const c = DISTRICT_COLOR[d];
  const name = DISTRICTS[d].name.toUpperCase();
  const label = `${DISTRICTS[d].name}${holder ? `, held by ${GANGS[holder].name}` : ', nobody holds it yet'}${closed ? ', closed until Halloween' : ''}`;
  const g = holder ? GANG_COLOR[holder] : null;
  const words = name.split(' ');
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[5]"
      onClick={() => onPick(d)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(d))}
    >
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={10}
        fill={c.bg}
        stroke="var(--color-ink)"
        strokeWidth={3}
      />
      {closed && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} fill="url(#hatch)" />}
      {mine && (
        <rect
          x={b.x + 5}
          y={b.y + 5}
          width={b.w - 10}
          height={b.h - 10}
          rx={7}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
      )}
      {/* street sign */}
      <rect
        x={b.x + 8}
        y={b.y + 8}
        width={Math.min(b.w - 16, 12 + Math.max(...words.map((w) => w.length)) * 8.6)}
        height={words.length * 15 + 8}
        rx={4}
        fill="var(--color-paper-raised)"
        stroke="var(--color-ink)"
        strokeWidth={2}
      />
      <text
        x={b.x + 14}
        y={b.y + 26}
        fontSize={15}
        fill="var(--color-ink)"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {words.map((w, i) => (
          <tspan key={w} x={b.x + 14} dy={i === 0 ? 0 : 15}>
            {w}
          </tspan>
        ))}
      </text>
      {/* the holder's tag */}
      {g && holder && (
        <g transform={`rotate(-5 ${b.x + b.w / 2} ${b.y + b.h - 26})`}>
          <rect
            x={b.x + 8}
            y={b.y + b.h - 40}
            width={b.w - 16}
            height={26}
            rx={4}
            fill={g.bg}
            stroke="var(--color-ink)"
            strokeWidth={2.5}
          />
          <text
            x={b.x + b.w / 2}
            y={b.y + b.h - 21}
            textAnchor="middle"
            fontSize={GANGS[holder].name.length > 11 ? 13 : 16}
            fill={g.fg}
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {GANGS[holder].name.toUpperCase()}
          </text>
        </g>
      )}
      {!holder && !closed && (
        <text
          x={b.x + b.w / 2}
          y={b.y + b.h - 18}
          textAnchor="middle"
          fontSize={11}
          fill="var(--color-ink)"
          opacity={0.6}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          NOBODY YET
        </text>
      )}
      {closed && (
        <text
          x={b.x + b.w / 2}
          y={b.y + b.h - 16}
          textAnchor="middle"
          fontSize={12}
          fill={c.fg}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          OPENS FOR HALLOWEEN
        </text>
      )}
      {leader && leader !== holder && !closed && (
        <text
          x={b.x + 12}
          y={b.y + b.h - 48}
          fontSize={10}
          fill="var(--color-ink)"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {`${GANGS[leader].name.toUpperCase().slice(0, 14)} LEADS`}
        </text>
      )}
    </g>
  );
}

export function CityMap({
  holders,
  leaders,
  closed,
  myGang,
  pings,
  onPick,
}: {
  holders: Partial<Record<DistrictId, GangId>>;
  leaders: Partial<Record<DistrictId, GangId>>;
  closed: (d: DistrictId) => boolean;
  myGang: GangId | null;
  pings: MapPing[];
  onPick: (d: DistrictId) => void;
}) {
  return (
    <svg
      viewBox="0 0 400 520"
      className="h-auto w-full select-none"
      role="group"
      aria-label="Map of Chog City. Tap a district to see who is winning it today."
    >
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="rgb(0 0 0 / 0.28)" />
        </pattern>
        <pattern id="waves" width="24" height="10" patternUnits="userSpaceOnUse">
          <path
            d="M0 6 q6 -5 12 0 t12 0"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="1.4"
            opacity="0.35"
          />
        </pattern>
      </defs>
      {/* streets */}
      <rect x={0} y={0} width={400} height={520} rx={14} fill="var(--color-paper-sunk)" />
      {/* water and piers */}
      <rect
        x={10}
        y={440}
        width={270}
        height={70}
        rx={10}
        fill="#96e9f3"
        stroke="var(--color-ink)"
        strokeWidth={3}
      />
      <rect x={10} y={440} width={270} height={70} rx={10} fill="url(#waves)" />
      {[50, 120, 190, 250].map((x) => (
        <rect
          key={x}
          x={x}
          y={428}
          width={12}
          height={34}
          fill="var(--color-paper-raised)"
          stroke="var(--color-ink)"
          strokeWidth={2}
        />
      ))}
      {(Object.keys(BLOCKS) as DistrictId[]).map((d) => (
        <Block
          key={d}
          d={d}
          holder={holders[d] ?? null}
          leader={leaders[d] ?? null}
          closed={closed(d)}
          mine={!!myGang && holders[d] === myGang}
          onPick={onPick}
        />
      ))}
      {pings.map((p) => {
        const b = BLOCKS[p.district];
        const cx = b.x + 20 + p.u * (b.w - 40);
        const cy = b.y + 45 + p.v * (b.h - 95);
        return (
          <g key={p.id} className="pointer-events-none">
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="var(--color-pink)"
              stroke="var(--color-ink)"
              strokeWidth={2}
              className="animate-[ping-pop_2.4s_ease-out_forwards]"
            />
          </g>
        );
      })}
    </svg>
  );
}
