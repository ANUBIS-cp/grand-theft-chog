'use client';
import { useEffect, useState } from 'react';

// ?vp=1: what this phone says about its screen, for fixing layout on a phone we can't test on. Shows the sizes
// (in CSS px) of the window, the visible part, the screen, the notch insets and where the game sits.
export function ViewportProbe() {
  const [rows, setRows] = useState<[string, string][]>([]);
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const read = () => {
      const vv = window.visualViewport;
      const root = document.querySelector('.game-root')?.getBoundingClientRect();
      const ps = getComputedStyle(probe);
      setRows([
        ['window', `${innerWidth} × ${innerHeight}`],
        ['visible', vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)} at top ${Math.round(vv.offsetTop)}` : 'n/a'],
        ['screen', `${screen.width} × ${screen.height}`],
        ['page', `${document.documentElement.clientHeight} high, scrolled ${scrollY}`],
        ['notch', `top ${ps.paddingTop}, bottom ${ps.paddingBottom}`],
        ['game', root ? `top ${Math.round(root.top)}, ${Math.round(root.height)} high` : 'n/a'],
        ['browser', navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)],
      ]);
    };
    read();
    const t = setInterval(read, 500);
    return () => {
      clearInterval(t);
      probe.remove();
    };
  }, []);
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[100] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-black/85 p-3 font-mono text-[11px] leading-snug text-white">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="text-[#ffd23f]">{k}</span> {v}
        </div>
      ))}
    </div>
  );
}
