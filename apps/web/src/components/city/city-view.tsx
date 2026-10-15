'use client';
import type { GangId } from '@chog-city/data';
import {
  CITY,
  Ground,
  HEAD_START,
  WALK_SPEED,
  doorAt,
  getawayTime,
  groundAt,
  inPen,
  newWalker,
  placeOf,
  rng,
  route,
  seeded,
  slide,
  slideInPen,
  smooth,
  spawnCops,
  standable,
  stepCops,
  stepWalker,
  type Cop,
  type Place,
  type Walker,
} from '@chog-city/game/city';
import { X } from '@phosphor-icons/react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GANG_COLOR } from '@/lib/theme';
import { CityArt } from './art';
import { CityRenderer, type Board, type Emote, type Person, type PlaceLook } from './city-render';
import { LiveCity, type Chase, type ChaseEnd, type ChatMsg, type LiveStatus } from './live-city';

export interface Me {
  chog: number | null;
  name: string;
  color: string;
  ink: string;
  /** In jail until (ms): you walk round the jail yard until then. */
  jail: number | null;
  gang?: GangId | null;
}

export interface Stroller {
  id: number;
  name: string;
  gang: GangId;
}

export interface Jailed extends Stroller {
  until: number;
}

/** Someone you tapped on. */
export interface Tapped {
  chog: number;
  name: string;
  gang: GangId | null;
  player: boolean;
}

export interface CityHandle {
  /** Walk to a place's door. */
  walkTo(placeId: string): void;
  emote(kind: Emote): void;
  /** Say something in the city room or your gang's. */
  say(room: 'city' | 'gang', text: string): void;
  /** Put your Chog at a place's door (coming back from a heist). */
  appearAt(placeId: string): void;
  /** Out of a vault with a bag: start the getaway home. */
  run(pass: string): void;
  /** Keep walking after someone (a robber running from your vault), or stop (null). */
  chaseAfter(id: number | null): void;
  /** The practice getaway: out of the training warehouse to `home`, with practice police after you. */
  practiceChase(home: { x: number; y: number }): void;
}

interface Props {
  me: Me;
  /** Used until the live server answers (and if it can't be reached). */
  strollers: Stroller[];
  jailed: Jailed[];
  places: Record<string, PlaceLook>;
  /** Chogs with a Wanted poster on them ($CHOG). */
  wanted?: number[];
  /** Covered by a robbery: keep moving and connected, but don't draw. */
  hidden?: boolean;
  board: Board;
  /** Keys and taps do nothing while a card or the heist is open over the city. */
  paused: boolean;
  /** At a door (or left it). `asked` is true when you tapped the building or picked it, so its card opens. */
  onDoor: (p: Place | null, asked: boolean) => void;
  /** Which part of the city you're in: a place id, 'plaza' or 'street'. */
  onArea: (area: string) => void;
  /** The big map is open. */
  mapOpen: boolean;
  onCloseMap: () => void;
  onPerson: (p: Tapped) => void;
  onLive: (status: LiveStatus, online: number) => void;
  /** The getaways running in the city changed. */
  onChase?: (chases: Chase[]) => void;
  onChaseEnd?: (e: ChaseEnd) => void;
  /** The chat: every message so far, the new one (if any) and why yours was refused (if it was). */
  onChat?: (all: ChatMsg[], fresh: ChatMsg | null, refused?: string) => void;
  /** The practice getaway ended (nothing real moves). */
  onPracticeEnd?: (outcome: 'home' | 'caught' | 'time') => void;
}

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

const GUEST = { bg: '#8d89a6', fg: '#111111' };
const POLICE = { bg: '#2b59ff', fg: '#ffffff' };
const color = (gang: GangId | null) => (gang ? GANG_COLOR[gang] : GUEST);

