'use client';
import { SKILLS, type SkillId } from '@chog-city/data';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChogPortrait } from '@/components/chog-portrait';
import { GangTag } from '@/components/gang-tag';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { api, type TargetRow } from '@/lib/api';
import { nameOf } from '@/lib/describe';
import { ago } from '@/lib/time';

/** Players whose Chogs have the skill a crew is missing, plus an invite to paste in Discord. */
export function FindSheet({
  skill,
  jobName,
  link,
  onClose,
}: {
  skill: SkillId | null;
  jobName: string;
  link: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<(TargetRow & { lastSeen: number })[] | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!skill) return;
    setRows(null);
    api
      .finder(skill)
      .then((r) => setRows(r.chogs))
      .catch(() => setRows([]));
  }, [skill]);
  if (!skill) return null;
  const invite = `Need a ${SKILLS[skill].name} Chog for "${jobName}" in Chog City. Join my crew: ${link}`;
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Find a ${SKILLS[skill].name} Chog`}
      description="Players whose Chogs have this skill and are free right now."
    >
      <div className="rounded-[8px] border-2 border-ink bg-white p-3">
        <p className="text-[13px] text-ink-soft">Paste this in Discord or Telegram:</p>
        <p className="mt-1 break-words text-[14px] font-semibold">{invite}</p>
        <Button
          size="sm"
          className="mt-3"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(invite);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy invite'}
        </Button>
      </div>
      <h3 className="mb-2 mt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
        Active players with {SKILLS[skill].name}
      </h3>
      {rows === null ? (
        <div className="h-24 animate-pulse rounded-[8px] bg-ink-faint" />
      ) : rows.length === 0 ? (
        <p className="text-[14px] text-ink-soft">
          Nobody with this skill is free right now. Share the invite and check back.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <ChogPortrait id={r.id} name={nameOf(r.id)} size="xs" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/chog/${r.id}`}
                  className="text-[14px] font-semibold underline-offset-4 hover:underline"
                >
                  {nameOf(r.id)}
                </Link>
                <p className="text-[12px] text-ink-soft">Last played {ago(r.lastSeen, Date.now())}</p>
              </div>
              {r.gang && <GangTag gang={r.gang} size="sm" tilt={false} />}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
