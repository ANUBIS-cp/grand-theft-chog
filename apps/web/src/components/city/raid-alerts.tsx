'use client';

import { BellRinging, BellSlash, Export, PlusSquare } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

// Raid alerts: a ping on your phone when someone is robbing your gang's vault. On an iPhone this only works
// once the site is on the home screen (Apple lets installed web apps send notifications, not Safari tabs), so
// that case shows the three steps instead of a button that can't work.

type State = 'loading' | 'install' | 'unsupported' | 'blocked' | 'off' | 'on' | 'no-server';

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function RaidAlerts({ gang }: { gang: string }) {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(isIos() && !installed() ? 'install' : 'unsupported');
        return;
      }
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const { key } = (await (await fetch('/api/push')).json()) as { key: string | null };
      if (!key) return setState('no-server');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const ok = await Notification.requestPermission();
      if (ok !== 'granted') return setState(ok === 'denied' ? 'blocked' : 'off');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) throw new Error('save');
      setState('on');
      setNote('On. Send yourself a test to see what one looks like.');
    } catch {
      setNote('That didn’t work. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    const r = await fetch('/api/push/test', { method: 'POST' }).catch(() => null);
    const body = r ? await r.json().catch(() => null) : null;
    setNote(body?.sent ? 'Sent. It should show up in a few seconds.' : 'Couldn’t send one just now. Try again in a minute.');
    setBusy(false);
  }

  if (state === 'loading') return null;
  return (
    <div className="mt-5 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-[16px] font-semibold">
        {state === 'on' ? <BellRinging size={20} weight="fill" className="text-[#ffd23f]" /> : <BellSlash size={20} weight="fill" className="text-white/60" />}
        Raid alerts
        {state === 'on' && <span className="rounded-full bg-[#1f3a2a] px-2 py-0.5 text-[12px] text-[#7dffa8]">On</span>}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/75">
        Get a ping on your phone when someone is robbing {gang}’s vault, so you can jump in and guard it.
      </p>

      {state === 'install' && (
        <ol className="mt-3 flex flex-col gap-2 text-[14px] text-white/85">
          <li className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[12px] font-bold">1</span>
            Tap <Export size={18} className="inline" /> Share at the bottom of Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[12px] font-bold">2</span>
            Choose <PlusSquare size={18} className="inline" /> Add to Home Screen
          </li>
          <li className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[12px] font-bold">3</span>
            Open Grand Theft Chog from your home screen and turn this on there
          </li>
        </ol>
      )}
      {state === 'unsupported' && <p className="mt-3 text-[13px] text-white/60">This browser can’t show alerts. Try Chrome on Android, or Safari on iPhone.</p>}
      {state === 'blocked' && (
        <p className="mt-3 text-[13px] text-white/60">Notifications are blocked for this site. Allow them in your phone’s settings for Grand Theft Chog, then come back here.</p>
      )}
      {state === 'no-server' && <p className="mt-3 text-[13px] text-white/60">Alerts aren’t ready on our side yet. Check back soon.</p>}
      {(state === 'off' || state === 'on') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {state === 'off' ? (
            <button disabled={busy} onClick={() => void turnOn()} className={cn('btn btn-gold btn-sm press', busy && 'opacity-60')}>
              <span>Turn on raid alerts</span>
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={() => void test()} className={cn('btn btn-glass btn-sm press', busy && 'opacity-60')}>
                <span>Send me a test alert</span>
              </button>
              <button disabled={busy} onClick={() => void turnOff()} className="px-2 text-[13px] text-white/55 hover:text-white">
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {note && <p className="mt-2 text-[13px] text-white/70">{note}</p>}
    </div>
  );
}
