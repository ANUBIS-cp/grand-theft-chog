'use client';
import type { SkillId } from '@chog-city/data';
import type { PowerId } from '@chog-city/game/heist';
import {
  DT,
  RUSH,
  RUSH_POWERS,
  TPS,
  decodeRushInputs,
  encodeRushInputs,
  RushTimeline,
  decodeDefender,
  type DefenderInput,
  type DefenderLog,
  laserOn,
  rushMap,
  startRush,
  stepRush,
  type Dir,
  type RushEvent,
  type RushInput,
  type RushRules,
  type RushState,
} from '@chog-city/game/rush';
import { ArrowClockwise, Heart, SpeakerHigh, SpeakerSlash, Star, Vault, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SkillIcon } from '@/components/skill-icons';
import { cn } from '@/lib/cn';
import { chogImage } from '@/lib/images';
import { Fx } from '../heist/fx';
import { Sound } from '../heist/sound';
import type { RaidLink, RaidResult } from './raid-link';
import { powerHint } from './power-fx';
import { stickWay } from './stick';
import { ThumbStick } from './thumb-stick';
import { RushRenderer, rushSnapshot, type RushPrev } from './rush-render';

// Cash Rush on screen: the maze, the controls (keys, a drag stick, buttons), the safe dial, and the cards at
// the start and end. This file runs a practice run on its own; a real raid plugs a live connection in
// through `net` and the live server referees it.

export interface RushChog {
  id: number;
  name: string;
}

export interface RushGameProps {
  mapId: string;
  rules: RushRules;
  player: RushChog & { gang: string | null; powers: PowerId[] };
  guards: RushChog[];
  owner: { name: string; color: string; ink: string };
  /** Practice: a way back to the city. */
  onLeave?: () => void;
  /** Practice: out of the vault, try the getaway through the city next. */
  onGetaway?: () => void;
  /** A live raid on the server: you rob it (defenders can join), defend it, or watch it. */
  link?: RaidLink;
  /** The run's dice (real runs and replays use the run's own, so the server sees the same run). */
  seed?: number;
  /** A real robbery: the key presses go to the server when it ends, and the card offers a way back. */
  real?: {
    myGang: string;
    finish: (inputs: string) => Promise<{ moved: number; jailedUntil: number | null; getawayPass?: string }>;
    /** Back to the city; with a getaway pass when you came out with a bag to carry home. */
    onLeave: (getawayPass?: string) => void;
    replayHref?: string;
  };
  /** Watching a run that already happened. */
  replay?: { inputs: string; moved: number; robbers: string; defenders?: (DefenderLog & { who?: string })[] };
  rescue?: RushChog;
  /** Walk a new player through it step by step. */
  coach?: boolean;
  /** Defending or watching: who's robbing. */
  robber?: RushChog;
}

const ICON: Record<PowerId, SkillId> = {
  hide: 'stealth',
  zap: 'laser',
  sprint: 'runner',
  distract: 'clown',
  hack: 'tech',
  tackle: 'muscle',
  bribe: 'smooth',
  magnet: 'money',
  blink: 'magic',
  scare: 'undead',
  lockpick: 'jailbird',
};

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};
const USE_KEYS = new Set(['Space', 'KeyF', 'Enter']);
/** Powers on Q and E, right by the movement keys (and 1, 2). */
const POWER_KEYS: Record<string, number> = { KeyQ: 0, Digit1: 0, KeyE: 1, Digit2: 1 };
export const POWER_KEY_LABEL = ['Q', 'E'];

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface Hud {
  phase: RushState['phase'];
  started: boolean;
  seconds: number;
  carried: number;
  mult: number;
  hearts: number;
  dialing: boolean;
  safeOpen: boolean;
  safeTaken: number;
  flip: number;
  alarm: number;
  hunt: boolean;
  wait: number[];
  active: number[];
  score: number;
  swept: boolean;
  caughtBy: number | null;
  coins: number;
  combo: boolean;
  flipped: boolean;
  /** A ready power that would help right now (its slot), or -1. */
  hint: number;
}

