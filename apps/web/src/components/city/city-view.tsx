'use client';
import type { GangId } from '@chog-city/data';
import {
  CITY,
  Ground,
  WALK_SPEED,
  doorAt,
  groundAt,
  inPen,
  newWalker,
  placeOf,
  rng,
  route,
  slide,
  slideInPen,
  smooth,
  standable,
  stepWalker,
  type Place,
  type Walker,
} from '@chog-city/game/city';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GANG_COLOR } from '@/lib/theme';
import { CityRenderer, type Board, type Emote, type Person, type PlaceLook } from './city-render';
import { LiveCity, type Chase, type ChaseEnd, type LiveStatus } from './live-city';

export interface Me {
  chog: number | null;
  name: string;
  color: string;
  ink: string;
  /** In jail until (ms): you walk round the jail yard until then. */
  jail: number | null;
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
  /** Put your Chog at a place's door (coming back from a heist). */
  appearAt(placeId: string): void;
  /** Out of a vault with a bag: start the getaway home. */
  run(pass: string): void;
  /** Keep walking after someone (a robber running from your vault), or stop (null). */
  chaseAfter(id: number | null): void;
}

interface Props {
  me: Me;
  /** Used until the live server answers (and if it can't be reached). */
  strollers: Stroller[];
  jailed: Jailed[];
  places: Record<string, PlaceLook>;
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
    emote: null as { kind: Emote; at: number } | null,
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
        const sp = (WALK_SPEED * dt * Math.min(1, len)) / len;
        const n = (jailed ? slideInPen : slide)(s.x, s.y, vx * sp, vy * sp);
        s.moving = n.x !== s.x || n.y !== s.y;
        s.x = n.x;
        s.y = n.y;
        if (Math.abs(vx) > 0.1) s.face = vx < 0 ? -1 : 1;
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
        if (door) s.intent = null;
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
            bag: bags.get(o.id),
            emote: o.emote,
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
        bag: mine?.bag,
        emote: s.emote ?? undefined,
      });
      s.drawn = people;
      const home = mine ? placeOf(mine.home) : undefined;

      r.places = p.places;
      r.board = p.board;
      r.follow(s.x, s.y);
      r.draw(people, now, {
        jailed: [],
        target: s.target,
        door,
        goal: home ? { x: home.door.x, y: home.door.y, from: { x: s.x, y: s.y } } : null,
      });

      if (now - miniAt > 120) {
        miniAt = now;
        lastAt.x = s.x;
        lastAt.y = s.y;
        lastAt.people = people;
        const layer = drawMap(s.x, s.y, people, p.places, now, home?.door);
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
  function onMap(e: React.PointerEvent<HTMLCanvasElement>) {
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
          className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]"
          onPointerDown={(e) => e.target === e.currentTarget && props.onCloseMap()}
        >
          <canvas
            ref={bigRef}
            onPointerDown={onMap}
            aria-label="Map of the city. Tap a spot to walk there."
            className="max-h-full w-full max-w-[920px] cursor-pointer rounded-[22px] border-[3px] border-ink shadow-[0_6px_0_0_#000]"
            style={{ aspectRatio: `${CITY.w} / ${CITY.h}` }}
          />
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
        tap: { chog: j.id, name: j.name, gang: j.gang, player: false },
      };
    });
}

const MAP_GROUND: Record<number, string> = {
  [Ground.Road]: '#17142a',
  [Ground.Cross]: '#17142a',
  [Ground.Walk]: '#3a3456',
  [Ground.Prop]: '#3a3456',
  [Ground.Yard]: '#3d3358',
  [Ground.Grass]: '#25573f',
  [Ground.Plaza]: '#4a4170',
  [Ground.Pen]: '#45455a',
  [Ground.Block]: '#3a3456',
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
  const lw = Math.max(1.5, k * 0.25);
  for (const p of CITY.places) {
    const look = places[p.id];
    const c = p.kind === 'jail' ? '#77778c' : p.kind === 'training' ? '#4fbf98' : (look?.color ?? '#555');
    g.fillStyle = c;
    g.strokeStyle = '#0d0b1a';
    g.lineWidth = lw;
    g.beginPath();
    g.roundRect(p.x * k, p.y * k, p.w * k, p.h * k, k * 0.8);
    g.fill();
    g.stroke();
    if (look?.mine) {
      g.strokeStyle = '#ffd23f';
      g.lineWidth = lw * 1.6;
      g.beginPath();
      g.roundRect(p.x * k + lw, p.y * k + lw, p.w * k - lw * 2, p.h * k - lw * 2, k * 0.6);
      g.stroke();
    }
    if (look?.alarm && Math.floor(now / 300) % 2 === 0) {
      g.strokeStyle = '#ff2d55';
      g.lineWidth = lw * 2;
      g.beginPath();
      g.roundRect(p.x * k - lw, p.y * k - lw, p.w * k + lw * 2, p.h * k + lw * 2, k);
      g.stroke();
    }
  }
  const flash = Math.floor(now / 250) % 2 === 0;
  for (const p of people) {
    if (p.me) continue;
    // Police flash red and blue; anyone with a bag is a big red dot.
    g.fillStyle = p.cop
      ? flash
        ? '#ff2d55'
        : '#3c82ff'
      : p.bag
        ? '#ff2d55'
        : p.npc
          ? 'rgba(255,255,255,0.55)'
          : '#ffffff';
    g.beginPath();
    g.arc(
      p.x * k,
      p.y * k,
      Math.max(1.5, k * (p.cop ? 0.55 : p.bag ? 0.75 : p.npc ? 0.3 : 0.42)),
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  if (goal) {
    g.strokeStyle = '#ffd23f';
    g.lineWidth = Math.max(2, k * 0.35);
    g.beginPath();
    g.arc(goal.x * k, goal.y * k, Math.max(5, k * (flash ? 1.6 : 1.2)), 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#0d0b1a';
  g.lineWidth = Math.max(2, k * 0.3);
  g.beginPath();
  g.arc(x * k, y * k, Math.max(4, k * 0.9), 0, Math.PI * 2);
  g.fill();
  g.stroke();
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
  for (const p of CITY.places) {
    const look = places[p.id];
    const name = p.kind === 'jail' ? 'Jail' : p.kind === 'training' ? 'Practice vault' : (look?.name ?? '');
    const size = Math.round(k * 1.5);
    g.font = `${size}px ${font}`;
    const cx = (p.x + p.w / 2) * k;
    const cy = (p.y + p.h / 2) * k;
    const words = name.toUpperCase().split(' ');
    const lines =
      words.length > 1 && g.measureText(name.toUpperCase()).width > p.w * k * 0.9
        ? words
        : [name.toUpperCase()];
    g.fillStyle = p.kind === 'gang' ? (look?.ink ?? '#fff') : '#0d0b1a';
    lines.forEach((l, i) =>
      g.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * size * 1.05, p.w * k * 0.92),
    );
    if (look && p.kind === 'gang') {
      g.font = `${Math.round(size * 0.8)}px ${font}`;
      g.fillText(`#${look.rank}`, cx, (p.y + 1.2) * k);
    }
  }
}

const lastAt = { x: 0, y: 0, people: [] as Person[] };
