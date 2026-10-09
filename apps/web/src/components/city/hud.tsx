'use client';
import type { Icon } from '@phosphor-icons/react';
import { CaretDown, Check, MapTrifold, Smiley, Trophy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';

// The heads-up display over the city, laid out like Goose Goose Duck: who you are and today's jobs top
// left, a round minimap top right, round action buttons bottom right, and comic banners for big moments.

export interface Duty {
  key: string;
  label: string;
  /** A second, quieter line. */
  sub?: string;
  done?: boolean;
  onGo?: () => void;
}

export function RoleCard(props: {
  chog: number | null;
  name: string;
  gang: string | null;
  color: string;
  ink: string;
  /** e.g. "$12,400 · #3". */
  vault?: string;
  duties: Duty[];
  footer?: string;
  onPortrait?: () => void;
}) {
  const [open, setOpen] = useState(true);
  // Small screens start folded so the city shows.
  useEffect(() => {
    if (window.innerWidth < 640) setOpen(false);
  }, []);
  const left = props.duties.filter((d) => !d.done).length;
  return (
    <div className="pointer-events-auto w-[min(300px,calc(100vw-160px))] overflow-hidden rounded-[18px] border-[3px] border-ink bg-[#17132b]/95 shadow-[0_5px_0_0_#000]">
      <div className="flex items-stretch">
        <button
          onClick={props.onPortrait}
          aria-label="Your Chogs"
          className="relative m-2 h-[64px] w-[64px] shrink-0 overflow-hidden rounded-[12px] border-[3px] border-ink sm:h-[72px] sm:w-[72px]"
          style={{ background: props.color }}
        >
          {props.chog !== null ? (
            <img src={chogImage(props.chog, 256)} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center font-display text-[32px] text-ink/70">
              ?
            </span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center py-2 pr-2">
          {props.gang && (
            <span
              className="mb-1 w-fit max-w-full truncate rounded-[6px] border-2 border-ink px-1.5 pb-0 pt-0.5 font-display text-[13px] uppercase leading-[1.15]"
              style={{ background: props.color, color: props.ink }}
            >
              {props.gang}
            </span>
          )}
          <span className="truncate font-display text-[22px] uppercase leading-none text-white">
            {props.name}
          </span>
          {props.vault && (
            <span className="mt-1 truncate text-[13px] font-semibold text-[#ffd666]">{props.vault}</span>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Hide jobs' : 'Show jobs'}
          aria-expanded={open}
          className="flex w-9 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 border-white/10 text-white/70 hover:text-white"
        >
          {!open && left > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#ffd666] px-1 text-[11px] font-bold text-ink">
              {left}
            </span>
          )}
          <CaretDown size={16} weight="bold" className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && props.duties.length > 0 && (
        <div className="border-t-2 border-white/10 px-3 pb-2.5 pt-2">
          <p className="font-display text-[14px] uppercase tracking-wide text-white/55">Today</p>
          <ul className="mt-1 grid gap-1">
            {props.duties.map((d) => (
              <li key={d.key}>
                <button
                  onClick={d.onGo}
                  disabled={!d.onGo}
                  className="group flex w-full items-start gap-2 rounded-[8px] px-1 py-1 text-left enabled:hover:bg-white/5"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2',
                      d.done ? 'border-[#3ddc84] bg-[#3ddc84] text-ink' : 'border-white/50',
                    )}
                  >
                    {d.done && <Check size={11} weight="bold" />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        'block text-[14px] font-semibold leading-tight',
                        d.done
                          ? 'text-white/45 line-through'
                          : 'text-white group-enabled:group-hover:text-[#ffd666]',
                      )}
                    >
                      {d.label}
                    </span>
                    {d.sub && <span className="block text-[12px] leading-tight text-white/50">{d.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {props.footer && <p className="mt-1.5 text-[11px] text-white/40">{props.footer}</p>}
        </div>
      )}
    </div>
  );
}

export function MiniMap(props: { area: string; online: string; dot: string; onOpen: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <button
        onClick={props.onOpen}
        aria-label="Open the map"
        className="relative h-[112px] w-[112px] rounded-full border-[3px] border-ink bg-[#0b0918] shadow-[0_5px_0_0_#000] sm:h-[156px] sm:w-[156px]"
      >
        <canvas id="city-minimap" className="h-full w-full rounded-full" />
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_0_3px_rgba(255,255,255,0.12),inset_0_0_18px_rgba(0,0,0,0.6)]" />
        <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-[6px] border-2 border-ink bg-white font-display text-[13px] leading-none text-ink">
          M
        </span>
      </button>
      <span className="max-w-[160px] truncate rounded-[8px] border-2 border-ink bg-[#ffd666] px-2 pb-0 pt-1 font-display text-[15px] uppercase leading-none text-ink shadow-[0_3px_0_0_#000]">
        {props.area}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white/85">
        <span className="h-2 w-2 rounded-full" style={{ background: props.dot }} />
        {props.online}
      </span>
    </div>
  );
}

/** A round button with a key label, like the game's action buttons. */
export function RoundButton(props: {
  icon: Icon;
  label: string;
  hotkey?: string;
  big?: boolean;
  lit?: boolean;
  tone?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const I = props.icon;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="pointer-events-auto flex flex-col items-center gap-1 disabled:opacity-60"
    >
      <span
        className={cn(
          'relative grid place-items-center rounded-full border-[3px] border-ink shadow-[0_5px_0_0_#000] transition active:translate-y-[3px] active:shadow-[0_2px_0_0_#000]',
          props.big
            ? 'h-[84px] w-[84px] sm:h-[96px] sm:w-[96px]'
            : 'h-[56px] w-[56px] sm:h-[62px] sm:w-[62px]',
          props.lit && 'animate-[pulse-ring_1.4s_ease-out_infinite]',
        )}
        style={{ background: props.tone ?? '#ffffff' }}
      >
        <I size={props.big ? 42 : 28} weight="fill" className="text-ink" />
        {props.hotkey && (
          <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-[6px] border-2 border-ink bg-[#17132b] px-1 font-display text-[13px] leading-none text-white">
            {props.hotkey}
          </span>
        )}
      </span>
      <span className="font-display text-[15px] uppercase leading-none text-white [text-shadow:0_2px_0_#000,0_0_6px_#000] sm:text-[17px]">
        {props.label}
      </span>
    </button>
  );
}

export function MapButton({ onClick }: { onClick: () => void }) {
  return <RoundButton icon={MapTrifold} label="Map" hotkey="M" onClick={onClick} />;
}
export function GangsButton({ onClick }: { onClick: () => void }) {
  return <RoundButton icon={Trophy} label="Gangs" hotkey="G" onClick={onClick} />;
}
export function EmoteButton({ onClick }: { onClick: () => void }) {
  return <RoundButton icon={Smiley} label="Emote" hotkey="T" onClick={onClick} />;
}

export interface BannerData {
  id: string;
  /** Big words, e.g. "ROBBED!" */
  title: string;
  line: string;
  chog?: number;
  tone: 'win' | 'lose' | 'alarm';
}

const TONE = {
  win: { bg: '#ffd666', fg: '#0d0b1a', strip: '#3ddc84' },
  lose: { bg: '#ff5a4f', fg: '#0d0b1a', strip: '#0d0b1a' },
  alarm: { bg: '#ff2d55', fg: '#ffffff', strip: '#ffd666' },
};

/** A comic banner that slaps across the top of the screen for a few seconds. */
export function Banner({ b, onClick }: { b: BannerData; onClick?: () => void }) {
  const t = TONE[b.tone];
  return (
    <button
      key={b.id}
      onClick={onClick}
      className="pointer-events-auto flex max-w-[min(560px,calc(100vw-24px))] animate-[banner-in_420ms_cubic-bezier(.2,1.6,.4,1)] items-center gap-3 rounded-[14px] border-[3px] border-ink py-2 pl-2 pr-4 text-left shadow-[0_6px_0_0_#000] [transform:rotate(-1.5deg)]"
      style={{ background: t.bg, color: t.fg }}
    >
      {b.chog !== undefined && (
        <img
          src={chogImage(b.chog, 256)}
          alt=""
          className="h-14 w-14 shrink-0 rounded-[10px] border-[3px] border-ink object-cover"
        />
      )}
      <span className="min-w-0">
        <span className="block font-display text-[30px] uppercase leading-[0.9] [text-shadow:2px_2px_0_rgba(0,0,0,0.25)]">
          {b.title}
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold leading-snug">{b.line}</span>
      </span>
    </button>
  );
}
