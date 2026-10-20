import { GANGS } from '@chog-city/data';
import { ImageResponse } from 'next/og';
import { T, chogPng, ogFonts } from '@/lib/og';
import { GANG_COLOR } from '@/lib/theme';
import { dayLabel, recapFor } from './data';

export const alt = 'A day in Grand Theft Chog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image({ params }: { params: Promise<{ day: string }> }) {
  const r = await recapFor((await params).day);
  if (!r) return new Response('Not found', { status: 404 });
  const art = r.biggest ? await chogPng(r.biggest.chog) : null;
  const top = r.top[0];
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
      {art && (
        <img
          src={art}
          width={470}
          height={470}
          style={{
            border: '6px solid #111',
            borderRadius: 18,
            boxShadow: '10px 10px 0 #111',
            marginRight: 56,
          }}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ fontSize: 34, letterSpacing: 2, color: '#a59fc9' }}>
          {`${dayLabel(r.start).toUpperCase()} IN GRAND THEFT CHOG`}
        </div>
        <T
          text={
            r.robberies ? `${r.robberies} ${r.robberies === 1 ? 'ROBBERY' : 'ROBBERIES'}` : 'A QUIET NIGHT'
          }
          style={{ fontSize: 104, lineHeight: 0.9, marginTop: 10 }}
        />
        {r.robberies > 0 && (
          <T
            text={`$${r.stolen.toLocaleString('en-US')} CARRIED HOME · ${r.caught} CAUGHT`}
            style={{ fontSize: 44, color: '#ffd666', marginTop: 16 }}
          />
        )}
        {r.biggest && (
          <T
            text={`BIGGEST HAUL $${r.biggest.cash.toLocaleString('en-US')} FROM ${GANGS[r.biggest.target].name.toUpperCase()}`}
            style={{ fontSize: 36, marginTop: 14 }}
          />
        )}
        {top && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto', fontSize: 34 }}>
            <div style={{ display: 'flex', color: '#a59fc9', paddingTop: 6 }}>RICHEST</div>
            <div
              style={{
                display: 'flex',
                background: GANG_COLOR[top.gang].bg,
                color: GANG_COLOR[top.gang].fg,
                border: '4px solid #111',
                borderRadius: 8,
                padding: '4px 14px 0',
                fontSize: 38,
              }}
            >
              {GANGS[top.gang].name.toUpperCase()}
            </div>
            <T text={`$${top.cash.toLocaleString('en-US')}`} style={{ fontSize: 38 }} />
          </div>
        )}
      </div>
    </div>,
    { ...size, fonts: await ogFonts() },
  );
}
