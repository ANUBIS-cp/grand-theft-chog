import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';

/** The frame for the pages outside the city: a glass bar with the name and a way back, on the dark night. */
export function PageShell({ children, tint }: { children: React.ReactNode; tint?: string }) {
  return (
    <main
      className="min-h-dvh bg-[#0b0918] text-white"
      style={
        tint
          ? { background: `radial-gradient(120% 60% at 50% -10%, ${tint}40, transparent 60%), #0b0918` }
          : undefined
      }
    >
      <header className="sticky top-0 z-20 px-3 pt-3">
        <div className="glass mx-auto flex max-w-[980px] items-center justify-between rounded-full py-1.5 pl-2 pr-4">
          <Link
            href="/"
            className="press flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-2 pr-3 text-[14px] font-semibold hover:bg-white/15"
          >
            <ArrowLeft size={14} weight="bold" /> Back to the city
          </Link>
          <Link href="/" className="font-display text-[18px]">
            Chog World
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-[980px] px-4 pb-16 pt-6">{children}</div>
    </main>
  );
}
