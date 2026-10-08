'use client';
import { useRouter } from 'next/navigation';
import { HeistGame, type HeistGameProps } from '@/components/heist/heist-game';

/** The heist in watch-only mode, with a way back to the city. */
export function ReplayView(props: Omit<HeistGameProps, 'onLeave'>) {
  const router = useRouter();
  return <HeistGame {...props} onLeave={() => router.push('/')} />;
}
