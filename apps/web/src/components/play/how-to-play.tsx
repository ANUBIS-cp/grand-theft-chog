'use client';
import { Sheet } from '@/components/ui/sheet';

const STEPS = [
  [
    'Traits are skills',
    "Your Chog's traits decide what it's good at. Its card shows each skill and the trait it came from.",
  ],
  ['5 moves a day', 'Each job uses one move. Moves refill every day at 18:00 UTC.'],
  [
    'Jobs pay cash',
    'Solo jobs give a result right away. Big jobs need a crew of Chogs with the skills the job asks for.',
  ],
  [
    'Turf for your gang',
    'Every job scores points for your gang in that district. At 18:00 UTC each district goes to the gang with the most points.',
  ],
  [
    'Crime has risk',
    'Crimes add Wanted stars, which lower your odds and wear off over time. A failed job can put your Chog in jail for a few hours.',
  ],
  [
    'Your Chog keeps a record',
    'Cash, level, jobs and titles belong to the NFT. If you sell the Chog, the record goes with it.',
  ],
];

export function HowToPlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="How to play"
      description="Six things, then you know the game."
    >
      <ol className="space-y-4">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-ink pt-1 font-display text-[17px] leading-none text-paper-raised">
              {i + 1}
            </span>
            <div>
              <p className="font-display text-[22px] uppercase leading-none">{t}</p>
              <p className="mt-1 text-[14px] leading-snug text-ink-soft">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
