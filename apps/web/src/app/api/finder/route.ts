import { SKILL_IDS, type SkillId } from '@chog-city/data';
import { finder } from '@chog-city/server';
import { db } from '@/server/db';
import { error, json } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Players' Chogs with a skill, free to join a crew. */
export async function GET(req: Request) {
  const skill = new URL(req.url).searchParams.get('skill') as SkillId | null;
  if (!skill || !SKILL_IDS.includes(skill)) return error('BAD_REQUEST');
  return json({ chogs: await finder(await db(), skill, Date.now()) });
}
