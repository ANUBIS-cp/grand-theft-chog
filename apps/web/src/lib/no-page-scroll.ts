import { useEffect } from 'react';

// A game screen on a phone: the page itself must never pan, bounce or zoom. When an iPhone starts one of its own
// gestures it cancels every finger on the screen, so a thumb walking the Chog stopped dead the moment the other
// finger touched a card or a button, and the card could drag the whole game under the address bar. CSS
// (globals.css, .game-root) marks the screen as no-gestures; this stops the drags iPhones still start anyway,
// except inside a list that really scrolls (the chat, the gang list), and stops pinch zoom.

function scrollsInside(el: Element | null, stop: Element): boolean {
  for (let e = el; e && e !== stop; e = e.parentElement) {
    const s = getComputedStyle(e);
    const y = (s.overflowY === 'auto' || s.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 1;
    const x = (s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1;
    if (x || y) return true;
  }
  return false;
}

export function useNoPageScroll() {
  useEffect(() => {
    const root = document.documentElement;
    const move = (e: TouchEvent) => {
      if (e.touches.length > 1 || !scrollsInside(e.target as Element, root)) e.preventDefault();
    };
    const gesture = (e: Event) => e.preventDefault();
    // Fit the game to what's really visible: the part of the page the browser's bars don't cover. Some phone
    // browsers size a full-screen layer as if their bars were hidden, which put the top of the game under the
    // address bar. The page is also put back to the top if it was moved (a restored scroll, a keyboard).
    const vv = window.visualViewport;
    const fit = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      const h = vv ? vv.height : window.innerHeight;
      const top = vv ? vv.offsetTop : 0;
      root.style.setProperty('--app-h', `${Math.round(h)}px`);
      root.style.setProperty('--app-top', `${Math.round(top)}px`);
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('gesturestart', gesture);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('gesturestart', gesture);
    };
  }, []);
}