export function RushGame(props: RushGameProps) {
  const { mapId, rules, player, guards, owner, onLeave, link, real, rescue, coach, seed, replay } = props;
  const script = useMemo(() => (replay ? (decodeRushInputs(replay.inputs) ?? []) : null), [replay]);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const realRef = useRef(real);
  realRef.current = real;
  const seedRef = useRef(seed);
  seedRef.current = seed;
  const [saved, setSaved] = useState<{ moved: number; jailedUntil: number | null; error?: string } | null>(
    null,
  );
  const sentRef = useRef(false);
  const map = useMemo(() => rushMap(mapId)!, [mapId]);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialRef = useRef<SVGGElement>(null);
  const sound = useRef<Sound | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [muted, setMuted] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [joy, setJoy] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const linkRef = useRef(link);
  linkRef.current = link;
  const netRef = linkRef;
  const rulesKey = JSON.stringify(rules);
  const powersKey = player.powers.join(',');
  const guardsKey = guards.map((g) => g.id).join(',');
  const guardsRef = useRef(guards);
  guardsRef.current = guards;
  const powersRef = useRef(player.powers);
  powersRef.current = player.powers;
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const game = useRef<{
    s: RushState;
    prev: RushPrev;
    fx: Fx;
    r: RushRenderer | null;
    started: boolean;
    inputs: RushInput[];
    /** A live raid's rewindable run (the robber's screen). */
    tl: RushTimeline | null;
    snapAt: number;
    tapUntil: number;
    /** Defenders whose own Chog is already on their guard. */
    faces: Set<string>;
    held: Dir[];
    /** The way is coming from the phone's stick (see `stickWay`). */
    stick: boolean;
    tap: { d: Dir; until: number } | null;
    use: boolean;
    power: number;
    endAt: number;
    seenCombo: boolean;
    seenFlip: boolean;
  } | null>(null);

  const fresh = useCallback(() => {
    const s = startRush(
      map,
      rulesRef.current,
      powersRef.current,
      seedRef.current ?? (Math.random() * 2 ** 31) | 0,
    );
    return {
      s,
      prev: rushSnapshot(s),
      fx: new Fx(),
      started: !!scriptRef.current,
      inputs: [] as RushInput[],
      tl: null as RushTimeline | null,
      snapAt: 0,
      tapUntil: 0,
      faces: new Set<string>(),
      held: [] as Dir[],
      stick: false,
      tap: null,
      use: false,
      power: -1,
      endAt: 0,
      seenCombo: false,
      seenFlip: false,
    };
  }, [map, rulesKey, powersKey]);

  const restart = useCallback(() => {
    const g = game.current;
    if (!g || netRef.current || realRef.current) return;
    sound.current?.alarmOff();
    Object.assign(g, fresh());
    setShowEnd(false);
  }, [fresh]);

  useEffect(() => {
    const cv = canvasRef.current;
    const stage = stageRef.current;
    if (!cv || !stage) return;
    sound.current ??= new Sound();
    try {
      const m = localStorage.getItem('heist-muted') === '1';
      sound.current.setMuted(m);
      setMuted(m);
    } catch {}
    const load = (src: string) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      return img;
    };
    const images = {
      player: load(chogImage(player.id, 256)),
      guards: guardsRef.current.map((c) => load(chogImage(c.id, 256))),
    };
    const r = new RushRenderer(cv, map, images, { color: owner.color });
    r.font =
      getComputedStyle(document.body).getPropertyValue('--font-display').trim() || 'Impact, sans-serif';
    const g = { ...fresh(), r };
    game.current = g;
    for (const img of [images.player, ...images.guards]) img.onload = () => r.faceReady();
    const fit = () => {
      const box = stage.getBoundingClientRect();
      r.resize(box.width, box.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    void document.fonts?.ready.then(fit);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let fxAcc = 0;
    let lastKey = '';
    let lastSecond = 0;
    const frame = (now: number) => {
      const st = game.current!;
      const elapsed = Math.min(250, now - last);
      last = now;
      const link = linkRef.current;
      const viewing = link && link.role !== 'rob' && link.status !== 'failed';
      if (viewing) {
        // Defending or watching: draw the server's picture, eased between its last two.
        st.started = true;
        if (link.role === 'defend') {
          link.move(st.held.at(-1) ?? st.tap?.d ?? -1, st.use);
          st.use = false;
          if (st.tap && performance.now() > st.tapUntil) st.tap = null;
        }
        const sn = link.snap;
        if (sn && sn.s !== st.s) {
          st.prev = rushSnapshot(st.s.tick ? st.s : sn.s);
          st.s = sn.s;
          react(st, sn.ev);
          st.snapAt = sn.at;
          if (sn.s.phase !== 'play' && !st.endAt) st.endAt = now + 900;
        }
        acc = Math.min(1, (now - (st.snapAt || now)) / 66) * DT * 1000;
      } else if (st.started && st.s.phase === 'play') {
        const live = !!link && link.status === 'live' && link.role === 'rob';
        if (live) {
          // The run plays here at once; defenders' moves arrive a little late, so rewind and replay to them.
          st.tl ??= new RushTimeline(map, rulesRef.current, powersRef.current, seedRef.current ?? 0);
          const tl = st.tl;
          if (tl.s.tick === 0 && st.s.tick > 0) tl.adopt(st.s);
          if (link.resync) {
            const srv = link.resync.s;
            link.resync = null;
            if (srv.tick > 0 && srv.tick !== tl.s.tick) tl.adopt(srv);
          }
          for (const d of link.defenders.values()) {
            if (!tl.defenders.has(d.name)) tl.join(d);
            const seen = tl.defenders.get(d.name)!.changes.length;
            for (const c of d.changes.slice(seen)) tl.change(d.name, c.k, c.v);
          }
          link.rewindFrom = null;
          const again = tl.catchUp();
          // Only the big moments from replayed steps count again (a catch that now happened).
          react(
            st,
            again.filter((e) => e.t === 'busted' || e.t === 'tag' || e.t === 'escaped'),
          );
          st.s = tl.s;
        }
        acc += elapsed;
        while (acc >= DT * 1000 && st.s.phase === 'play') {
          st.prev = rushSnapshot(st.s);
          const input = readInput(st);
          const k = st.s.tick;
          st.inputs[k] = input;
          let ev;
          if (live && st.tl) {
            link.push(input);
            ev = st.tl.step(input);
            st.s = st.tl.s;
          } else {
            // A replay plays the defenders who were in it, from the step each joined.
            const moves: Record<string, DefenderInput> = {};
            for (const d of replayRef.current?.defenders ?? []) {
              if (k < d.at) continue;
              if (k === d.at && st.s.guards[d.guard]) st.s.guards[d.guard]!.human = d.name;
              moves[d.name] = decodeDefender(d.moves[k - d.at]);
            }
            ev = stepRush(st.s, map, rulesRef.current, input, moves);
          }
          react(st, ev);
          acc -= DT * 1000;
        }
        if (live) link.flush();
      } else acc = 0;
      fxAcc += elapsed;
      while (fxAcc >= 1000 / 60) {
        st.fx.tick();
        fxAcc -= 1000 / 60;
      }
      const humans = new Set(st.s.guards.flatMap((x, i) => (x.human ? [i] : [])));
      // A defender plays as their own Chog.
      if (link)
        for (const d of link.defenders.values())
          if (!st.faces.has(d.name)) {
            st.faces.add(d.name);
            const img = new Image();
            img.decoding = 'async';
            img.src = chogImage(d.chog, 256);
            st.r?.v.setGuardImage(d.guard, img);
            if (d.who)
              st.fx.float(
                st.r!.X(st.s.guards[d.guard]?.x ?? 0),
                st.r!.Y(st.s.guards[d.guard]?.y ?? 0) - 30,
                `${d.who.toUpperCase()} JOINED!`,
                '#ffd23f',
                true,
              );
          }
      const mine = linkRef.current?.role === 'defend' ? linkRef.current.you : -1;
      // A ready power that would help right now: its key in a bubble over your head.
      const hi =
        mine < 0 && !scriptRef.current && st.started && st.s.phase === 'play'
          ? powerHint(st.s, map, (i) => laserOn(st.s, i))
          : -1;
      const hp = hi >= 0 ? st.s.powers[hi] : undefined;
      st.r?.draw(st.s, st.prev, Math.min(1, acc / (DT * 1000)), st.fx, now, {
        defenders: humans,
        follow: mine >= 0 ? st.s.guards[mine] : undefined,
        // On a touch screen there are no keys: the bubble just names the power (its button glows too).
        hint: hp && {
          key: matchMedia('(pointer: coarse)').matches ? '' : (POWER_KEY_LABEL[hi] ?? String(hi + 1)),
          name: RUSH_POWERS[hp.id].name,
        },
      });
      // The dial's needle turns every frame, outside React.
      const safe = st.s.safe;
      if (safe?.dialing && dialRef.current) dialRef.current.style.transform = `rotate(${safe.needle}deg)`;
      if (st.endAt && now >= st.endAt) {
        st.endAt = 0;
        setShowEnd(true);
      }
      // A live raid is saved by the live server; otherwise (or if the link dropped) by this screen.
      const lk = linkRef.current;
      const serverSaves = !!lk && lk.role === 'rob' && lk.status !== 'failed';
      if (realRef.current && !sentRef.current && st.s.phase !== 'play' && !serverSaves) {
        sentRef.current = true;
        realRef.current
          .finish(encodeRushInputs(st.inputs))
          .then((r) => setSaved(r))
          .catch((e: unknown) =>
            setSaved({
              moved: 0,
              jailedUntil: null,
              error: e instanceof Error ? e.message : 'Could not save the run.',
            }),
          );
      }
      const s = st.s;
      const sec = Math.ceil(s.timeLeft);
      if (s.phase === 'play' && st.started && sec !== lastSecond && sec <= 10) sound.current?.tick(sec <= 5);
      lastSecond = sec;
      const next: Hud = {
        phase: s.phase,
        started: st.started,
        seconds: sec,
        carried: s.carried,
        mult:
          s.chainAge <= RUSH.comboGap
            ? Math.min(RUSH.comboMax, 1 + Math.floor((s.chain - 1) / RUSH.comboStep))
            : 1,
        hearts: s.hearts,
        dialing: !!safe?.dialing,
        safeOpen: !!safe?.open,
        safeTaken: safe?.open ? rulesRef.current.safeValue : 0,
        flip: Math.ceil(s.flip),
        alarm: Math.ceil(s.alarm),
        hunt: s.guards.some((x) => x.mode === 'hunt'),
        wait: s.powers.map((p) => Math.max(0, Math.ceil(p.ready - s.clock))),
        active: s.powers.map((p) =>
          p.id in s.fx
            ? Math.round((s.fx[p.id as keyof RushState['fx']] / Math.max(1, RUSH_POWERS[p.id].lasts)) * 20) /
              20
            : 0,
        ),
        score: s.score,
        swept: s.swept,
        caughtBy: s.caughtBy,
        coins: s.coins.filter(Boolean).length,
        combo: st.seenCombo,
        flipped: st.seenFlip,
        hint: s.phase === 'play' ? powerHint(s, map, (i) => laserOn(s, i)) : -1,
      };
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setHud(next);
      }
      raf = requestAnimationFrame(frame);
    };

    const readInput = (st: NonNullable<typeof game.current>): RushInput => {
      const script = scriptRef.current;
      if (script) {
        // A replay: the recorded key presses, one a step. When they run out, the robber stands still.
        return script[st.inputs.length] ?? { d: -1 };
      }
      let d: Dir | -1 = st.held.at(-1) ?? -1;
      if (d !== -1 && st.stick) d = stickWay(map, st.s, d);
      if (d === -1 && st.tap) {
        d = st.tap.d;
        if (st.s.tick >= st.tap.until) st.tap = null;
      }
      const input: RushInput = { d, use: st.use, p: st.power };
      st.use = false;
      st.power = -1;
      return input;
    };

    const react = (st: NonNullable<typeof game.current>, ev: RushEvent[]) => {
      const sfx = sound.current;
      const rr = st.r!;
      const t = rr.t;
      const at = (x: number, y: number) => ({ x: rr.X(x + 0.5), y: rr.Y(y + 0.5) });
      const me = { x: rr.X(st.s.me.x), y: rr.Y(st.s.me.y) };
      for (const e of ev) {
        switch (e.t) {
          case 'coin': {
            sfx?.coin();
            const p = at(e.x, e.y);
            st.fx.burst(p.x, p.y, 4, ['#ffd666', '#fff3b0'], 1.6);
            if (e.mult > 1) st.fx.float(p.x, p.y - t * 0.3, `+${e.value}`, '#ffd666');
            break;
          }
          case 'stack': {
            sfx?.cash();
            const p = at(e.x, e.y);
            st.fx.burst(p.x, p.y, 14, ['#7dffa8', '#5fd17e', '#ffffff'], 2.6);
            st.fx.float(p.x, p.y - t * 0.3, `+${money(e.value)}`, '#7dffa8', true);
            break;
          }
          case 'combo':
            st.seenCombo = true;
            sfx?.combo(e.mult);
            st.fx.float(me.x, me.y - t * 1.1, `COMBO ×${e.mult}`, '#ff8fc0', true);
            st.fx.ring(me.x, me.y, t * 1.4, '#ff8fc0');
            break;
          case 'flip':
            st.seenFlip = true;
            sfx?.flip();
            st.fx.flash = 0.3;
            st.fx.flashColor = '#3a86ff';
            st.fx.shake = 6;
            st.fx.float(me.x, me.y - t * 1.1, 'RUN, GUARDS!', '#9fd3ff', true);
            break;
          case 'knock': {
            sfx?.thud();
            const gd = st.s.guards[e.i]!;
            const p = { x: rr.X(gd.x), y: rr.Y(gd.y) };
            st.fx.burst(p.x, p.y, 18, ['#ffd666', '#ffffff', '#3a86ff'], 3);
            st.fx.shake = Math.max(st.fx.shake, 6);
            if (e.bonus) st.fx.float(p.x, p.y - t * 0.6, `+${money(e.bonus)}`, '#ffd666', true);
            break;
          }
          case 'wave':
            if (e.hunt) {
              sfx?.suspect();
              st.fx.float(me.x, me.y - t * 1.2, 'THEY’RE HUNTING!', '#ff8a80', true);
            }
            break;
          case 'dial':
            sfx?.click();
            break;
          case 'hit':
            sfx?.hit(e.n);
            break;
          case 'miss':
            sfx?.miss();
            st.fx.shake = 6;
            st.fx.flash = 0.25;
            st.fx.flashColor = '#ff2d55';
            break;
          case 'safe':
            sfx?.safe();
            st.fx.burst(me.x, me.y - t * 0.5, 50, ['#ffd666', '#fff3b0', '#ffffff', '#5fd17e'], 4.5, 0.12);
            st.fx.float(me.x, me.y - t * 1.2, `+${money(e.value)}`, '#ffd666', true);
            st.fx.flash = 0.4;
            st.fx.flashColor = '#ffd666';
            st.fx.shake = 10;
            break;
          case 'laser':
            sfx?.lockdown();
            st.fx.flash = 0.3;
            st.fx.flashColor = '#ff2d55';
            st.fx.float(me.x, me.y - t * 1.1, 'ALARM!', '#ff4d6d', true);
            break;
          case 'hurry':
            sfx?.lockdown();
            st.fx.float(me.x, me.y - t * 1.2, 'GET OUT!', '#ffb347', true);
            break;
          case 'power':
            sfx?.power();
            rr.pfx.on(e.id, performance.now(), me, {
              guard: e.at,
              from: e.from && { x: rr.X(e.from.x), y: rr.Y(e.from.y) },
              noise: st.s.noise && at(st.s.noise.x - 0.5, st.s.noise.y - 0.5),
            });
            st.fx.float(me.x, me.y - t * 1.2, RUSH_POWERS[e.id].name.toUpperCase(), '#ff8fc0');
            break;
          case 'paid':
            sfx?.cash();
            st.fx.float(me.x, me.y - t * 1.1, `PAID OFF −${money(e.lost)}`, '#7dffa8', true);
            break;
          case 'tag':
            sfx?.tag();
            st.fx.shake = 12;
            st.fx.flash = 0.35;
            st.fx.flashColor = '#ff2d55';
            st.fx.burst(me.x, me.y, 16, ['#ffd666', '#ff4d6d'], 3);
            if (e.lost) st.fx.float(me.x, me.y - t * 1.1, `−${money(e.lost)}`, '#ff4d6d', true);
            break;
          case 'escaped':
            sfx?.escaped();
            st.fx.burst(me.x, me.y, 60, ['#ffd666', '#7dffa8', '#ffffff', '#ff4f9a'], 4.5, 0.1);
            st.endAt = performance.now() + 700;
            break;
          case 'busted':
            sfx?.busted();
            st.fx.shake = 14;
            st.fx.flash = 0.5;
            st.fx.flashColor = '#ff2d55';
            st.endAt = performance.now() + 900;
            break;
        }
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sound.current?.alarmOff();
    };
  }, [map, player.id, guardsKey, owner.color, fresh]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = game.current;
      if (!g || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'KeyR' && !netRef.current && !realRef.current && g.s.phase !== 'play') return restart();
      if (scriptRef.current) return;
      const d = KEYS[e.code];
      const pw = POWER_KEYS[e.code];
      if (d === undefined && pw === undefined && !USE_KEYS.has(e.code)) return;
      e.preventDefault();
      sound.current?.unlock();
      if (d !== undefined) {
        g.started = true;
        g.stick = false;
        if (!g.held.includes(d)) g.held.push(d);
        g.tap = { d, until: g.s.tick + 5 };
        g.tapUntil = performance.now() + 170;
      } else if (USE_KEYS.has(e.code)) {
        if (!e.repeat) g.use = true;
        g.started = true;
      } else if (pw !== undefined && g.started) g.power = pw;
    };
    const up = (e: KeyboardEvent) => {
      const g = game.current;
      const d = KEYS[e.code];
      if (!g || d === undefined) return;
      g.held = g.held.filter((x) => x !== d);
    };
    const blur = () => {
      if (game.current) game.current.held = [];
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [restart]);

  // Touch and mouse: drag anywhere to steer, like a joystick under your thumb.
  const drag = useRef<{ id: number; ax: number; ay: number; d: Dir | -1; ox: number; oy: number } | null>(
    null,
  );
  const onPointerDown = (e: React.PointerEvent) => {
    const g = game.current;
    sound.current?.unlock();
    // A phone steers with the stick under the vault, not on it.
    if (!g || g.s.phase !== 'play' || scriptRef.current || e.pointerType === 'touch') return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* no live pointer */
    }
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { id: e.pointerId, ax: e.clientX, ay: e.clientY, d: -1, ox: box.left, oy: box.top };
    setJoy({ x: e.clientX - box.left, y: e.clientY - box.top, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const dr = drag.current;
    const g = game.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    let dx = e.clientX - dr.ax;
    let dy = e.clientY - dr.ay;
    const len = Math.hypot(dx, dy);
    const MAX = 34;
    if (len > MAX) {
      dr.ax += (dx / len) * (len - MAX);
      dr.ay += (dy / len) * (len - MAX);
      dx = e.clientX - dr.ax;
      dy = e.clientY - dr.ay;
    }
    if (Math.hypot(dx, dy) > 10) {
      const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      if (d !== dr.d) {
        dr.d = d;
        g.started = true;
        g.held = [d];
        g.tap = { d, until: g.s.tick + 5 };
        g.tapUntil = performance.now() + 170;
      }
    }
    setJoy({ x: dr.ax - dr.ox, y: dr.ay - dr.oy, dx, dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const dr = drag.current;
    const g = game.current;
    if (!dr || !g || dr.id !== e.pointerId) return;
    g.held = [];
    drag.current = null;
    setJoy(null);
  };
  /** The phone's stick: hold a way to move, let go to stop, like an arrow key. */
  const onStick = (d: Dir | -1) => {
    const g = game.current;
    sound.current?.unlock();
    if (!g || scriptRef.current) return;
    if (d === -1) {
      g.held = [];
      return;
    }
    if (g.s.phase !== 'play') return;
    g.started = true;
    g.stick = true;
    g.held = [d];
    g.tap = null;
  };
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(matchMedia('(pointer: coarse)').matches), []);

  const press = (what: 'use' | number) => {
    const g = game.current;
    if (!g) return;
    sound.current?.unlock();
    if (what === 'use') {
      g.use = true;
      g.started = true;
    } else if (g.started) g.power = what;
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    sound.current?.setMuted(m);
    try {
      localStorage.setItem('heist-muted', m ? '1' : '0');
    } catch {}
  };

  const [, setLinkSeen] = useState(0);
  useEffect(() => {
    if (!link) return;
    const stop = link.listen(() => setLinkSeen((n) => n + 1));
    return () => {
      stop();
    };
  }, [link]);
  const role = link && link.status !== 'failed' ? link.role : null;
  const viewer = role === 'defend' || role === 'watch';
  const robberName = props.robber?.name ?? 'the robber';

  const phase = hud?.phase ?? 'play';
  const over = phase !== 'play';
  // Caught by a guard a real defender was steering: it was them.
  const catcher =
    hud?.caughtBy != null
      ? [...(link?.defenders.values() ?? []), ...(replay?.defenders ?? [])].find(
          (d) => d.guard === hud.caughtBy,
        )
      : undefined;
  const caughtBy = catcher
    ? { id: catcher.chog, name: ('who' in catcher && catcher.who) || 'A defender' }
    : hud?.caughtBy != null
      ? guards[hud.caughtBy % Math.max(1, guards.length)]
      : null;
  const hurry = !!hud && hud.seconds <= RUSH.hurry && !over;
  const safeState = game.current?.s.safe;
  const nearSafe =
    !!map.safe &&
    !!game.current &&
    !safeState?.open &&
    Math.abs(game.current.s.me.x - (map.safe.x + 0.5)) + Math.abs(game.current.s.me.y - (map.safe.y + 0.5)) <=
      1.15;

  return (
    <div className="flex h-full flex-col bg-[#0b0918] text-white">
      {/* Top bar */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 pb-1.5 pt-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 justify-self-start">
          {onLeave && !real && (
            <button
              onClick={onLeave}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/70 hover:text-white"
              aria-label="Back to the city"
            >
              <X size={20} weight="bold" />
            </button>
          )}
          <div
            className="flex min-w-0 items-center gap-1.5 rounded-[8px] py-1 pl-1.5 pr-2"
            style={{ background: owner.color, color: owner.ink }}
          >
            <Vault size={16} weight="fill" className="shrink-0" />
            <span className="truncate pt-0.5 font-display text-[12px] leading-none">{owner.name}</span>
          </div>
          <span
            className="hidden items-center gap-0.5 sm:flex"
            aria-label={`${hud?.hearts ?? RUSH.hearts} hearts`}
          >
            {Array.from({ length: RUSH.hearts }, (_, i) => (
              <Heart
                key={i}
                size={22}
                weight="fill"
                className={cn('drop-', i < (hud?.hearts ?? RUSH.hearts) ? 'text-[#ff4d6d]' : 'text-white/15')}
              />
            ))}
          </span>
        </div>
        <div
          className={cn(
            'font-display text-[24px] leading-none tabular-nums sm:text-[28px]',
            hurry ? 'animate-pulse text-[#ff4d6d]' : 'text-white',
          )}
        >
          {`${Math.floor((hud?.seconds ?? map.seconds) / 60)}:${String((hud?.seconds ?? map.seconds) % 60).padStart(2, '0')}`}
        </div>
        <div className="flex items-center gap-1.5 justify-self-end">
          {!!hud && hud.mult > 1 && !over && (
            <span className="rounded-full bg-sys-pink px-2 py-0.5 font-display text-[13px] leading-none text-white">
              ×{hud.mult}
            </span>
          )}
          <div className="rounded-full bg-sys-gold px-2.5 py-1 font-display text-[16px] leading-none text-black tabular-nums">
            {money(hud?.carried ?? 0)}
          </div>
          <button
            onClick={toggleMute}
            className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:text-white"
            aria-label={muted ? 'Sound on' : 'Sound off'}
          >
            {muted ? <SpeakerSlash size={20} weight="bold" /> : <SpeakerHigh size={20} weight="bold" />}
          </button>
        </div>
      </div>

      {/* The vault */}
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        {hud?.started && !over && (
          <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
            {viewer ? (
              <div className="flex items-center gap-2 rounded-[10px] bg-[#3b5bdb] px-3 pb-1 pt-1.5 font-display text-[13px] leading-none text-white sm:text-[14px]">
                {role === 'defend'
                  ? `You're a guard: catch ${robberName}!`
                  : `Watching live: ${robberName} robbing ${owner.name}`}
              </div>
            ) : (
              <Goal hud={hud} rescue={rescue} safeValue={rules.safeValue} />
            )}
          </div>
        )}
        {hud?.dialing && safeState && (
          <Dial
            needleRef={dialRef}
            zone={safeState.zone}
            hits={safeState.hits}
            lockpick={player.powers.includes('lockpick')}
            onPress={() => press('use')}
          />
        )}
        {joy && (
          <div className="pointer-events-none absolute" style={{ left: joy.x, top: joy.y }}>
            <div className="absolute -left-9 -top-9 h-[72px] w-[72px] rounded-full border-2 border-white/30 bg-white/5" />
            <div
              className="absolute -left-4 -top-4 h-8 w-8 rounded-full border-2 border-white/70 bg-white/25"
              style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }}
            />
          </div>
        )}
        {coach && !viewer && hud && !over && <Coach hud={hud} />}
        {link && <Crowd link={link} canSend={viewer} />}
        {role === 'rob' && hud && !over && link && link.defenders.size > 0 && (
          <div className="pointer-events-none absolute right-3 top-14 flex flex-col items-end gap-1.5">
            {[...link.defenders.values()].map((d) => (
              <span
                key={d.name}
                className="flex items-center gap-1.5 rounded-full bg-sys-gold py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold text-black"
              >
                <img src={chogImage(d.chog, 96)} alt="" className="h-6 w-6 rounded-[5px]" />
                {d.who ?? 'A defender'} is guarding
              </span>
            ))}
          </div>
        )}
        {hud && !hud.started && !over && (
          <StartCard player={player} rescue={rescue} safeValue={rules.safeValue} />
        )}
        {over && showEnd && hud && viewer && (
          <ViewerEnd
            escaped={phase === 'escaped'}
            onLeave={onLeave}
            viewer={{ role: role!, robber: robberName, result: link?.result ?? null }}
          />
        )}
        {over && showEnd && hud && !viewer && (
          <EndCard
            escaped={phase === 'escaped'}
            hud={hud}
            owner={owner.name}
            caughtBy={caughtBy}
            onAgain={restart}
            onLeave={onLeave}
            onGetaway={props.onGetaway}
            real={real ? { ...real, result: link?.result ?? saved } : undefined}
            replay={replay}
            rescue={rescue}
          />
        )}
      </div>

      {/* Buttons: your powers on Q and E, and Use (the safe) on Space, or Dash for a defender */}
      <div
        className={cn(
          'flex items-end justify-between gap-3 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-2',
          // A phone: the stick on the left, powers and Use on the right, in a deck of their own.
          touch && 'h-[178px] items-stretch gap-2.5 px-3 pb-[max(10px,env(safe-area-inset-bottom))]',
          role === 'watch' && 'hidden',
        )}
      >
        {touch && (
          <ThumbStick
            onDir={onStick}
            className="min-w-0 flex-1 rounded-[30px] bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]"
          />
        )}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-end gap-3',
            touch && 'flex-none flex-col-reverse items-center justify-start gap-2.5 self-end',
          )}
        >
          {role === 'defend' && !touch && (
            <p className="self-center text-[13px] leading-snug text-white/70">
              Steer with the arrow keys or drag. Touch the robber to catch them. Space dashes.
            </p>
          )}
          {!viewer &&
            player.powers.map((id, i) => {
              const def = RUSH_POWERS[id];
              if (def.passive)
                return (
                  <div
                    key={id}
                    title={def.does}
                    className="flex h-11 items-center gap-2 self-center rounded-full bg-white/[0.07] py-1 pl-1.5 pr-3 text-white/80 ring-1 ring-inset ring-white/10 backdrop-blur-xl max-sm:hidden"
                  >
                    <SkillIcon skill={ICON[id]} width={22} height={22} />
                    <span className="text-[13px] font-semibold">{def.name}</span>
                    <span className="text-[11px] text-white/45">always on</span>
                  </div>
                );
              const wait = hud?.wait[i] ?? 0;
              const active = hud?.active[i] ?? 0;
              const off = !active && wait > 0;
              const ready = !off && !active;
              const hinted = hud?.hint === i && ready;
              const cool = off ? Math.min(1, wait / Math.max(1, def.cooldown)) : 0;
              return (
                <button
                  key={id}
                  onPointerDown={() => press(i)}
                  onClick={(e) => e.detail === 0 && press(i)}
                  disabled={off || over}
                  title={def.does}
                  aria-label={`${def.name} (${POWER_KEY_LABEL[i] ?? i + 1})`}
                  className="group flex flex-col items-center gap-1.5 [-webkit-tap-highlight-color:transparent]"
                >
                  <span
                    className={cn(
                      'relative grid h-[68px] w-[68px] place-items-center rounded-full transition-transform duration-200 ease-[cubic-bezier(.2,.9,.3,1.4)] group-active:scale-90 max-sm:h-[54px] max-sm:w-[54px] sm:h-[76px] sm:w-[76px]',
                      hinted && 'scale-110',
                    )}
                    style={{
                      background: off
                        ? 'rgba(255,255,255,0.06)'
                        : active
                          ? 'linear-gradient(180deg,#ffe58a,#ffb020)'
                          : 'linear-gradient(180deg,#ff6fa8,#e0337a)',
                      boxShadow: off
                        ? 'inset 0 0 0 1px rgba(255,255,255,0.1)'
                        : `inset 0 1px 0 rgba(255,255,255,0.45), 0 8px 24px ${active ? 'rgba(255,176,32,0.45)' : 'rgba(224,51,122,0.45)'}${hinted ? ', 0 0 0 4px rgba(255,255,255,0.9)' : ''}`,
                    }}
                  >
                    {hinted && (
                      <span className="absolute inset-[-6px] animate-ping rounded-full ring-2 ring-white/70" />
                    )}
                    {/* Cooldown: a dark sweep that unwinds as the power comes back. */}
                    {off && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: `conic-gradient(rgba(10,8,20,0.75) ${cool * 360}deg, transparent 0)`,
                        }}
                      />
                    )}
                    {active > 0 && (
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="47"
                          fill="none"
                          stroke="rgba(255,255,255,0.9)"
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={`${active * 295} 295`}
                        />
                      </svg>
                    )}
                    <SkillIcon
                      skill={ICON[id]}
                      width={36}
                      height={36}
                      className={cn('relative drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]', off && 'opacity-40')}
                    />
                    {off && (
                      <span className="absolute inset-0 grid place-items-center text-[24px] font-bold tabular-nums text-white">
                        {wait}
                      </span>
                    )}
                    <span className="kbd absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-[7px] bg-white text-[12px] font-bold text-[#111018] shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                      {POWER_KEY_LABEL[i] ?? i + 1}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'text-[12px] font-semibold max-sm:hidden',
                      off ? 'text-white/40' : 'text-white/90',
                    )}
                  >
                    {active > 0 ? 'On' : def.name}
                  </span>
                </button>
              );
            })}
        </div>
        <button
          onPointerDown={() => press('use')}
          onClick={(e) => e.detail === 0 && press('use')}
          disabled={over}
          aria-label={role === 'defend' ? 'Dash' : hud?.dialing ? 'Crack' : 'Use'}
          className={cn(
            'group flex flex-col items-center gap-1.5 [-webkit-tap-highlight-color:transparent]',
            touch && 'self-end',
          )}
        >
          <span
            className={cn(
              'relative grid h-[78px] w-[78px] place-items-center rounded-full text-[15px] font-bold text-[#111018] transition-transform duration-200 ease-[cubic-bezier(.2,.9,.3,1.4)] group-active:scale-90 sm:h-[86px] sm:w-[86px]',
              (nearSafe || hud?.dialing) && 'animate-[pulse-ring_1.4s_ease-out_infinite]',
            )}
            style={{
              background:
                nearSafe || hud?.dialing
                  ? 'linear-gradient(180deg,#ffe58a,#ffc233)'
                  : 'linear-gradient(180deg,#ffffff,#dcdbe6)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 28px rgba(0,0,0,0.45)',
            }}
          >
            {role === 'defend' ? 'Dash' : hud?.dialing ? 'Crack' : 'Use'}
          </span>
          <span className="kbd rounded-[6px] bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/70">
            Space
          </span>
        </button>
      </div>
    </div>
  );
}

