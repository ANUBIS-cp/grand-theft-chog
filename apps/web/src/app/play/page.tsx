import type { Metadata } from 'next';
import { PlayApp } from '@/components/play/play-app';

export const metadata: Metadata = { title: 'Play · Chog City' };

export default function PlayPage() {
  return <PlayApp />;
}
