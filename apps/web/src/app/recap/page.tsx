import { dayOf } from '@chog-city/game';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Yesterday's recap. */
export default function RecapNow() {
  redirect(`/recap/${dayOf(Date.now()) - 1}`);
}
