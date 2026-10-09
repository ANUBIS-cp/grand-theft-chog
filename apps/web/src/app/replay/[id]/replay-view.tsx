'use client';
import { useRouter } from 'next/navigation';
import { HeistGame, type HeistGameProps } from '@/components/heist/heist-game';
import { RushGame, type RushGameProps } from '@/components/rush/rush-game';

/** A Cash Rush run in watch-only mode, with a way back to the city. */
export function RushReplayView(props: Omit<RushGameProps, 'onLeave'>) {
  const router = useRouter();
  return <RushGame {...props} onLeave={() => router.push('/')} />;
}

/** An old stealth run (from before Cash Rush), in watch-only mode. */
export function ReplayView(props: Omit<HeistGameProps, 'onLeave'>) {
  const router = useRouter();
  return <HeistGame {...props} onLeave={() => router.push('/')} />;
}
