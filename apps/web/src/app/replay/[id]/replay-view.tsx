'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HeistGame, type HeistGameProps } from '@/components/heist/heist-game';
import { RushGame, type RushGameProps } from '@/components/rush/rush-game';
import { GetawayReplay, type GetawayReplayProps } from './getaway-replay';

/** A Cash Rush run in watch-only mode, with a way back to the city; then the run home, if it was recorded. */
export function RushReplayView({
  getaway,
  ...props
}: Omit<RushGameProps, 'onLeave'> & { getaway?: Omit<GetawayReplayProps, 'onVault'> }) {
  const router = useRouter();
  const [home, setHome] = useState(false);
  if (getaway && home) return <GetawayReplay {...getaway} onVault={() => setHome(false)} />;
  return (
    <RushGame
      {...props}
      onLeave={() => router.push('/')}
      onGetaway={getaway ? () => setHome(true) : undefined}
    />
  );
}

/** An old stealth run (from before Cash Rush), in watch-only mode. */
export function ReplayView(props: Omit<HeistGameProps, 'onLeave'>) {
  const router = useRouter();
  return <HeistGame {...props} onLeave={() => router.push('/')} />;
}
