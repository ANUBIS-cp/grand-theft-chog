import { COLLECTION } from '@chog-city/data';
import { BURN_PRICE, CHOG_TOKEN } from '@chog-city/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'How it’s fair · Chog World',
  description: 'How Chog World checks every robbery, every getaway and every $CHOG burn.',
};

const scan = (a: string) => `https://monadscan.com/address/${a}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** How the game keeps itself honest, in plain words, for players and judges. */
export default function FairPage() {
  const items: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Your Chog is read from Monad',
      body: (
        <>
          Who owns which Chog comes from the Chog Genesis contract (
          <a href={scan(COLLECTION.contract)} className="underline underline-offset-2">
            {short(COLLECTION.contract)}
          </a>
          ), followed live: sell a Chog and it walks out of your wallet and into the buyer’s. Its traits come
          from the collection’s own metadata, checked against the contract, and decide its gang and its
          powers.
        </>
      ),
    },
    {
      title: 'The record belongs to the token',
      body: 'Cash stolen, escapes, busts and catches are kept against the Chog itself, not your wallet. A Chog sold keeps its history, and its new owner plays on with it.',
    },
    {
      title: 'Every robbery is played back by the server',
      body: 'The vault plays the same way every time from the run’s own seed. Your phone sends only your key presses; the server replays them from the start and works out what really happened: what you grabbed, whether you got out, who caught you. A changed browser can send any result it likes, and the server ignores it.',
    },
    {
      title: 'The run home is refereed live',
      body: 'Out of the vault with a bag, you carry it through the live city. The live server moves the police, checks every step you take, and signs the result it sends to the game, so the cash lands in the right vault. If it ever fails, the bag is banked for you a few minutes later.',
    },
    {
      title: 'Anyone can watch any robbery',
      body: (
        <>
          Every robbery has a replay: the break-in, the vault and the run home, move by move, exactly as the
          server settled it. Share the link and anyone can see how it went. Each day’s biggest haul is on the{' '}
          <Link href="/recap" className="underline underline-offset-2">
            daily recap
          </Link>
          .
        </>
      ),
    },
    {
      title: '$CHOG is burned from your own wallet',
      body: (
        <>
          Bail ({BURN_PRICE.bail}), a Wanted poster ({BURN_PRICE.poster}) and a gang banner (
          {BURN_PRICE.banner}) are paid by burning $CHOG (
          <a href={scan(CHOG_TOKEN)} className="underline underline-offset-2">
            {short(CHOG_TOKEN)}
          </a>
          ) from your own wallet. The game never holds your tokens: it reads your burn on Monad (from you, to
          the zero address, the right amount, in the last hour) and counts each burn once.
        </>
      ),
    },
    {
      title: 'Game cash is just game cash',
      body: 'The cash in the gang vaults has no value outside the game and can’t be withdrawn. Nothing pays out tokens, so nothing here is gambling.',
    },
  ];
  return (
    <PageShell>
      <h1 className="font-display text-[40px] leading-[1.05]">How it’s fair</h1>
      <p className="mt-2 max-w-[560px] text-[16px] text-label-2">
        Chog World is a game about stealing, so it has to be hard to cheat. This is how every robbery, every
        run home and every $CHOG burn is checked.
      </p>
      <ol className="mt-6 space-y-3">
        {items.map((it, i) => (
          <li key={it.title} className="glass flex gap-4 rounded-[22px] p-4 sm:p-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[18px]">
              {i + 1}
            </span>
            <div>
              <h2 className="text-[17px] font-semibold">{it.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-label-2">{it.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 text-[14px] font-semibold">
        <Link href="/" className="underline underline-offset-2">
          Into the city
        </Link>
      </div>
    </PageShell>
  );
}
