import { GANGS, displayName, getChog } from '@chog-city/data';
import { chogInfo } from '@chog-city/game';
import { POWERS, powersFor } from '@chog-city/game/heist';
import { heistRecord, isChogId } from '@chog-city/server';
import { ImageResponse } from 'next/og';
import { T, chogPng, ogFonts } from '@/lib/og';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';

export const alt = 'A Chog in Grand Theft Chog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!isChogId(id) || !getChog(id)) return new Response('Not found', { status: 404 });
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
        <div style={{ fontSize: 34, letterSpacing: 2, color: '#a59fc9' }}>GRAND THEFT CHOG</div>
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
      fonts: await ogFonts(),
    },
  );
}
