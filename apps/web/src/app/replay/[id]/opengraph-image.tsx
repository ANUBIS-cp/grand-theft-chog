import { GANGS, displayName, getChog } from '@chog-city/data';
import { runForReplay } from '@chog-city/server';
import { ImageResponse } from 'next/og';
import { T, chogPng, ogFonts } from '@/lib/og';
import { GANG_COLOR } from '@/lib/theme';
import { db } from '@/server/db';

export const alt = 'A robbery in Chog City';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

const chip = (bg: string, fg: string): React.CSSProperties => ({
  background: bg,
  color: fg,
  border: '4px solid #111',
  borderRadius: 8,
  padding: '4px 14px 0',
  fontSize: 38,
});

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const run = await runForReplay(await db(), (await params).id);
  if (!run) return new Response('Not found', { status: 404 });
  const name = displayName(getChog(run.chogId)!);
  const art = await chogPng(run.chogId);
  const escaped = run.result === 'escaped';
  const robber = GANG_COLOR[run.gang];
  const target = GANG_COLOR[run.target];

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
        <div style={{ fontSize: 34, letterSpacing: 2, color: '#a59fc9' }}>WATCH THE ROBBERY</div>
        <T text={name.toUpperCase()} style={{ fontSize: 96, lineHeight: 0.9, marginTop: 8 }} />
        <div style={{ display: 'flex', marginTop: 18, gap: 14, alignItems: 'center', fontSize: 34 }}>
          <div style={chip(robber.bg, robber.fg)}>{GANGS[run.gang].name.toUpperCase()}</div>
          <div style={{ display: 'flex', color: '#a59fc9', paddingTop: 6 }}>{escaped ? 'ROBBED' : 'VS'}</div>
          <div style={chip(target.bg, target.fg)}>{GANGS[run.target].name.toUpperCase()}</div>
        </div>
        {escaped ? (
          <T
            text={`GOT AWAY WITH $${run.moved.toLocaleString('en-US')}`}
            style={{ marginTop: 'auto', fontSize: 64, color: '#ffd666' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              marginTop: 'auto',
              alignSelf: 'flex-start',
              border: '8px solid #ff5a4f',
              color: '#ff5a4f',
              borderRadius: 10,
              padding: '8px 22px 0',
              fontSize: 80,
              transform: 'rotate(-4deg)',
            }}
          >
            BUSTED
          </div>
        )}
        <div style={{ display: 'flex', fontSize: 30, color: '#a59fc9', marginTop: 10 }}>
          {run.revenge ? 'REVENGE HIT · ' : ''}MOVE BY MOVE, AS IT HAPPENED
        </div>
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}