export const CityView = forwardRef<CityHandle, Props>(function CityView(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const bigWrap = useRef<HTMLDivElement>(null);
  // Opening the map on a phone (where it's wider than the screen): start scrolled to where you are.
  useEffect(() => {
    if (!props.mapOpen) return;
    requestAnimationFrame(() => {
      const w = bigWrap.current;
      const s = state.current;
      if (!w || w.scrollWidth <= w.clientWidth) return;
      w.scrollLeft = (s.x / CITY.w) * w.scrollWidth - w.clientWidth / 2;
      w.scrollTop = (s.y / CITY.h) * w.scrollHeight - w.clientHeight / 2;
    });
  }, [props.mapOpen]);
  const live = useRef(props);
  live.current = props;
  const state = useRef({
    x: CITY.spawn.x,
    y: CITY.spawn.y,
    face: 1 as -1 | 1,
    moving: false,
    path: [] as { x: number; y: number }[],
    target: null as { x: number; y: number } | null,
    keys: new Set<string>(),
    stick: null as { x: number; y: number } | null,
    /** Getting up to speed (0..1) and the way you were last going, so starts and stops have weight. */
    ramp: 0,
    dir: { x: 0, y: 0 },
    /** Where the camera looks ahead of you, in tiles. */
    look: { x: 0, y: 0 },
    emote: null as { kind: Emote; at: number } | null,
    /** What you last said in the city room, for the bubble over your head. */
    said: null as { text: string; at: number } | null,
    door: null as Place | null,
    /** The place you asked to walk to; its card opens when you get there. */
    intent: null as string | null,
    area: '',
    walkers: new Map<number, Walker>(),
    rand: rng(Date.now() & 0xffff),
    r: null as CityRenderer | null,
    net: null as LiveCity | null,
    /** Everyone drawn last frame, for taps. */
    drawn: [] as (Person & { tap?: Tapped })[],
    /** Someone you're running after (a robber with your gang's cash), and when you last steered at them. */
    after: null as number | null,
    afterAt: 0,
    /** The practice getaway, run here in the browser with the same police as a real one. */
    practice: null as { cops: Cop[]; home: { x: number; y: number }; started: number; until: number } | null,
  });

  const jailedNow = props.me.jail !== null && props.me.jail > Date.now();

  useImperativeHandle(ref, () => ({
    walkTo(id) {
      const p = placeOf(id);
      if (!p) return;
      // Already standing at that door: there's no walk to finish, so open its card now.
      if (state.current.door?.id === p.id) return live.current.onDoor(p, true);
      goTo(p.door.x, p.door.y, p.id);
    },
    emote(kind) {
      state.current.emote = { kind, at: performance.now() };
      state.current.net?.emote(kind);
    },
    say(room, text) {
      state.current.net?.say(room, text);
    },
    appearAt(id) {
      const p = placeOf(id);
      if (!p || inJail()) return;
      const s = state.current;
      s.x = p.door.x;
      s.y = p.door.y + 0.6;
      s.path = [];
      s.target = null;
      s.r?.follow(s.x, s.y, true);
    },
    run(pass) {
      state.current.net?.run(pass);
    },
    chaseAfter(id) {
      state.current.after = id;
      state.current.afterAt = 0;
    },
    practiceChase(home) {
      const from = placeOf('training')!;
      const now = Date.now();
      state.current.practice = {
        cops: spawnCops(from, home, 0, seeded(now), -900_000),
        home,
        started: now,
        until: now + getawayTime(from.door, home),
      };
    },
  }));

  function inJail() {
    const j = live.current.me.jail;
    return j !== null && j > Date.now();
  }

  function goTo(x: number, y: number, intent: string | null = null) {
    const s = state.current;
    s.intent = intent;
    if (inJail()) {
      // In the jail yard you can only shuffle about inside the fence.
      if (inPen(x, y)) {
        s.path = [{ x, y }];
        s.target = { x, y };
      }
      return;
    }
    const r = route(s.x, s.y, x, y);
    if (!r) return;
    s.path = smooth(s, r);
    // End exactly on the spot asked for when it's free (doors sit between two tiles).
    if (standable(x, y)) s.path.push({ x, y });
    s.target = { x, y };
  }

  // Jailed: you start in the jail yard. Let out: you walk out of the gate.
  useEffect(() => {
    const s = state.current;
    const jail = placeOf('jail')!;
    if (jailedNow) {
      s.x = jail.x + 2 + Math.random() * 6;
      s.y = jail.y + jail.h + 1.5;
    } else if (inPen(s.x, s.y)) {
      s.x = jail.door.x;
      s.y = jail.door.y;
    }
    s.path = [];
    s.target = null;
    s.r?.follow(s.x, s.y, true);
  }, [jailedNow]);

  // The live connection: a new one whenever you switch Chog or go in or out of jail (the ticket changes).
  useEffect(() => {
    const s = state.current;
    const net = new LiveCity(props.me.chog, () => ({ x: s.x, y: s.y }), {
      fix: (x, y) => {
        s.x = x;
        s.y = y;
        s.path = [];
        s.target = null;
      },
      status: (st, online) => live.current.onLive(st, online),
      chase: () => live.current.onChase?.([...net.chases.values()]),
      chaseEnd: (e) => {
        if (s.after === e.id) s.after = null;
        live.current.onChaseEnd?.(e);
      },
      chat: (fresh, refused) => live.current.onChat?.(net.chat, fresh, refused),
      said: (text) => {
        s.said = { text, at: performance.now() };
      },
    });
    s.net = net;
    const t = setInterval(() => live.current.onLive(net.status, net.online), 2000);
    return () => {
      clearInterval(t);
      net.stop();
      if (s.net === net) s.net = null;
    };
  }, [props.me.chog, jailedNow]);

  useEffect(() => {
    const cv = canvasRef.current!;
    const s = state.current;
    const r = new CityRenderer(cv, () => {});
    s.r = r;
    const body = getComputedStyle(document.body);
    r.font = body.getPropertyValue('--font-display').trim() || 'Impact, sans-serif';
    r.bodyFont = body.getPropertyValue('--font-sans').trim() || 'Arial, sans-serif';
    const fit = () => {
      const b = cv.parentElement!.getBoundingClientRect();
      r.resize(b.width, b.height);
      r.follow(s.x, s.y, true);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv.parentElement!);
    void document.fonts?.ready.then(fit);

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!KEYS[e.code]) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (down && live.current.paused) return;
      e.preventDefault();
      if (down) {
        s.keys.add(e.code);
        s.path = [];
        s.target = null;
        s.intent = null;
      } else s.keys.delete(e.code);
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => s.keys.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);

    let raf = 0;
    let last = performance.now();
    let miniAt = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = live.current;
      const jailed = p.me.jail !== null && p.me.jail > Date.now();

      // Your Chog.
      let vx = 0;
      let vy = 0;
      if (!p.paused) {
        for (const k of s.keys) {
          vx += KEYS[k]![0];
          vy += KEYS[k]![1];
        }
        if (s.stick) {
          vx = s.stick.x;
          vy = s.stick.y;
        }
      }
      if (vx || vy) {
        const len = Math.hypot(vx, vy);
        // Up to full speed in about a tenth of a second: quick, but you feel the push.
        s.ramp = Math.min(1, s.ramp + dt / 0.12);
        s.dir = { x: vx / len, y: vy / len };
        const sp = (WALK_SPEED * (0.5 + 0.5 * s.ramp) * dt * Math.min(1, len)) / len;
        const n = (jailed ? slideInPen : slide)(s.x, s.y, vx * sp, vy * sp);
        s.moving = n.x !== s.x || n.y !== s.y;
        s.x = n.x;
        s.y = n.y;
        if (Math.abs(vx) > 0.1) s.face = vx < 0 ? -1 : 1;
      } else if (s.ramp > 0 && !s.path.length) {
        // Let go: a short glide to a stop instead of freezing on the spot.
        s.ramp = Math.max(0, s.ramp - dt / 0.09);
        const sp = WALK_SPEED * 0.55 * s.ramp * dt;
        const n = (jailed ? slideInPen : slide)(s.x, s.y, s.dir.x * sp, s.dir.y * sp);
        s.moving = s.ramp > 0.3 && (n.x !== s.x || n.y !== s.y);
        s.x = n.x;
        s.y = n.y;
      } else if (s.path.length && !p.paused) {
        let left = WALK_SPEED * dt;
        while (left > 0 && s.path.length) {
          const to = s.path[0]!;
          const dx = to.x - s.x;
          const dy = to.y - s.y;
          const d = Math.hypot(dx, dy);
          if (Math.abs(dx) > 0.05) s.face = dx < 0 ? -1 : 1;
          if (d <= left) {
            s.x = to.x;
            s.y = to.y;
            s.path.shift();
            left -= d;
          } else {
            s.x += (dx / d) * left;
            s.y += (dy / d) * left;
            left = 0;
          }
        }
        s.moving = true;
        if (!s.path.length) s.target = null;
      } else s.moving = false;

      const door = jailed ? null : (doorAt(s.x, s.y) ?? null);
      if (door !== s.door) {
        s.door = door;
        p.onDoor(door, !!door && s.intent === door.id);
        // Passing someone else's door on the way doesn't count: only arriving at the one you asked for.
        if (door && s.intent === door.id) s.intent = null;
      }
      const area = areaAt(s.x, s.y);
      if (area !== s.area) {
        s.area = area;
        p.onArea(area);
      }

      const net = s.net;
      net?.move(s.x, s.y, s.face, s.moving, now);
      // A stroller who's in jail stands in the jail yard instead.
      const locked = new Set(p.jailed.filter((j) => j.until > Date.now()).map((j) => j.id));
      const people: (Person & { tap?: Tapped })[] = [];
      const bags = new Map<number, number>();
      let mine: Chase | undefined;
      if (net)
        for (const c of net.chases.values()) {
          bags.set(c.id, c.bag);
          if (c.chog === p.me.chog) mine = c;
        }
      if (net && net.status === 'live') {
        // Everyone else, from the live server.
        for (const o of net.people.values()) {
          if (o.id === net.you || Number.isNaN(o.nx) || now - o.seen > 3000) continue;
          if (o.npc && o.chog !== null && locked.has(o.chog)) continue;
          const at = net.at(o, now);
          const c = o.cop ? POLICE : color(o.gang);
          people.push({
            key: `p${o.id}`,
            chog: o.chog,
            name: o.name,
            color: c.bg,
            ink: c.fg,
            x: at.x,
            y: at.y,
            face: o.face,
            moving: o.moving,
            npc: o.npc && !o.cop,
            cop: o.cop,
            gang: o.gang,
            bag: bags.get(o.id),
            emote: o.emote,
            said: o.said,
            tap:
              o.chog !== null && !o.cop
                ? { chog: o.chog, name: o.name, gang: o.gang, player: !o.npc }
                : undefined,
          });
        }
        // Running after a robber: steer at them a few times a second.
        if (s.after !== null && now - s.afterAt > 300) {
          s.afterAt = now;
          const o = net.people.get(s.after);
          if (o && !Number.isNaN(o.nx)) {
            const at = net.at(o, now);
            goTo(at.x, at.y);
          } else s.after = null;
        }
      } else {
        // Offline: today's strollers, walked here.
        for (const c of p.strollers) {
          if (locked.has(c.id)) continue;
          let w = s.walkers.get(c.id);
          if (!w) {
            w = newWalker(s.rand);
            s.walkers.set(c.id, w);
          }
          stepWalker(w, dt, s.rand);
          people.push({
            key: `npc${c.id}`,
            chog: c.id,
            name: c.name,
            color: color(c.gang).bg,
            ink: color(c.gang).fg,
            x: w.x,
            y: w.y,
            face: w.face,
            moving: w.moving,
            npc: true,
            gang: c.gang,
            tap: { chog: c.id, name: c.name, gang: c.gang, player: false },
          });
        }
      }
      // Jailed Chogs nobody is playing stand in the yard.
      const here = new Set(people.map((x) => x.chog));
      if (p.me.chog !== null) here.add(p.me.chog);
      const yard = jailedPeople(
        p.jailed.filter((j) => !here.has(j.id)),
        now,
      );
      people.push(...yard);
      people.push({
        key: 'me',
        chog: p.me.chog,
        name: p.me.name,
        color: p.me.color,
        ink: p.me.ink,
        x: s.x,
        y: s.y,
        face: s.face,
        moving: s.moving,
        me: true,
        gang: p.me.gang,
        bag: mine?.bag,
        emote: s.emote ?? undefined,
        said: s.said ?? undefined,
      });
      if (p.wanted?.length) {
        const wanted = new Set(p.wanted);
        for (const x of people) if (x.chog !== null && !x.cop && wanted.has(x.chog)) x.wanted = true;
      }
      // The practice getaway: step its police, and end it at the goal, on a catch or when time's up.
      const pr = s.practice;
      if (pr) {
        const t = Date.now();
        let end: 'home' | 'caught' | 'time' | null = null;
        if (Math.hypot(s.x - pr.home.x, s.y - pr.home.y) < 1.4) end = 'home';
        else if (t > pr.until) end = 'time';
        else if (t - pr.started > HEAD_START * 1000 && !p.paused && stepCops(pr.cops, s, pr.home, dt))
          end = 'caught';
        for (const k of pr.cops)
          people.push({
            key: `cop${k.id}`,
            chog: k.chog,
            name: 'Police',
            color: POLICE.bg,
            ink: POLICE.fg,
            x: k.x,
            y: k.y,
            face: k.face,
            moving: k.moving,
            cop: true,
          });
        if (end) {
          s.practice = null;
          p.onPracticeEnd?.(end);
        }
      }
      s.drawn = people;
      const home = mine ? placeOf(mine.home)?.door : pr ? pr.home : undefined;

      r.places = p.places;
      r.board = p.board;
      // The camera leads you a little in the way you're going, so you see what's coming.
      const lead = s.moving ? 1.6 : 0;
      const ldx = s.path.length ? s.path[0]!.x - s.x : s.dir.x;
      const ldy = s.path.length ? s.path[0]!.y - s.y : s.dir.y;
      const ll = Math.hypot(ldx, ldy) || 1;
      s.look.x += ((ldx / ll) * lead - s.look.x) * Math.min(1, dt * 2.5);
      s.look.y += ((ldy / ll) * lead - s.look.y) * Math.min(1, dt * 2.5);
      r.follow(s.x + s.look.x, s.y + s.look.y);
      if (!p.hidden)
        r.draw(people, now, {
          jailed: [],
          target: s.target,
          door,
          goal: home ? { x: home.x, y: home.y, from: { x: s.x, y: s.y } } : null,
        });

      if (!p.hidden && now - miniAt > 120) {
        miniAt = now;
        lastAt.x = s.x;
        lastAt.y = s.y;
        lastAt.people = people;
        const layer = drawMap(s.x, s.y, people, p.places, now, home);
        drawLocal(miniCanvas(), layer, s.x, s.y);
        if (p.mapOpen) drawBig(bigRef.current, layer, p.places, r.font, now);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Pointer: a tap walks you there (or to a building's door); press and drag steers like a joystick.
  const press = useRef<{ x: number; y: number; id: number; dragged: boolean } | null>(null);
  function onDown(e: React.PointerEvent) {
    if (live.current.paused) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragged: false };
  }
  function onMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 14) {
      p.dragged = true;
      state.current.path = [];
      state.current.target = null;
      state.current.stick = { x: dx / Math.max(d, 50), y: dy / Math.max(d, 50) };
    }
  }
  function onUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    state.current.stick = null;
    if (!p || p.dragged || live.current.paused) return;
    const r = state.current.r;
    if (!r) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const w = r.toWorld(e.clientX - box.left, e.clientY - box.top);
    // A Chog under your finger (their head sits above their feet). Nearest first.
    const hit = state.current.drawn
      .filter((c) => c.tap && Math.abs(c.x - w.x) < 0.5 && w.y > c.y - 1.5 && w.y < c.y + 0.3)
      .sort((a, b) => Math.abs(a.x - w.x) - Math.abs(b.x - w.x))[0];
    if (hit?.tap) return live.current.onPerson(hit.tap);
    if (inJail()) return goTo(w.x, w.y);
    const place = CITY.places.find(
      (pl) => w.x >= pl.x && w.x < pl.x + pl.w && w.y >= pl.y - 0.7 && w.y < pl.y + pl.h,
    );
    if (place) return goTo(place.door.x, place.door.y, place.id);
    if (groundAt(Math.floor(w.x), Math.floor(w.y)) === Ground.Pen)
      return goTo(placeOf('jail')!.door.x, placeOf('jail')!.door.y, 'jail');
    goTo(w.x, w.y);
  }

  /** A tap on the big map walks you there (to the door, for a building). */
  function onMap(e: React.MouseEvent<HTMLCanvasElement>) {
    if (inJail()) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * CITY.w;
    const y = ((e.clientY - box.top) / box.height) * CITY.h;
    const place = CITY.places.find(
      (pl) => x >= pl.x - 1 && x < pl.x + pl.w + 1 && y >= pl.y - 1 && y < pl.y + pl.h + 3,
    );
    if (place) goTo(place.door.x, place.door.y, place.id);
    else goTo(x, y);
    live.current.onCloseMap();
  }

  return (
    <div className="absolute inset-0 touch-none select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {props.mapOpen && (
        <div
          className="absolute inset-0 z-30 grid animate-[fade-in_200ms] place-items-center bg-black/55 p-3 backdrop-blur-[6px] sm:p-6"
          onPointerDown={(e) => e.target === e.currentTarget && props.onCloseMap()}
        >
          <div
            className="glass-strong flex max-h-full animate-[glass-in_380ms_cubic-bezier(.2,.9,.3,1)] flex-col overflow-hidden rounded-[28px] text-white"
            style={{
              width: `min(860px, 100%, calc((100dvh - 150px) * ${(CITY.w / CITY.h).toFixed(4)} + 24px))`,
            }}
          >
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <h2 className="font-display text-[24px] leading-none">Chog World</h2>
                <p className="mt-1 text-[13px] text-label-2">Tap anywhere to walk there.</p>
              </div>
              <div className="hidden items-center gap-3 text-[12px] font-medium text-label-2 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sys-pink ring-2 ring-white" /> You
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/80 ring-2 ring-white" /> Players
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sys-red" /> Getaway
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sys-blue" /> Police
                </span>
              </div>
              <button
                onClick={props.onCloseMap}
                aria-label="Close the map"
                className="press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill text-label-2 hover:text-white"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <div ref={bigWrap} className="min-h-0 overflow-auto overscroll-contain px-3 pb-3">
              <canvas
                ref={bigRef}
                onClick={onMap}
                aria-label="Map of the city. Tap a spot to walk there."
                className="block w-full cursor-pointer rounded-[20px]"
                style={{ aspectRatio: `${CITY.w} / ${CITY.h}` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

/** Jailed Chogs stand in rows in the jail yard, shuffling a little. */
function jailedPeople(list: Jailed[], now: number): (Person & { tap?: Tapped })[] {
  const jail = placeOf('jail')!;
  return list
    .filter((j) => j.until > Date.now())
    .slice(0, 27)
    .map((j, i) => {
      const col = i % 9;
      const row = Math.floor(i / 9);
      const sway = Math.sin(now / 1700 + i * 1.3) * 0.15;
      return {
        key: `jail${j.id}`,
        chog: j.id,
        name: j.name,
        color: color(j.gang).bg,
        ink: color(j.gang).fg,
        x: jail.x + 1 + col + sway,
        y: jail.y + jail.h + 0.8 + row * 0.9,
        face: (i % 2 ? -1 : 1) as -1 | 1,
        moving: false,
        npc: true,
        gang: j.gang,
        tap: { chog: j.id, name: j.name, gang: j.gang, player: false },
      };
    });
}

const MAP_GROUND: Record<number, string> = {
  [Ground.Road]: '#16151f',
  [Ground.Cross]: '#1d1c28',
  [Ground.Walk]: '#2a2937',
  [Ground.Prop]: '#2a2937',
  [Ground.Yard]: '#2f2a3d',
  [Ground.Grass]: '#1d3a2d',
  [Ground.Plaza]: '#363149',
  [Ground.Pen]: '#363645',
  [Ground.Block]: '#2a2937',
};

/** The buildings' pictures, for the maps. */
let mapArt: CityArt | null = null;
const artFor = (p: Place) => {
  mapArt ??= new CityArt(() => {});
  return mapArt.get(p.kind === 'gang' ? `gang-${p.id}` : p.kind === 'jail' ? 'jail' : 'practice');
};

/** Which part of the city (x, y) is in: a place id when you're at or beside it, else 'plaza' or 'street'. */
export function areaAt(x: number, y: number): string {
  for (const p of CITY.places)
    if (x >= p.x - 1 && x <= p.x + p.w + 1 && y >= p.y - 1 && y <= p.y + p.h + (p.kind === 'jail' ? 5 : 2))
      return p.id;
  const g = groundAt(Math.floor(x), Math.floor(y));
  return g === Ground.Plaza || g === Ground.Grass ? 'plaza' : 'street';
}

const bases = new Map<number, HTMLCanvasElement>();

function mapBase(k: number) {
  let b = bases.get(k);
  if (b) return b;
  b = document.createElement('canvas');
  b.width = Math.ceil(CITY.w * k);
  b.height = Math.ceil(CITY.h * k);
  const g = b.getContext('2d')!;
  for (let j = 0; j < CITY.h; j++)
    for (let i = 0; i < CITY.w; i++) {
      g.fillStyle = MAP_GROUND[CITY.ground[j * CITY.w + i]!] ?? '#000';
      g.fillRect(Math.floor(i * k), Math.floor(j * k), Math.ceil(k), Math.ceil(k));
    }
  bases.set(k, b);
  return b;
}

/** Paints the whole city at k px per tile: ground, buildings in their gang's colour, and everyone. */
function paintMap(
  g: CanvasRenderingContext2D,
  k: number,
  x: number,
  y: number,
  people: Person[],
  places: Record<string, PlaceLook>,
  now: number,
  goal?: { x: number; y: number },
) {
  g.drawImage(mapBase(k), 0, 0);
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  for (const p of CITY.places) {
    const look = places[p.id];
    const c = p.kind === 'jail' ? '#6e6e86' : p.kind === 'training' ? '#34c79a' : (look?.color ?? '#555');
    const bx = p.x * k;
    const by = p.y * k;
    const bw = p.w * k;
    const bh = p.h * k;
    // A soft tinted plot in the gang's colour, then the building's own picture on it.
    g.save();
    g.globalAlpha = 0.32;
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(bx - k * 0.3, by - k * 0.3, bw + k * 0.6, bh + k * 3.3, k * 1.1);
    g.fill();
    g.restore();
    const art = artFor(p);
    if (art) {
      const s = Math.min((bw + k * 0.4) / art.naturalWidth, (bh + k * 2.4) / art.naturalHeight);
      const w = art.naturalWidth * s;
      const h = art.naturalHeight * s;
      g.drawImage(art, bx + (bw - w) / 2, by + bh + k * 0.6 - h, w, h);
    } else {
      g.fillStyle = c;
      g.beginPath();
      g.roundRect(bx, by, bw, bh, k * 0.8);
      g.fill();
    }
    if (look?.mine) {
      g.strokeStyle = '#ff2d6a';
      g.lineWidth = Math.max(2, k * 0.35);
      g.beginPath();
      g.roundRect(bx - k * 0.3, by - k * 0.3, bw + k * 0.6, bh + k * 3.3, k * 1.1);
      g.stroke();
    }
    if (look?.alarm) {
      g.strokeStyle = `rgba(255,69,58,${0.4 + pulse * 0.6})`;
      g.lineWidth = Math.max(2, k * 0.5);
      g.beginPath();
      g.roundRect(bx - k * 0.7, by - k * 0.7, bw + k * 1.4, bh + k * 4.1, k * 1.4);
      g.stroke();
    }
  }
  const flash = Math.floor(now / 250) % 2 === 0;
  for (const p of people) {
    if (p.me) continue;
    // Police flash red and blue; anyone with a bag is a big red dot; players have a white ring.
    const r = Math.max(2, k * (p.cop ? 0.55 : p.bag ? 0.8 : p.npc ? 0.32 : 0.5));
    g.fillStyle = p.cop
      ? flash
        ? '#ff453a'
        : '#0a84ff'
      : p.bag
        ? '#ff453a'
        : p.npc
          ? 'rgba(255,255,255,0.4)'
          : p.color;
    g.beginPath();
    g.arc(p.x * k, p.y * k, r, 0, Math.PI * 2);
    g.fill();
    if (!p.npc && !p.cop) {
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1, k * 0.15);
      g.stroke();
    }
  }
  if (goal) {
    g.strokeStyle = '#ffd60a';
    g.lineWidth = Math.max(2, k * 0.35);
    g.beginPath();
    g.arc(goal.x * k, goal.y * k, Math.max(5, k * (1.2 + pulse * 0.5)), 0, Math.PI * 2);
    g.stroke();
  }
  // You: a pink dot with a white ring and a halo breathing round it, like "you are here" on a map.
  g.fillStyle = `rgba(255,45,106,${0.18 + pulse * 0.14})`;
  g.beginPath();
  g.arc(x * k, y * k, Math.max(8, k * (1.6 + pulse * 0.5)), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x * k, y * k, Math.max(5, k * 0.95), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff2d6a';
  g.beginPath();
  g.arc(x * k, y * k, Math.max(3.5, k * 0.68), 0, Math.PI * 2);
  g.fill();
}

const LOCAL_K = 8;
let layer: HTMLCanvasElement | null = null;

/** The city at minimap scale, redrawn a few times a second. */
function drawMap(
  x: number,
  y: number,
  people: Person[],
  places: Record<string, PlaceLook>,
  now: number,
  goal?: { x: number; y: number },
) {
  if (!layer) {
    layer = document.createElement('canvas');
    layer.width = CITY.w * LOCAL_K;
    layer.height = CITY.h * LOCAL_K;
  }
  paintMap(layer.getContext('2d')!, LOCAL_K, x, y, people, places, now, goal);
  return layer;
}

const miniCanvas = () => document.getElementById('city-minimap') as HTMLCanvasElement | null;

/** The round minimap: about 30 tiles round you. */
function drawLocal(cv: HTMLCanvasElement | null, src: HTMLCanvasElement, x: number, y: number) {
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = Math.round(cv.clientWidth * dpr);
  if (!size) return;
  if (cv.width !== size) {
    cv.width = size;
    cv.height = size;
  }
  const g = cv.getContext('2d')!;
  const span = 30 * LOCAL_K;
  g.fillStyle = '#0b0918';
  g.fillRect(0, 0, size, size);
  g.imageSmoothingEnabled = true;
  g.drawImage(src, x * LOCAL_K - span / 2, y * LOCAL_K - span / 2, span, span, 0, 0, size, size);
}

/** The big map, with every building's name on it. */
function drawBig(
  cv: HTMLCanvasElement | null,
  _src: HTMLCanvasElement,
  places: Record<string, PlaceLook>,
  font: string,
  now: number,
) {
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cv.clientWidth * dpr);
  if (!w) return;
  const k = w / CITY.w;
  if (cv.width !== w) {
    cv.width = w;
    cv.height = Math.round(CITY.h * k);
  }
  const g = cv.getContext('2d')!;
  // Redraw at this size from the last frame's people (kept on the layer's paint call).
  paintMap(g, k, lastAt.x, lastAt.y, lastAt.people, places, now);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Names fit their block whatever the screen: on a phone the whole city fits the width, so the word "Gang"
  // is dropped ("Lazoor Gang" reads "Lazoor") and the rank sits in its own little badge.
  const narrow = cv.clientWidth < 600;
  const nameOf = (p: (typeof CITY.places)[number]) => {
    const n = p.kind === 'jail' ? 'Jail' : p.kind === 'training' ? 'Practice' : (places[p.id]?.name ?? '');
    return narrow ? n.replace(/ Gang$/, '') : n;
  };
  // One size for every name: the largest that lets the longest one fit its block (never below 10 CSS px).
  let size = Math.round(Math.max(12 * dpr, k * 1.05));
  const fits = () =>
    CITY.places.every((p) => {
      const look = places[p.id];
      const rank = look && p.kind === 'gang' && !narrow ? `${look.rank}  ` : '';
      return g.measureText(rank + nameOf(p)).width + size * 1.1 <= p.w * k * 1.12;
    });
  g.font = `700 ${size}px ${font}`;
  while (size > 10 * dpr && !fits()) {
    size -= 1;
    g.font = `700 ${size}px ${font}`;
  }
  for (const p of CITY.places) {
    const look = places[p.id];
    const name = nameOf(p);
    const cx = (p.x + p.w / 2) * k;
    const ly = (p.y + p.h + 2.2) * k;
    const room = p.w * k * 1.12;
    g.font = `700 ${size}px ${font}`;
    const rank = look && p.kind === 'gang' ? look.rank : 0;
    const label = rank && !narrow ? `${rank}  ${name}` : name;
    const w = Math.min(room, g.measureText(label).width + size * 1.2);
    const h = size * 1.65;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 8;
    g.fillStyle = look?.mine ? 'rgba(255,45,106,0.95)' : 'rgba(22,20,34,0.86)';
    g.beginPath();
    g.roundRect(cx - w / 2, ly - h / 2, w, h, h / 2);
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.fillText(label, cx, ly + 0.5, w - size * 0.5);
    if (rank && narrow) {
      // The rank as a badge on the block's top-left corner.
      const r = Math.round(9 * dpr);
      const bx = p.x * k + r * 0.6;
      const by = p.y * k + r * 0.6;
      g.fillStyle = rank <= 3 ? '#ffd60a' : 'rgba(22,20,34,0.9)';
      g.beginPath();
      g.arc(bx, by, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rank <= 3 ? '#111111' : '#ffffff';
      g.font = `800 ${Math.round(10 * dpr)}px ${font}`;
      g.fillText(String(rank), bx, by + 0.5);
    }
  }
}

const lastAt = { x: 0, y: 0, people: [] as Person[] };