const CROWD = ['laugh', 'scream', 'fire', 'cash', 'angry', 'cool'] as const;

/** Watchers' emotes float up the side of the raid; watchers and defenders get buttons to send them. */
function Crowd({ link, canSend }: { link: RaidLink; canSend: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const now = performance.now();
  const live = link.emotes.filter((e) => now - e.at < 2600).slice(-12);
  return (
    <>
      <div className="pointer-events-none absolute bottom-0 right-2 top-0 w-24 overflow-hidden">
        {live.map((e) => (
          <img
            key={e.at}
            src={`/emotes/${e.k}.webp`}
            alt=""
            className="absolute bottom-0 h-12 w-12 animate-[emote-rise_2.6s_ease-out_forwards]"
            style={{ right: `${(e.at * 7.3) % 56}px` }}
          />
        ))}
      </div>
      {canSend && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-[#17132b]/90 p-1.5">
          {CROWD.map((k) => (
            <button
              key={k}
              onClick={() => link.emote(k)}
              aria-label={k}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-90"
            >
              <img src={`/emotes/${k}.webp`} alt="" className="h-8 w-8" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** The safe's dial: press when the needle is in the green. */
function Dial(props: {
  needleRef: React.RefObject<SVGGElement | null>;
  zone: number;
  hits: number;
  lockpick: boolean;
  onPress: () => void;
}) {
  const width = (RUSH.dialZones[props.hits] ?? 40) * (props.lockpick ? 1.5 : 1);
  const r = 70;
  const arc = (from: number, to: number) => {
    const a = ((from - 90) * Math.PI) / 180;
    const b = ((to - 90) * Math.PI) / 180;
    const large = to - from > 180 ? 1 : 0;
    return `M ${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)} A ${r} ${r} 0 ${large} 1 ${100 + r * Math.cos(b)} ${100 + r * Math.sin(b)}`;
  };
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[#0b0918]/35">
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          props.onPress();
        }}
        className="flex flex-col items-center gap-2"
        aria-label="Stop the needle"
      >
        <svg viewBox="0 0 200 200" className="h-[220px] w-[220px] drop- sm:h-[260px] sm:w-[260px]">
          <circle cx="100" cy="100" r="92" fill="#8c94ab" stroke="#0d0b1a" strokeWidth="6" />
          <circle cx="100" cy="100" r="78" fill="#2a2540" stroke="#0d0b1a" strokeWidth="4" />
          <path
            d={arc(props.zone - width / 2, props.zone + width / 2)}
            stroke="#3ddc84"
            strokeWidth="16"
            fill="none"
            strokeLinecap="round"
          />
          {Array.from({ length: 24 }, (_, i) => (
            <line
              key={i}
              x1="100"
              y1="26"
              x2="100"
              y2={i % 6 === 0 ? 38 : 33}
              stroke="#c9cfdf"
              strokeWidth="2"
              transform={`rotate(${i * 15} 100 100)`}
            />
          ))}
          <g ref={props.needleRef} style={{ transformOrigin: '100px 100px' }}>
            <line x1="100" y1="100" x2="100" y2="30" stroke="#ff4d6d" strokeWidth="6" strokeLinecap="round" />
          </g>
          <circle cx="100" cy="100" r="14" fill="#ffd666" stroke="#0d0b1a" strokeWidth="4" />
        </svg>
        <span className="flex gap-1.5">
          {RUSH.dialZones.map((_, i) => (
            <span
              key={i}
              className={cn('h-3.5 w-3.5 rounded-full', i < props.hits ? 'bg-[#3ddc84]' : 'bg-white/30')}
            />
          ))}
        </span>
        <span className="rounded-full bg-sys-gold px-3 py-1 font-display text-[13px] leading-none text-black">
          Press E / tap in the green
        </span>
      </button>
    </div>
  );
}

function Goal({ hud, rescue, safeValue }: { hud: Hud; rescue?: RushChog; safeValue: number }) {
  const box =
    'flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-[14px] leading-none shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:text-[15px]';
  if (hud.flip > 0)
    return (
      <div className={cn(box, 'bg-[#3a86ff] text-white')}>Guards are scared! Knock them out: {hud.flip}s</div>
    );
  if (hud.alarm > 0)
    return (
      <div className={cn(box, 'animate-pulse bg-[#ff2d55] text-white')}>Alarm! Every guard is coming</div>
    );
  if (hud.seconds <= RUSH.hurry)
    return (
      <div className={cn(box, 'animate-pulse bg-sys-orange text-black')}>
        Doors lock in {hud.seconds}s: get out!
      </div>
    );
  if (!hud.safeOpen)
    return (
      <div className={cn(box, 'bg-sys-gold text-black')}>
        <Vault size={18} weight="fill" />
        {rescue ? 'Open the cell, then get out' : `Grab cash · crack the safe: ${money(safeValue)}`}
      </div>
    );
  return <div className={cn(box, 'bg-sys-green text-black')}>Safe cracked! Out the green exit</div>;
}

/** Practice: the steps, ticked off as you do them. */
function Coach({ hud }: { hud: Hud }) {
  const steps = [
    {
      label: 'Move',
      tip: 'Arrow keys or WASD. On a phone, hold the stick under the vault and slide it; let go to stop.',
      done: hud.started,
    },
    {
      label: 'Grab coins in a row',
      tip: 'Keep collecting without stopping: the combo multiplies them.',
      done: hud.combo,
    },
    {
      label: 'Grab a loudspeaker',
      tip: 'The blue one: guards panic and you can knock them out.',
      done: hud.flipped,
    },
    {
      label: 'Crack the safe',
      tip: 'Stand next to it, press E, then stop the needle in the green twice.',
      done: hud.safeOpen,
    },
    {
      label: 'Get out',
      tip: 'Back to the green exit. A guard tag costs a heart and some cash.',
      done: hud.phase === 'escaped',
    },
  ];
  const now = steps.findIndex((x) => !x.done);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 hidden w-[250px] rounded-[14px] glass-strong p-3 sm:block">
      <p className="font-display text-[12px] tracking-wide text-white/55">Practice</p>
      <ol className="mt-1 grid gap-1.5">
        {steps.map((x, i) => (
          <li key={x.label} className="flex items-start gap-2">
            <span
              className={cn(
                'mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold',
                x.done
                  ? 'border-sys-green bg-sys-green text-black'
                  : i === now
                    ? 'border-[#ffd666] text-[#ffd666]'
                    : 'border-white/30 text-white/40',
              )}
            >
              {x.done ? '✓' : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-[14px] font-semibold leading-tight',
                  x.done ? 'text-white/45 line-through' : i === now ? 'text-white' : 'text-white/50',
                )}
              >
                {x.label}
              </span>
              {i === now && (
                <span className="mt-0.5 block text-[12px] leading-snug text-white/65">{x.tip}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StartCard({
  player,
  rescue,
  safeValue,
}: {
  player: RushGameProps['player'];
  rescue?: RushChog;
  safeValue: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
      <div className="flex max-w-[460px] items-center gap-3 glass-strong rounded-[22px] px-3.5 py-3 text-white">
        <img src={chogImage(player.id, 256)} alt="" className="h-12 w-12 rounded-[10px] object-cover" />
        <div className="text-[13px] leading-snug">
          <strong className="block font-display text-[15px] leading-none">Move to start</strong>
          {rescue
            ? `Open ${rescue.name}'s cell at the top, dodge the guards, and get out the green exit.`
            : `Grab cash in long runs for combos, crack the safe (${money(safeValue)}), and get out before the doors lock. Blue loudspeakers make the guards run.`}
        </div>
      </div>
    </div>
  );
}

/** The end of a raid you defended or watched. */
function ViewerEnd(props: {
  escaped: boolean;
  onLeave?: () => void;
  viewer: { role: 'defend' | 'watch' | 'rob'; robber: string; result: RaidResult | null };
}) {
  const { escaped, viewer } = props;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b0918]/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] glass-strong animate-[glass-in_420ms_cubic-bezier(.2,.9,.3,1)] rounded-[30px] p-6 text-center text-white">
        <div
          className={cn(
            'mx-auto inline-block -rotate-3 rounded-[8px] border-[3px] px-4 pb-1 pt-2 font-display text-[30px] leading-none',
            escaped ? 'border-jail text-jail' : 'border-cash text-cash',
          )}
        >
          {escaped ? 'Got away' : 'Caught!'}
        </div>
        <p className="mt-4 text-[15px] leading-snug">
          {escaped
            ? `${viewer.robber} got out${viewer.result?.moved ? ` with ${money(viewer.result.moved)}` : ''}.`
            : `${viewer.robber} is off to jail${viewer.result?.moved ? ` and their gang paid ${money(viewer.result.moved)}` : ''}.`}
        </p>
        <button onClick={props.onLeave} className="btn press btn-primary mt-5 w-full">
          <span className="pt-1">Back to the city</span>
        </button>
      </div>
    </div>
  );
}

function EndCard(props: {
  escaped: boolean;
  hud: Hud;
  owner: string;
  caughtBy: RushChog | null | undefined;
  onAgain: () => void;
  onLeave?: () => void;
  onGetaway?: () => void;
  real?: {
    myGang: string;
    onLeave: (getawayPass?: string) => void;
    replayHref?: string;
    result: RaidResult | null;
  };
  rescue?: RushChog;
  replay?: { moved: number; robbers: string };
}) {
  const { escaped, hud, real, rescue, replay } = props;
  const [shown, setShown] = useState(0);
  const target = real ? (real.result?.moved ?? 0) : replay ? replay.moved : hud.score;
  useEffect(() => {
    if (!escaped) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      setShown(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [escaped, target]);
  const stars = [
    { on: escaped, label: 'Got out' },
    { on: escaped && hud.safeOpen, label: rescue ? 'Opened the cell' : 'Cracked the safe' },
    { on: escaped && hud.hearts === RUSH.hearts, label: 'Never tagged' },
  ];
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#0b0918]/70 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] glass-strong animate-[glass-in_420ms_cubic-bezier(.2,.9,.3,1)] rounded-[30px] p-6 text-center text-white">
        <div
          className={cn(
            'mx-auto inline-block -rotate-3 rounded-[8px] border-[3px] px-4 pb-1 pt-2 font-display text-[33px] leading-none',
            escaped ? 'border-cash text-cash' : 'border-jail text-jail',
          )}
        >
          {escaped ? (rescue ? 'Freed' : 'Escaped') : 'Busted'}
        </div>
        <div className="mt-3 flex justify-center gap-1.5">
          {stars.map((x, i) => (
            <span key={x.label} className="flex w-[78px] flex-col items-center gap-0.5">
              <Star
                size={34}
                weight="fill"
                className={cn(
                  'drop-',
                  x.on ? 'animate-[star-pop_420ms_ease-out_both] text-[#ffc93c]' : 'text-white/15',
                )}
                style={{ animationDelay: `${200 + i * 180}ms` }}
              />
              <span className={cn('text-[11px] font-semibold leading-tight', !x.on && 'text-label-2')}>
                {x.label}
              </span>
            </span>
          ))}
        </div>
        {real && !real.result ? (
          <p className="mt-5 animate-pulse text-[15px] text-label-2">Counting the cash…</p>
        ) : real?.result?.error ? (
          <p className="mt-5 text-[15px] text-jail">{real.result.error}</p>
        ) : escaped && !rescue ? (
          <>
            <div className="mt-4 font-display text-[41px] leading-none tabular-nums">{money(shown)}</div>
            <p className="mt-1 text-[14px] text-label-2">
              {real?.result?.getawayPass
                ? `in your bag. It's only ${real.myGang}'s once you carry it to your door. Police are on the way.`
                : real
                  ? `moved from ${props.owner} to ${real.myGang}`
                  : replay
                    ? `taken from ${props.owner} by ${replay.robbers}`
                    : 'Practice run: no real cash moves.'}
            </p>
            <ul className="mx-auto mt-4 max-w-[240px] space-y-1 text-[14px]">
              <li className="flex justify-between">
                <span>Cash grabbed</span>
                <span className="font-mono tabular-nums">{money(hud.carried - hud.safeTaken)}</span>
              </li>
              <li className={cn('flex justify-between', !hud.safeTaken && 'text-label-2')}>
                <span>Safe</span>
                <span className="font-mono tabular-nums">
                  {hud.safeTaken ? money(hud.safeTaken) : 'not opened'}
                </span>
              </li>
              <li className={cn('flex justify-between', !hud.swept && 'text-label-2 line-through')}>
                <span>Cleaned out</span>
                <span className="font-mono">+25%</span>
              </li>
            </ul>
          </>
        ) : escaped && rescue ? (
          <p className="mt-4 text-[15px]">
            <strong>{rescue.name}</strong> is out of jail.
          </p>
        ) : (
          <>
            {props.caughtBy ? (
              <div className="mt-4 flex items-center justify-center gap-3">
                <img
                  src={chogImage(props.caughtBy.id, 256)}
                  alt=""
                  className="h-14 w-14 rounded-[10px] object-cover"
                />
                <p className="text-left text-[15px] leading-snug">
                  <strong className="block">{props.caughtBy.name}</strong>
                  caught you
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[15px]">The doors locked before you got out.</p>
            )}
            <p className="mt-3 text-[14px] leading-snug text-label-2">
              {real
                ? `Your Chog is in jail for 30 minutes.${real.result?.moved ? ` ${real.myGang} paid ${props.owner} ${money(real.result.moved)}.` : ''}`
                : `In a real raid your gang would pay what you carried plus a fine, and your Chog goes to jail.`}
            </p>
          </>
        )}
        {real ? (
          <>
            <button
              onClick={() => real.onLeave(real.result?.getawayPass)}
              disabled={!real.result}
              className={cn(
                'btn press mt-5 w-full',
                real.result?.getawayPass ? 'btn-gold animate-pulse' : 'btn-primary',
              )}
            >
              <span className="pt-1">{real.result?.getawayPass ? 'Run it home!' : 'Back to the city'}</span>
            </button>
            {real.result && !real.result.getawayPass && real.replayHref && (
              <a
                href={real.replayHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[14px] font-semibold underline underline-offset-2"
              >
                Watch the replay and share it
              </a>
            )}
          </>
        ) : props.onGetaway && escaped && !replay ? (
          <>
            <button onClick={props.onGetaway} className="btn press btn-gold mt-5 w-full animate-pulse">
              <span className="pt-1">Now run it home!</span>
            </button>
            <p className="mt-2 text-[13px] text-label-2">
              The last part: carry the bag through the city with the police after you.
            </p>
            <button
              onClick={props.onAgain}
              className="mt-2 text-[14px] font-semibold underline underline-offset-2"
            >
              Do the vault again
            </button>
          </>
        ) : (
          <>
            <button onClick={props.onAgain} className="btn press btn-primary mt-5 w-full">
              <ArrowClockwise size={20} weight="bold" />
              <span className="pt-1">{replay ? 'Watch again' : 'Again'}</span>
            </button>
            {props.onLeave ? (
              <button
                onClick={props.onLeave}
                className="mt-3 text-[14px] font-semibold underline underline-offset-2"
              >
                Back to the city
              </button>
            ) : (
              <p className="mt-2 hidden text-[12px] text-label-2 sm:block">or press R</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { TPS as RUSH_TPS };

