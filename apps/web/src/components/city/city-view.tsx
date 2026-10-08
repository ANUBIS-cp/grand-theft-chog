'use client';
import { GANGS, type GangId } from '@chog-city/data';
import {
  CITY,
  Ground,
  WALK_SPEED,
  doorAt,
  groundAt,
  newWalker,
  placeOf,
  rng,
  route,
  slide,
  smooth,
  standable,
  stepWalker,
  type Place,
  type Walker,
} from '@chog-city/game/city';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { GANG_COLOR } from '@/lib/theme';
import { CityRenderer, type Board, type Emote, type Person, type PlaceLook } from './city-render';

export interface Me {
  chog: number | null;
  name: string;
  color: string;
  ink: string;
}

export interface Stroller {
  id: number;
  name: string;
  gang: GangId;
}

export interface Jailed extends Stroller {
  until: number;
}

export interface CityHandle {
  /** Walk to a place's door. */
  walkTo(placeId: string): void;
  emote(kind: Emote): void;
  /** Put your Chog at a place's door (coming back from a heist). */
  appearAt(placeId: string): void;
}

interface Props {
  me: Me;
  strollers: Stroller[];
  jailed: Jailed[];
  places: Record<string, PlaceLook>;
  board: Board;
  /** Keys and taps do nothing while a card or the heist is open over the city. */
  paused: boolean;
  onDoor: (p: Place | null) => void;
  onPerson: (chog: number) => void;
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

const color = (gang: GangId) => GANG_COLOR[gang];

export const CityView = forwardRef<CityHandle, Props>(function CityView(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
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
    walkers: new Map<number, Walker>(),
    rand: rng(Date.now() & 0xffff),
    r: null as CityRenderer | null,
  });

  useImperativeHandle(ref, () => ({
    walkTo(id) {
      const p = placeOf(id);
      if (p) goTo(p.door.x, p.door.y);
    },
    emote(kind) {
      state.current.emote = { kind, at: performance.now() };
    },
    appearAt(id) {
      const p = placeOf(id);
      if (!p) return;
      const s = state.current;
      s.x = p.door.x;
      s.y = p.door.y + 0.6;
      s.path = [];
      s.target = null;
      s.r?.follow(s.x, s.y, true);
    },
  }));

  function goTo(x: number, y: number) {
    const s = state.current;
    const r = route(s.x, s.y, x, y);
    if (!r) return;
    s.path = smooth(s, r);
    // End exactly on the spot asked for when it's free (doors sit between two tiles).
    if (standable(x, y)) s.path.push({ x, y });
    s.target = { x, y };
  }

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
        const n = slide(s.x, s.y, vx * sp, vy * sp);
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

      const door = doorAt(s.x, s.y) ?? null;
      if (door !== s.door) {
        s.door = door;
        p.onDoor(door);
      }

      // Strollers.
      for (const c of p.strollers) {
        let w = s.walkers.get(c.id);
        if (!w) {
          w = newWalker(s.rand);
          s.walkers.set(c.id, w);
        }
        stepWalker(w, dt, s.rand);
      }

