'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HeistGame, type HeistGameProps } from '@/components/heist/heist-game';
import { playMusic } from '@/components/heist/music';
import { soundTap } from '@/components/heist/sound';
import { chogImage } from '@/lib/images';
import { RushGame, type RushGameProps } from '@/components/rush/rush-game';
import { GetawayReplay, type GetawayReplayProps } from './getaway-replay';

/** A Cash Rush run in watch-only mode, with a way back to the city; then the run home, if it was recorded. */
export function RushReplayView({
  getaway,
  ...props
}: Omit<RushGameProps, 'onLeave'> & { getaway?: Omit<GetawayReplayProps, 'onVault'> }) {
  const router = useRouter();
  const [home, setHome] = useState(false);
  const [started, setStarted] = useState(false);
  // It waits for a tap to start: phones only allow sound after one, and you see whose run it is first.
  if (!started)
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="glass-strong w-full max-w-[340px] rounded-[30px] p-6 text-center text-white">
          <img
            src={chogImage(props.player.id, 256)}
            alt=""
            className="mx-auto h-28 w-28 rounded-[22px] object-cover shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
          />
          <p className="mt-4 text-[14px] font-semibold text-label-2">
            {props.rescue ? 'A jail break' : `Robbing ${props.owner.name}`}
          </p>
          <h1 className="mt-1 font-display text-[28px] leading-tight">{props.player.name}</h1>
          <button
            onClick={() => {
              soundTap();
              playMusic('vault');
              setStarted(true);
            }}
            className="btn press btn-gold mt-5 w-full"
          >
            <span className="pt-1">Watch the replay</span>
          </button>
          <p className="mt-2 text-[12px] text-label-2">Sound on: turn off your phone’s silent switch.</p>
        </div>
      </div>
    );
  if (getaway && home)
    return (
      <GetawayReplay
        {...getaway}
        onVault={() => {
          playMusic('vault');
          setHome(false);
        }}
      />
    );
  return (
    <RushGame
      {...props}
      onLeave={() => router.push('/')}
      onGetaway={
        getaway
          ? () => {
              playMusic('chase');
              setHome(true);
            }
          : undefined
      }
    />
  );
}

/** An old stealth run (from before Cash Rush), in watch-only mode. */
export function ReplayView(props: Omit<HeistGameProps, 'onLeave'>) {
  const router = useRouter();
  return <HeistGame {...props} onLeave={() => router.push('/')} />;
}
