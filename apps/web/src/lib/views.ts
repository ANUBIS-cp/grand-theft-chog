import { displayName, gangOptions, getChog } from '@chog-city/data';
import {
  currentWanted,
  inJail,
  infoOf,
  levelOf,
  movesLeft,
  refresh,
  xpToNext,
  type ChogState,
} from '@chog-city/game';

/** Everything a screen needs about one Chog, refreshed to `now`. Same shape everywhere. */
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
  };
}

export type ChogView = ReturnType<typeof chogView>;