      const people: Person[] = p.strollers.map((c) => {
        const w = s.walkers.get(c.id)!;
        return {
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
        };
      });
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
        emote: s.emote ?? undefined,
      });

      r.places = p.places;
      r.board = p.board;
      r.follow(s.x, s.y);
      r.draw(people, now, { jailed: jailedPeople(p.jailed, now), target: s.target, door });

      if (now - miniAt > 120) {
        miniAt = now;
        drawMini(miniRef.current, s.x, s.y, people, p.places, now);
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
    // A Chog under your finger (their head sits above their feet).
    for (const c of live.current.strollers) {
      const wk = state.current.walkers.get(c.id);
      if (wk && Math.abs(wk.x - w.x) < 0.5 && w.y > wk.y - 1.5 && w.y < wk.y + 0.3)
        return live.current.onPerson(c.id);
    }
    for (const j of jailedPeople(live.current.jailed, performance.now()))
      if (j.chog && Math.abs(j.x - w.x) < 0.5 && w.y > j.y - 1.5 && w.y < j.y + 0.3)
        return live.current.onPerson(j.chog);
    const place = CITY.places.find(
      (pl) => w.x >= pl.x && w.x < pl.x + pl.w && w.y >= pl.y - 0.7 && w.y < pl.y + pl.h,
    );
    if (place) return goTo(place.door.x, place.door.y);
    if (groundAt(Math.floor(w.x), Math.floor(w.y)) === Ground.Pen)
      return goTo(placeOf('jail')!.door.x, placeOf('jail')!.door.y);
    goTo(w.x, w.y);
  }

  function onMini(e: React.PointerEvent<HTMLCanvasElement>) {
    if (live.current.paused) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * CITY.w;
    const y = ((e.clientY - box.top) / box.height) * CITY.h;
    const place = CITY.places.find(
      (pl) => x >= pl.x - 1 && x < pl.x + pl.w + 1 && y >= pl.y - 1 && y < pl.y + pl.h + 3,
    );
    if (place) goTo(place.door.x, place.door.y);
    else goTo(x, y);
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
      <canvas
        ref={miniRef}
        onPointerDown={onMini}
        aria-label="Map of the city. Tap a spot to walk there."
        className="absolute bottom-3 right-3 z-10 w-[132px] cursor-pointer rounded-[10px] border-2 border-ink shadow-[3px_3px_0_0_#000] sm:w-[188px]"
        style={{ aspectRatio: `${CITY.w} / ${CITY.h}` }}
      />
    </div>
  );
});

/** Jailed Chogs stand in rows in the jail yard, shuffling a little. */
function jailedPeople(list: Jailed[], now: number): Person[] {
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
      };
    });
}

const MINI: Record<number, string> = {
  [Ground.Road]: '#1b1828',
  [Ground.Cross]: '#1b1828',
  [Ground.Walk]: '#2f2a47',
  [Ground.Prop]: '#2f2a47',
  [Ground.Yard]: '#352c49',
  [Ground.Grass]: '#1d4434',
  [Ground.Plaza]: '#3a3258',
  [Ground.Pen]: '#3a3a44',
  [Ground.Block]: '#2f2a47',
};

let miniBase: HTMLCanvasElement | null = null;

function drawMini(
  cv: HTMLCanvasElement | null,
  x: number,
  y: number,
  people: Person[],
  places: Record<string, PlaceLook>,
  now: number,
) {
  if (!cv) return;
  const k = 4;
  if (cv.width !== CITY.w * k) {
    cv.width = CITY.w * k;
    cv.height = CITY.h * k;
  }
  const g = cv.getContext('2d')!;
  if (!miniBase) {
    miniBase = document.createElement('canvas');
    miniBase.width = CITY.w * k;
    miniBase.height = CITY.h * k;
    const b = miniBase.getContext('2d')!;
    for (let j = 0; j < CITY.h; j++)
      for (let i = 0; i < CITY.w; i++) {
        b.fillStyle = MINI[CITY.ground[j * CITY.w + i]!] ?? '#000';
        b.fillRect(i * k, j * k, k, k);
      }
  }
  g.drawImage(miniBase, 0, 0);
  for (const p of CITY.places) {
    const look = places[p.id];
    const c = p.kind === 'jail' ? '#6a6a7a' : p.kind === 'training' ? '#3f8f75' : (look?.color ?? '#555');
    g.fillStyle = c;
    g.fillRect(p.x * k, p.y * k, p.w * k, p.h * k);
    if (look?.mine) {
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 3;
      g.strokeRect(p.x * k + 1.5, p.y * k + 1.5, p.w * k - 3, p.h * k - 3);
    }
    if (look?.alarm && Math.floor(now / 300) % 2 === 0) {
      g.strokeStyle = '#ff2d55';
      g.lineWidth = 4;
      g.strokeRect(p.x * k, p.y * k, p.w * k, p.h * k);
    }
  }
  for (const p of people) {
    if (p.me) continue;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(p.x * k - 1.5, p.y * k - 1.5, 3, 3);
  }
  g.fillStyle = '#ffd23f';
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x * k, y * k, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

export const gangLook = (gang: GangId) => ({
  name: GANGS[gang].name,
  color: GANG_COLOR[gang].bg,
  ink: GANG_COLOR[gang].fg,
});
