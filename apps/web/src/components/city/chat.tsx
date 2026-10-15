'use client';
import { GANGS, type GangId } from '@chog-city/data';
import { ArrowUp, ChatCircleDots, X } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { GANG_COLOR } from '@/lib/theme';
import type { ChatMsg } from './live-city';

// The city chat, built like a messages app: a City room and your gang's room, bubbles grouped by who's
// talking with their Chog beside them, yours in pink on the right. Closed, the latest few city messages float
// over the bottom of the city for a moment, so you see the talk without opening anything.

type Room = 'city' | 'gang';

const REFUSED: Record<string, string> = {
  guest: 'Only Chog holders can chat. Connect a wallet with a Chog.',
  'no-gang': 'Pick a gang first to talk in a gang room.',
  slow: 'Slow down a little.',
  empty: '',
};

const time = (at: number) =>
  new Date(at)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?[AP]M$/i, (m) => m.toLowerCase());

export function ChatPanel(props: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  msgs: ChatMsg[];
  /** Your Chog (null for a guest) and gang. */
  me: { chog: number | null; gang: GangId | null };
  refused: string | null;
  onSend: (room: Room, text: string) => void;
  onConnect: () => void;
  onPerson: (who: { chog: number; name: string; gang: GangId | null }) => void;
}) {
  const [room, setRoom] = useState<Room>('city');
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = useMemo(
    () => props.msgs.filter((m) => (room === 'city' ? m.room === 'city' : m.room === 'gang')),
    [props.msgs, room],
  );
  const canGang = !!props.me.gang;
  // On a phone the keyboard covers the bottom of the screen: lift the chat above it.
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !props.open) return;
    const on = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => {
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
    };
  }, [props.open]);
  useEffect(() => {
    if (room === 'gang' && !canGang) setRoom('city');
  }, [room, canGang]);
  // Stick to the newest message.
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, props.open, room]);
  useEffect(() => {
    if (props.open) requestAnimationFrame(() => input.current?.focus());
  }, [props.open]);

  const send = () => {
    const t = text.trim();
    if (!t || props.me.chog === null) return;
    props.onSend(room, t);
    setText('');
  };

  if (!props.open) return <ChatPeek msgs={props.msgs} me={props.me.chog} onOpen={props.onOpen} />;

  // Group consecutive messages from the same Chog within two minutes; a time line after a long gap.
  const rows: { m: ChatMsg; first: boolean; last: boolean; stamp: boolean }[] = shown.map((m, i) => {
    const prev = shown[i - 1];
    const next = shown[i + 1];
    const same = (a?: ChatMsg, b?: ChatMsg) => !!a && !!b && a.chog === b.chog && b.at - a.at < 120_000;
    return {
      m,
      first: !same(prev, m),
      last: !same(m, next),
      stamp: !prev || m.at - prev.at > 10 * 60_000,
    };
  });
  const placeholder =
    room === 'gang' && props.me.gang ? `Message ${GANGS[props.me.gang].name}` : 'Message the city';

  return (
    <div
      className="glass-strong pointer-events-auto flex h-[min(460px,62dvh)] w-[min(380px,calc(100vw-24px))] origin-bottom-left animate-[glass-in_380ms_cubic-bezier(.2,.9,.3,1)] flex-col overflow-hidden rounded-[28px] text-white max-sm:w-full"
      style={{ marginBottom: kb, maxHeight: kb ? `calc(100dvh - ${kb + 80}px)` : undefined }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose();
        e.stopPropagation();
      }}
    >
      {/* Header: the two rooms as a segmented control */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative grid flex-1 grid-cols-2 rounded-[11px] bg-fill-2 p-[3px]">
          <span
            className="absolute bottom-[3px] top-[3px] w-[calc(50%-3px)] rounded-[9px] bg-white/[0.16] shadow-[0_3px_8px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.1)]"
            style={{ transform: `translateX(${room === 'gang' ? '100%' : '0'})`, left: 3 }}
          />
          <button
            onClick={() => setRoom('city')}
            className={cn(
              'relative h-8 text-[14px] font-semibold transition-colors',
              room === 'city' ? 'text-white' : 'text-label-2',
            )}
          >
            City
          </button>
          <button
            onClick={() => canGang && setRoom('gang')}
            disabled={!canGang}
            className={cn(
              'relative flex h-8 items-center justify-center gap-1.5 truncate px-2 text-[14px] font-semibold transition-colors disabled:opacity-40',
              room === 'gang' ? 'text-white' : 'text-label-2',
            )}
          >
            {props.me.gang && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: GANG_COLOR[props.me.gang].bg }}
              />
            )}
            <span className="truncate">{props.me.gang ? GANGS[props.me.gang].name : 'Gang'}</span>
          </button>
        </div>
        <button
          onClick={props.onClose}
          aria-label="Close chat"
          className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-label-2 hover:text-white"
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Messages */}
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
        {rows.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <ChatCircleDots size={34} weight="duotone" className="mx-auto text-label-3" />
              <p className="mt-2 text-[15px] font-semibold">No messages yet</p>
              <p className="mt-0.5 text-[13px] text-label-2">
                {room === 'gang'
                  ? 'Plan your next robbery here. Only your gang sees it.'
                  : 'Say gm to the city.'}
              </p>
            </div>
          </div>
        )}
        {rows.map(({ m, first, last, stamp }) => {
          const mine = m.chog === props.me.chog;
          const color = m.from ? GANG_COLOR[m.from].bg : '#8e8e93';
          return (
            <div key={m.id}>
              {stamp && (
                <p className="pb-1 pt-3 text-center text-[11px] font-medium text-label-3">{time(m.at)}</p>
              )}
              <div
                className={cn(
                  'flex items-end gap-2',
                  mine ? 'justify-end' : 'justify-start',
                  first ? 'mt-2' : 'mt-[3px]',
                )}
              >
                {!mine && (
                  <button
                    onClick={() => props.onPerson({ chog: m.chog, name: m.name, gang: m.from })}
                    className={cn('press h-7 w-7 shrink-0', !last && 'invisible')}
                    aria-label={m.name}
                  >
                    <img src={chogImage(m.chog, 96)} alt="" className="h-7 w-7 rounded-[9px] object-cover" />
                  </button>
                )}
                <div className={cn('flex max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
                  {first && !mine && (
                    <span className="mb-0.5 px-2 text-[12px] font-semibold" style={{ color }}>
                      {m.name}
                    </span>
                  )}
                  <span
                    className={cn(
                      'animate-[pop-in_260ms_cubic-bezier(.2,.9,.3,1.2)] whitespace-pre-wrap break-words px-3 py-[7px] text-[15px] leading-[1.32] tracking-[-0.01em]',
                      mine
                        ? 'bg-[linear-gradient(180deg,#ff5c86,#ff2d6a)] text-white'
                        : 'bg-white/[0.11] text-white',
                      // Rounded all round, with a tighter corner where the group continues.
                      mine
                        ? cn('rounded-[19px]', !first && 'rounded-tr-[6px]', !last && 'rounded-br-[6px]')
                        : cn('rounded-[19px]', !first && 'rounded-tl-[6px]', !last && 'rounded-bl-[6px]'),
                    )}
                  >
                    {m.text}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Writing */}
      <div className="border-t border-sep px-3 pb-3 pt-2.5">
        {props.refused && REFUSED[props.refused] && (
          <p className="mb-1.5 px-1 text-[12px] text-sys-orange">{REFUSED[props.refused]}</p>
        )}
        {props.me.chog === null ? (
          <button onClick={props.onConnect} className="btn press btn-glass w-full">
            Connect a wallet with a Chog to chat
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 rounded-full bg-white/[0.08] py-1 pl-4 pr-1 ring-1 ring-inset ring-white/10 focus-within:ring-white/25"
          >
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 240))}
              placeholder={placeholder}
              enterKeyHint="send"
              maxLength={240}
              className="h-8 min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-label-3"
            />
            {text.length > 200 && (
              <span className="text-[11px] tabular-nums text-label-3">{240 - text.length}</span>
            )}
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Send"
              className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,#ff5c86,#ff2d6a)] text-white transition-opacity disabled:opacity-30"
            >
              <ArrowUp size={16} weight="bold" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Closed: the newest few city messages float up over the city for a few seconds. Tap to open the chat. */
function ChatPeek({ msgs, me, onOpen }: { msgs: ChatMsg[]; me: number | null; onOpen: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Times come from the live server's clock, which is the same wall clock.
  const live = msgs.filter((m) => m.room === 'city' && now - m.at < 9000 && m.chog !== me).slice(-3);
  if (!live.length) return null;
  return (
    <button
      onClick={onOpen}
      className="pointer-events-auto flex max-w-[min(340px,calc(100vw-24px))] flex-col items-start gap-1.5 text-left"
    >
      {live.map((m) => (
        <span
          key={m.id}
          className="glass flex max-w-full animate-[glass-in_320ms_cubic-bezier(.2,.9,.3,1)] items-center gap-2 rounded-[18px] py-1.5 pl-1.5 pr-3 transition-opacity duration-700"
          style={{ opacity: now - m.at > 7000 ? 0 : 1 }}
        >
          <img src={chogImage(m.chog, 96)} alt="" className="h-6 w-6 shrink-0 rounded-[8px] object-cover" />
          <span className="min-w-0 truncate text-[13px] text-white">
            <span className="font-semibold" style={{ color: m.from ? GANG_COLOR[m.from].bg : '#8e8e93' }}>
              {m.name}
            </span>{' '}
            {m.text}
          </span>
        </span>
      ))}
    </button>
  );
}
