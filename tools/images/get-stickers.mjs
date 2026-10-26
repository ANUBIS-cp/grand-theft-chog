// Downloads the ChogStikers Telegram pack, run on the chog VM where the bot's token lives.
// Reads the token from ~/monad-mystic/.env and never prints it or any URL that contains it.
// Usage (from the Mac): see the command in the chat; files land in /tmp/chogstk on the VM.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync(process.env.HOME + '/monad-mystic/.env', 'utf8');
const tok = (env.match(/^TELEGRAM_BOT_TOKEN=["']?([^"'\r\n]+)/m) || [])[1];
if (!tok) {
  console.log('no token found');
  process.exit(1);
}
const api = (m, q) =>
  fetch(`https://api.telegram.org/bot${tok}/${m}?${new URLSearchParams(q)}`)
    .then((r) => r.json())
    .catch(() => ({ ok: false }));

const set = await api('getStickerSet', { name: 'ChogStikers' });
if (!set.ok) {
  console.log('getStickerSet failed:', set.error_code, set.description);
  process.exit(1);
}
const out = '/tmp/chogstk';
mkdirSync(out, { recursive: true });
const list = [];
for (const [i, s] of set.result.stickers.entries()) {
  const f = await api('getFile', { file_id: s.file_id });
  if (!f.ok) {
    console.log('getFile failed for sticker', i);
    continue;
  }
  const ext = f.result.file_path.split('.').pop();
  let buf;
  try {
    const r = await fetch(`https://api.telegram.org/file/bot${tok}/${f.result.file_path}`);
    buf = Buffer.from(await r.arrayBuffer());
  } catch {
    console.log('download failed for sticker', i);
    continue;
  }
  const name = `${String(i).padStart(2, '0')}.${ext}`;
  writeFileSync(`${out}/${name}`, buf);
  list.push({ file: name, emoji: s.emoji, w: s.width, h: s.height, animated: s.is_animated, video: s.is_video });
}
writeFileSync(`${out}/pack.json`, JSON.stringify({ title: set.result.title, list }, null, 1));
console.log('title:', set.result.title, 'count:', list.length);
