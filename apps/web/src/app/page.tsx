import { CHOGS, displayName } from '@chog-city/data';
import { chogImage } from '@/lib/images';

export default function Home() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink py-6">
        <div>
          <h1 className="font-display text-6xl leading-[0.85] tracking-tight sm:text-8xl">Chog City</h1>
          <p className="mt-3 max-w-md text-base text-ink-soft">
            All {CHOGS.length.toLocaleString('en-US')} Chogs live here. Traits are skills, gangs fight for
            turf, and every Chog keeps its record. The city opens soon.
          </p>
        </div>
        <p className="rounded-sm border-2 border-ink bg-pink px-3 py-1 font-mono text-sm text-ink shadow-hard-sm">
          Building · Chogathon 2026
        </p>
      </header>

      <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 sm:gap-3">
        {CHOGS.map((c) => (
          <li key={c.id}>
            <figure className="overflow-hidden rounded-sm border-2 border-ink bg-paper-raised">
              <img
                src={chogImage(c.id, 256)}
                width={256}
                height={256}
                alt={displayName(c)}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full"
              />
              <figcaption className="truncate border-t-2 border-ink px-1.5 py-0.5 font-mono text-[11px]">
                {c.title ?? `#${c.metadataId}`}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </main>
  );
}
