'use client';
import {
  placeOf,
  seeded,
  spawnPatrol,
  stepPatrol,
  trackAt,
  trackLength,
  type GetawayTrack,
} from '@chog-city/game/city';
import type { GangId } from '@chog-city/data';
import { bloodMoon, halloweenCity } from '@chog-city/game';
import { ArrowClockwise } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { CityRenderer, type Person, type PlaceLook } from '@/components/city/city-render';
import { Halloween } from '@/components/city/halloween';
import { Sound } from '@/components/heist/sound';
import { chogImage } from '@/lib/images';
import { cn } from '@/lib/cn';
import { frameGate } from '@/lib/frames';
import { useNoPageScroll } from '@/lib/no-page-scroll';

// Stage 3 of a replay: the run home through the city, as the live server recorded it (five frames a second,
// smoothed between). Drawn with the city's own renderer, the camera on the robber, under the sky it really had:
// a run home during the Blood Moon plays red and haunted, and if the moon set on the way it sets in the replay too.

export interface GetawayReplayProps {
  track: GetawayTrack;
  robber: { id: number; name: string; gang: GangId; color: string; ink: string };
  home: GangId;
  bag: number;
  places: Record<string, PlaceLook>;
  /** Who made the catch, when the robbed gang did. */
  catcher?: { id: number; name: string } | null;
  /** When the run home began (ms), and the ghosts of the haunting (Skulls' and Radioactive's guards). */
  at: number;
  ghosts: number[];
  onVault: () => void;
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

export function GetawayReplay(props: GetawayReplayProps) {
  useNoPageScroll();
  const { track } = props;
  const cv = useRef<HTMLCanvasElement>(null);
  const [run, setRun] = useState(0);
  const [over, setOver] = useState(false);
  const [left, setLeft] = useState(Math.ceil(trackLength(track) / 1000));
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const c = cv.current!;
    const r = new CityRenderer(c, () => {});
    const body = getComputedStyle(document.body);
    r.font = body.getPropertyValue('--font-display').trim() || 'Impact, sans-serif';
    r.bodyFont = body.getPropertyValue('--font-sans').trim() || 'Arial, sans-serif';
    const fit = () => {
      const b = c.parentElement!.getBoundingClientRect();
      r.resize(b.width, b.height);
      const at = trackAt(track, 0).me;
      r.follow(at.x, at.y, true);
    };
    fit();
    window.addEventListener('resize', fit);
    const len = trackLength(track);
    const faces = new Map<string, -1 | 1>();
    const was = new Map<string, { x: number; y: number }>();
    const t0 = performance.now();
    let raf = 0;
    let shown = -1;
    let last = t0;
    const rnd = seeded(7);
    const start = trackAt(track, 0).me;
    r.sirens = [spawnPatrol(start, rnd), spawnPatrol(start, rnd)];
    // The sky at the start, set at once (no fading in as the replay opens); after that it turns as it did.
    const sky = (ms: number) => {
      const when = propsRef.current.at + ms;
      r.hunts.moon = bloodMoon(when) !== null;
      const haunted = halloweenCity(when) && propsRef.current.ghosts.length > 0;
      if (haunted && !r.haunt) r.haunt = new Halloween(propsRef.current.ghosts);
      r.hauntOn = haunted;
    };
    sky(0);
    r.settle();
    setOver(false);
    // The run home sounds like the real one: the robber's footsteps, the sirens closing in, and how it ended.
    const sound = new Sound();
    try {
      sound.setMuted(localStorage.getItem('heist-muted') === '1');
    } catch {
      /* no storage */
    }
    r.onStep = (what, style) => (what === 'step' ? sound.step(style) : sound.flick());
    let ended = false;
    const gate = frameGate();
    // One bad frame must never stop the game: if drawing throws, the next frame still comes.
    const frame = (now: number) => {
      try {
        step(now);
      } catch (e) {
        console.error(e);
        raf = requestAnimationFrame(frame);
      }
    };
    const step = (now: number) => {
      if (!gate(now)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const p = propsRef.current;
      const ms = Math.min(len, now - t0);
      const at = trackAt(track, ms);
      sky(ms);
      const person = (key: string, x: number, y: number, extra: Partial<Person>): Person => {
        const prev = was.get(key);
        const dx = prev ? x - prev.x : 0;
        const moving = !!prev && Math.hypot(dx, y - prev.y) > 0.002 && ms < len;
        if (Math.abs(dx) > 0.003) faces.set(key, dx < 0 ? -1 : 1);
        was.set(key, { x, y });
        return {
          key,
          chog: null,
          name: '',
          color: '#3b5bdb',
          ink: '#ffffff',
          x,
          y,
          face: faces.get(key) ?? 1,
          moving,
          ...extra,
        };
      };
      const people: Person[] = [
        ...at.cops.map((k, i) =>
          person(`cop${i}`, k.x, k.y, { chog: track.cops[i] ?? null, name: 'Police', cop: true }),
        ),
        person('me', at.me.x, at.me.y, {
          chog: p.robber.id,
          name: p.robber.name,
          color: p.robber.color,
          ink: p.robber.ink,
          gang: p.robber.gang,
          bag: track.outcome === 'caught' && ms >= len ? undefined : p.bag,
          me: true,
        }),
      ];
      if (ms < len) stepPatrol(r.sirens, at.me, Math.min(0.1, (now - last) / 1000), rnd);
      last = now;
      const home = placeOf(p.home)?.door;
      r.places = p.places;
      r.follow(at.me.x, at.me.y);
      r.draw(people, now, {
        jailed: [],
        goal: home && ms < len ? { x: home.x, y: home.y, from: at.me } : null,
      });
      const s = Math.ceil((len - ms) / 1000);
      if (s !== shown) {
        shown = s;
        setLeft(s);
      }
      if (ms < len) {
        // The siren is as loud as the nearest police (a car or an officer on foot) is close.
        const near = Math.min(
          ...r.sirens.map((c) => Math.hypot(c.x - at.me.x, c.y - at.me.y)),
          ...at.cops.map((k) => Math.hypot(k.x - at.me.x, k.y - at.me.y)),
        );
        sound.policeLevel(Math.max(0.15, 1 - near / 14));
      } else if (!ended) {
        ended = true;
        sound.policeOff();
        if (track.outcome === 'home') sound.escaped();
        else sound.busted();
      }
      if (ms >= len) setOver(true);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      sound.policeOff();
    };
  }, [track, run]);

