import { readFileSync, writeFileSync } from 'node:fs';

// The city's chat: one room for everyone and one per gang. Only players with a Chog can talk (who you are
// comes from the signed ticket); visitors without a wallet can read the city room. Messages are plain text:
// links are taken out (a crypto crowd gets scam links), and floods are cut off. The last messages of each
// room are kept, and saved to a small file so a restart doesn't wipe the conversation.

export type Room = 'city' | 'gang';

export interface ChatMsg {
  id: number;
  room: Room;
  /** The gang a gang-room message belongs to. */
  gang: string | null;
  chog: number;
  name: string;
  /** The sender's gang, for the colour of their name. */
  from: string | null;
  text: string;
  at: number;
}

const KEEP = 60;
const MAX_LEN = 240;
const FILE = process.env.CHAT_FILE ?? null;

const city: ChatMsg[] = [];
const gangs = new Map<string, ChatMsg[]>();
let nextId = 1;
let dirty = false;

/** Recent messages per Chog, to slow down floods: at most 5 in 8 seconds, and one a second. */
const recent = new Map<number, number[]>();

function load() {
  if (!FILE) return;
  try {
    const saved = JSON.parse(readFileSync(FILE, 'utf8')) as ChatMsg[];
    for (const m of saved) keep(m);
    nextId = Math.max(0, ...saved.map((m) => m.id)) + 1;
  } catch {
    /* no file yet */
  }
}

function keep(m: ChatMsg) {
  const list = m.room === 'city' ? city : (gangs.get(m.gang!) ?? gangs.set(m.gang!, []).get(m.gang!)!);
  list.push(m);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
}

load();
if (FILE)
  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    try {
      writeFileSync(FILE, JSON.stringify([...city, ...[...gangs.values()].flat()]));
    } catch {
      /* try again next time */
    }
  }, 10_000).unref();

/** Control characters, zero-width and direction-flipping characters. */
const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]', 'g');

/** Plain text only: no control or invisible characters, no links, one line, not too long. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let t = raw
    .normalize('NFKC')
    .replace(INVISIBLE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Links and web addresses become a plain marker, so nobody can post a phishing link.
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]');
  t = t.replace(
    /\b[\w-]+\.(?:com|io|xyz|net|org|app|gg|co|me|ly|link|site|online|fun|finance|exchange)\b\S*/gi,
    '[link]',
  );
  if (!t) return null;
  return t.length > MAX_LEN ? t.slice(0, MAX_LEN).trimEnd() + '…' : t;
}

/** A player says something. Returns the message to send out, or a reason it wasn't sent. */
export function say(
  p: { chog: number | null; name: string; gang: string | null },
  room: unknown,
  raw: unknown,
  now: number,
): ChatMsg | 'guest' | 'no-gang' | 'empty' | 'slow' {
  if (p.chog === null) return 'guest';
  const r: Room = room === 'gang' ? 'gang' : 'city';
  if (r === 'gang' && !p.gang) return 'no-gang';
  const text = cleanText(raw);
  if (!text) return 'empty';
  const times = (recent.get(p.chog) ?? []).filter((t) => now - t < 8000);
  if (times.length >= 5 || (times.length && now - times.at(-1)! < 900)) return 'slow';
  times.push(now);
  recent.set(p.chog, times);
  const m: ChatMsg = {
    id: nextId++,
    room: r,
    gang: r === 'gang' ? p.gang : null,
    chog: p.chog,
    name: p.name,
    from: p.gang,
    text,
    at: now,
  };
  keep(m);
  dirty = true;
  return m;
}

/** What a newcomer sees: the city room, and their gang's room if they have one. */
export function chatHistory(gang: string | null): ChatMsg[] {
  return [...city, ...(gang ? (gangs.get(gang) ?? []) : [])].sort((a, b) => a.at - b.at);
}
