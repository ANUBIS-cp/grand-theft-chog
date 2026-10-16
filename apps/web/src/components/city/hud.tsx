'use client';
import type { Icon } from '@phosphor-icons/react';
import { CaretDown, ChatCircleDots, Check, MapTrifold, Smiley, Trophy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';

// The heads-up display over the city, in frosted glass: who you are and today's jobs top left, a round
// minimap top right, round action buttons bottom right, and a toast that drops in for big moments.

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
    <div className="glass pointer-events-auto w-[min(312px,calc(100vw-140px))] animate-[glass-in_420ms_cubic-bezier(.2,.9,.3,1)] overflow-hidden rounded-[24px] text-white max-sm:w-[min(250px,calc(100vw-118px))] max-sm:rounded-[20px]">
      <div className="flex items-center gap-3 p-2.5 max-sm:gap-2.5 max-sm:p-2">
        <button
          onClick={props.onPortrait}
          aria-label="Your Chogs"
          className="press relative h-[46px] w-[46px] shrink-0 rounded-[14px] p-[2px] sm:h-[64px] sm:w-[64px] sm:rounded-[17px] sm:p-[2.5px]"
          style={{ background: `linear-gradient(160deg, ${props.color}, ${props.color}99)` }}
        >
          {props.chog !== null ? (
            <img
              src={chogImage(props.chog, 256)}
              alt=""
              className="h-full w-full rounded-[12px] object-cover sm:rounded-[15px]"
            />
          ) : (
            <span className="grid h-full w-full place-items-center rounded-[15px] bg-black/30 font-display text-[26px] text-white/70">
              ?
            </span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {props.gang && (
            <span className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-label-2 max-sm:text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: props.color }} />
              <span className="truncate">{props.gang}</span>
            </span>
          )}
          <span className="truncate font-display text-[19px] leading-tight max-sm:text-[15px]">
            {props.name}
          </span>
          {props.vault && (
            <span className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-sys-gold max-sm:text-[12px]">
              {props.vault}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Hide jobs' : 'Show jobs'}
          aria-expanded={open}
          className="hit press relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fill-2 text-label-2 hover:text-white max-sm:h-8 max-sm:w-8"
        >
          <CaretDown
            size={15}
            weight="bold"
            className={cn('transition-transform duration-300', open && 'rotate-180')}
          />
          {!open && left > 0 && (
            <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-sys-pink px-1 text-[11px] font-bold text-white">
              {left}
            </span>
          )}
        </button>
      </div>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.2,.9,.3,1)]',
          open && props.duties.length > 0 ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-2.5 border-t border-sep pb-2.5 pt-2">
            <p className="section-label px-1">Today</p>
            <ul className="mt-1 grid gap-0.5">
              {props.duties.map((d) => (
                <li key={d.key}>
                  <button
                    onClick={d.onGo}
                    disabled={!d.onGo}
                    className="group flex w-full items-start gap-2.5 rounded-[12px] px-1.5 py-1.5 text-left transition-colors enabled:hover:bg-white/[0.06]"
                  >
                    <span
                      className={cn(
                        'mt-[1px] grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full transition-colors',
                        d.done ? 'bg-sys-green text-black' : 'ring-[1.5px] ring-inset ring-white/35',
                      )}
                    >
                      {d.done && <Check size={12} weight="bold" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[15px] font-semibold leading-snug tracking-[-0.01em]',
                          d.done ? 'text-label-3 line-through' : 'text-white',
                        )}
                      >
                        {d.label}
                      </span>
                      {d.sub && <span className="block text-[13px] leading-snug text-label-2">{d.sub}</span>}
                    </span>
                    {d.onGo && !d.done && (
                      <CaretDown
                        size={13}
                        weight="bold"
                        className="mt-1 shrink-0 -rotate-90 text-label-3 transition-transform group-hover:translate-x-0.5"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {props.footer && <p className="mt-1 px-1.5 text-[12px] text-label-3">{props.footer}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiniMap(props: { area: string; online: string; dot: string; onOpen: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-2 max-sm:gap-1.5">
      <button
        onClick={props.onOpen}
        aria-label="Open the map"
        className="press glass relative h-[92px] w-[92px] rounded-full p-[4px] sm:h-[150px] sm:w-[150px] sm:p-[5px]"
      >
        <canvas id="city-minimap" className="h-full w-full rounded-full" />
        <span className="pointer-events-none absolute inset-[5px] rounded-full shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.2),inset_0_0_20px_rgba(0,0,0,0.55)]" />
        <span className="kbd absolute bottom-1 right-1 grid h-6 min-w-6 place-items-center rounded-[7px] bg-white px-1 text-[12px] font-bold text-black shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          M
        </span>
      </button>
      <span className="glass max-w-[170px] truncate rounded-full px-3 py-1 text-[13px] font-semibold text-white max-sm:max-w-[110px] max-sm:px-2.5 max-sm:py-0.5 max-sm:text-[12px]">
        {props.area}
      </span>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/80 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: props.dot }}
          />
          <span className="relative h-2 w-2 rounded-full" style={{ background: props.dot }} />
        </span>
        {props.online}
      </span>
    </div>
  );
}

/** A round glass button with its key, like a control in a game on iPad. */
export function RoundButton(props: {
  icon: Icon;
  label: string;
  hotkey?: string;
  big?: boolean;
  lit?: boolean;
  tone?: string;
  badge?: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const I = props.icon;
  const solid = props.big && !props.disabled;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="press pointer-events-auto flex flex-col items-center gap-1.5 disabled:opacity-50"
    >
      <span
        className={cn(
          'relative grid place-items-center rounded-full',
          !solid && 'glass',
          props.big
            ? 'h-[84px] w-[84px] sm:h-[92px] sm:w-[92px]'
            : 'h-[54px] w-[54px] sm:h-[58px] sm:w-[58px]',
          props.lit && 'animate-[pulse-ring_1.4s_ease-out_infinite]',
        )}
        style={
          solid
            ? {
                background: props.lit
                  ? 'linear-gradient(180deg,#ffe066,#ffc300)'
                  : 'linear-gradient(180deg,#ffffff,#d9d8e3)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 30px rgba(0,0,0,0.45)',
              }
            : undefined
        }
      >
        <I
          size={props.big ? 38 : 25}
          weight="fill"
          className={solid ? 'text-[#15131f]' : 'text-white'}
          style={props.tone && !solid ? { color: props.tone } : undefined}
        />
        {props.hotkey && (
          <span className="kbd absolute -right-0.5 -top-0.5 grid h-[20px] min-w-[20px] place-items-center rounded-[6px] bg-white/90 px-1 text-[11px] font-bold text-black shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
            {props.hotkey}
          </span>
        )}
        {!!props.badge && (
          <span className="absolute -left-0.5 -top-0.5 grid h-[20px] min-w-[20px] place-items-center rounded-full bg-sys-pink px-1 text-[11px] font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
            {props.badge > 99 ? '99+' : props.badge}
          </span>
        )}
      </span>
      <span className="text-[12px] font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
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
export function ChatButton({ onClick, unread }: { onClick: () => void; unread: number }) {
  return <RoundButton icon={ChatCircleDots} label="Chat" hotkey="↵" badge={unread} onClick={onClick} />;
}

/**
 * A phone's controls, the way phone games lay them out: one big action button under your right thumb, and the
 * small ones in an arc round it, icons only. Your left thumb has the rest of the screen to walk with.
 */
export function PhoneControls(props: {
  use: { icon: Icon; label: string; tone?: string; ready: boolean };
  onUse: () => void;
  unread: number;
  onChat: () => void;
  onEmote: () => void;
  onMap: () => void;
  onGangs: () => void;
}) {
  const U = props.use.icon;
  // Round the big button's middle, from its left going up over the top.
  const R = 96;
  const at = (deg: number) => ({
    right: 41 - 24 - Math.cos((deg * Math.PI) / 180) * R,
    bottom: 41 - 24 + Math.sin((deg * Math.PI) / 180) * R,
  });
  const small: { icon: Icon; label: string; onClick: () => void; badge?: number; deg: number }[] = [
    { icon: ChatCircleDots, label: 'Chat', onClick: props.onChat, badge: props.unread, deg: 180 },
    { icon: Smiley, label: 'Emote', onClick: props.onEmote, deg: 148 },
    { icon: MapTrifold, label: 'Map', onClick: props.onMap, deg: 116 },
    { icon: Trophy, label: 'Gangs', onClick: props.onGangs, deg: 84 },
  ];
  return (
    <div className="relative h-[82px] w-[82px]">
      {small.map((b) => {
        const I = b.icon;
        const p = at(b.deg);
        return (
          <button
            key={b.label}
            onClick={b.onClick}
            aria-label={b.label}
            className="press glass pointer-events-auto absolute grid h-12 w-12 place-items-center rounded-full"
            style={{ right: p.right, bottom: p.bottom }}
          >
            <I size={23} weight="fill" className="text-white" />
            {!!b.badge && (
              <span className="absolute -right-1 -top-1 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-sys-pink px-1 text-[11px] font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                {b.badge > 99 ? '99+' : b.badge}
              </span>
            )}
          </button>
        );
      })}
      <button
        onClick={props.onUse}
        disabled={!props.use.ready}
        aria-label={props.use.label}
        className={cn(
          'press pointer-events-auto absolute inset-0 grid place-items-center rounded-full transition-opacity',
          props.use.ready ? 'animate-[pulse-ring_1.4s_ease-out_infinite]' : 'glass opacity-60',
        )}
        style={
          props.use.ready
            ? {
                background: 'linear-gradient(180deg,#ffe066,#ffc300)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 12px 30px rgba(0,0,0,0.45)',
              }
            : undefined
        }
      >
        <span className="flex flex-col items-center gap-0.5">
          <U size={32} weight="fill" className={props.use.ready ? 'text-[#15131f]' : 'text-white'} />
          <span
            className={cn(
              'text-[11px] font-bold leading-none',
              props.use.ready ? 'text-[#15131f]' : 'text-white/80',
            )}
          >
            {props.use.label}
          </span>
        </span>
      </button>
    </div>
  );
}

export interface BannerData {
  id: string;
  /** Big words, e.g. "Robbed!" */
  title: string;
  line: string;
  chog?: number;
  tone: 'win' | 'lose' | 'alarm';
}

const TONE = {
  win: { accent: '#30d158', glow: 'rgba(48,209,88,0.35)' },
  lose: { accent: '#ff453a', glow: 'rgba(255,69,58,0.35)' },
  alarm: { accent: '#ff375f', glow: 'rgba(255,55,95,0.45)' },
};

/** A toast that drops in at the top for a few seconds, like a notification. */
export function Banner({ b, onClick }: { b: BannerData; onClick?: () => void }) {
  const t = TONE[b.tone];
  return (
    <button
      key={b.id}
      onClick={onClick}
      className="glass-strong press pointer-events-auto flex max-w-[min(520px,calc(100vw-24px))] animate-[banner-drop_520ms_cubic-bezier(.2,1.2,.3,1)] items-center gap-3 rounded-[26px] py-2.5 pl-2.5 pr-5 text-left text-white max-sm:w-full max-sm:rounded-[22px] max-sm:py-2 max-sm:pl-2 max-sm:pr-4"
      style={{ boxShadow: `0 18px 50px ${t.glow}, inset 0 0.5px 0 rgba(255,255,255,0.2)` }}
    >
      {b.chog !== undefined ? (
        <span className="relative shrink-0">
          <img
            src={chogImage(b.chog, 256)}
            alt=""
            className="h-12 w-12 rounded-[15px] object-cover max-sm:h-10 max-sm:w-10 max-sm:rounded-[12px]"
          />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-[#141220]"
            style={{ background: t.accent }}
          />
        </span>
      ) : (
        <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: t.accent }} />
      )}
      <span className="min-w-0">
        <span
          className="block font-display text-[20px] leading-tight max-sm:text-[17px]"
          style={{ color: t.accent }}
        >
          {b.title}
        </span>
        <span className="mt-0.5 block text-[14px] leading-snug text-label-2 max-sm:line-clamp-2 max-sm:text-[13px]">
          {b.line}
        </span>
      </span>
    </button>
  );
}
