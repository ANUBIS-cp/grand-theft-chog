import type { Metadata } from 'next';
import { CityApp } from '@/components/city/city-app';

export const metadata: Metadata = { title: 'Play · Grand Theft Chog' };

export default function PlayPage() {
  return <CityApp />;
}
