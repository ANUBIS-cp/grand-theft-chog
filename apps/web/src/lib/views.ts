import { displayName, gangOptions, getChog, skillSources, type SkillId } from '@chog-city/data';
import {
  currentWanted,
  inJail,
  infoOf,
  levelOf,
  movesLeft,
  refresh,
  titlesOf,
  xpToNext,
  type ChogState,
} from '@chog-city/game';

/** Everything a screen needs about one Chog, refreshed to `now`. Same shape on the server and in the browser. */
export function chogView(state: ChogState, now: number) {
  const chog = getChog(state.id)!;
  const info = infoOf(chog);
  const s = refresh(state, now);
  return {
    id: chog.id,
    name: displayName(chog),
    metadataId: chog.metadataId,
    traits: chog.traits,
    skills: info.skills,
    /** Which trait gave each skill, for the "why" line on the Chog card. */
    skillFrom: Object.fromEntries(
      info.skills.map((k) => [k, skillSources(chog, k).map(([t, v]) => `${v} (${t})`)]),
    ) as Record<SkillId, string[]>,
    wildcard: info.wildcard,
    home: info.home,
    side: info.side,
    gangOptions: gangOptions(chog),
    gang: s.gang,
    gangDay: s.gangDay,
    active: s.active,
    cash: s.cash,
    xp: s.xp,
    level: levelOf(s.xp),
    xpToNext: xpToNext(s.xp),
    wanted: currentWanted(s, now),
    jailUntil: inJail(s, now) ? s.jailUntil : 0,
    movesLeft: movesLeft(s, now),
    doneToday: s.doneToday,
    crewId: s.crewId,
    revenge: s.revenge,
    stats: s.stats,
    titles: titlesOf(s.stats),
    /** The full state, so the browser can work out odds with the same rules as the server. */
    raw: s,
  };
}

export type ChogView = ReturnType<typeof chogView>;
