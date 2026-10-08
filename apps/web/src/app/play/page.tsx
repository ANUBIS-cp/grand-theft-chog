import type { Metadata } from 'next';
import { WarApp } from '@/components/war/war-app';

export const metadata: Metadata = { title: 'Play · Chog City' };

export default function PlayPage() {
  return <WarApp />;
}
