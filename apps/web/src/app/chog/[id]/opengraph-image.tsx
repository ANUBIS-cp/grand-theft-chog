import { GANGS, displayName, getChog } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { POWERS, powersFor } from '@chog-city/game/heist';
import { heistRecord, isChogId } from '@chog-city/server';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';

export const alt = 'A Chog in Chog City';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

async function chogPng(id: number): Promise<string> {
  const dir = process.env.IMAGES_DIR;
  const webp = dir
    ? await readFile(`${dir}/640/${id}.webp`)
    : Buffer.from(
        await (await fetch(`https://chogcity.35-212-31-75.sslip.io/img/640/${id}.webp`)).arrayBuffer(),
      );
  const png = await sharp(webp).resize(470, 470).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Koulen's "1" looks like "I", so digits are drawn in Anton and everything else in Koulen. */
function T({ text, style }: { text: string; style: React.CSSProperties }) {
  const runs = text.match(/\d+|\D+/g) ?? [];
  return (
    <div style={{ display: 'flex', alignItems: 'center', ...style }}>
      {runs.map((r, i) => (
        <span
          key={i}
          style={
            /\d/.test(r)
              ? { fontFamily: 'Anton', fontSize: '0.88em', whiteSpace: 'pre' }
              : { fontFamily: 'Koulen', whiteSpace: 'pre' }
          }
        >
          {r}
        </span>
      ))}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!isChogId(id) || !getChog(id)) return new Response('Not found', { status: 404 });
  // public/ sits next to the server in dev and in the standalone build. Koulen and Anton: SIL Open Font License.
  const [koulen, anton] = await Promise.all([
    readFile(join(process.cwd(), 'public/fonts/koulen.woff')),
    readFile(join(process.cwd(), 'public/fonts/anton.woff')),
  ]);
  const r = await heistRecord(await db(), id);
  const name = displayName(getChog(id)!);
  const art = await chogPng(id);
  const gangId = r?.gang ?? null;
  const gang = gangId ? GANG_COLOR[gangId] : null;
  const powers = powersFor(chogInfo(id).skills).map((p) => POWERS[p].name.toUpperCase());
  const stolen = (r?.stolen ?? 0).toLocaleString('en-US');
  const escapes = r?.escapes ?? 0;
  const catches = r?.catches ?? 0;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#0b0918',
        padding: 56,
        fontFamily: 'Koulen',
        color: '#ffffff',
      }}
    >
      <img
        src={art}
        width={470}
        height={470}
        style={{ border: '6px solid #111', borderRadius: 18, boxShadow: '10px 10px 0 #111' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56, flex: 1 }}>
        <div style={{ fontSize: 34, letterSpacing: 2, color: '#a59fc9' }}>CHOG CITY HEISTS</div>
        <T text={name.toUpperCase()} style={{ fontSize: 104, lineHeight: 0.9, marginTop: 8 }} />
        <div style={{ display: 'flex', marginTop: 22, gap: 16, alignItems: 'center' }}>
          {gang && gangId && (
            <div
              style={{
                background: gang.bg,
                color: gang.fg,
                border: '4px solid #111',
                borderRadius: 8,
                padding: '4px 14px 0',
                fontSize: 38,
              }}
            >
              {GANGS[gangId].name.toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 26 }}>
          {powers.map((n) => (
            <div
              key={n}
              style={{
                border: '4px solid #111',
                borderRadius: 999,
                background: '#d83e7e',
                color: '#111',
                padding: '6px 18px 0',
                fontSize: 30,
              }}
            >
              {n}
            </div>
          ))}
        </div>
        <T text={`STOLE $${stolen}`} style={{ marginTop: 'auto', fontSize: 64, color: '#ffd666' }} />
        <T
          text={`${escapes} ${escapes === 1 ? 'ESCAPE' : 'ESCAPES'} · CAUGHT ${catches} ${catches === 1 ? 'ROBBER' : 'ROBBERS'}`}
          style={{ fontSize: 30, color: '#a59fc9' }}
        />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Koulen', data: koulen, weight: 400, style: 'normal' },
        { name: 'Anton', data: anton, weight: 400, style: 'normal' },
      ],
    },
  );
}