  const home = track.outcome === 'home';
  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={cv} className="block" />
      <div className="glass pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] font-semibold tabular-nums text-white">
        Run home · {money(props.bag)}
        {!over && left > 0 ? ` · ${left}s` : ''}
      </div>
      {over && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b0918]/60 p-4">
          <div className="glass-strong w-full max-w-[340px] animate-[glass-in_420ms_cubic-bezier(.2,.9,.3,1)] rounded-[30px] p-6 text-center text-white">
            <div
              className={cn(
                'mx-auto inline-block -rotate-3 rounded-[8px] border-[3px] px-4 pb-1 pt-2 font-display text-[33px] leading-none',
                home ? 'border-cash text-cash' : 'border-jail text-jail',
              )}
            >
              {home ? 'Home free' : 'Caught'}
            </div>
            {!home && props.catcher ? (
              <div className="mt-4 flex items-center justify-center gap-3">
                <img
                  src={chogImage(props.catcher.id, 256)}
                  alt=""
                  className="h-14 w-14 rounded-[10px] object-cover"
                />
                <p className="text-left text-[15px] leading-snug">
                  <strong className="block">{props.catcher.name}</strong>
                  took the bag back
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[15px] leading-snug">
                {home
                  ? `${props.robber.name} carried ${money(props.bag)} home.`
                  : track.who === 'time'
                    ? 'Time ran out before the bag got home.'
                    : 'The police made the catch on the way home.'}
              </p>
            )}
            <button onClick={() => setRun((n) => n + 1)} className="btn press btn-primary mt-5 w-full">
              <ArrowClockwise size={20} weight="bold" />
              <span className="pt-1">Watch again</span>
            </button>
            <button
              onClick={props.onVault}
              className="mt-3 text-[14px] font-semibold underline underline-offset-2"
            >
              Back to the vault
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
