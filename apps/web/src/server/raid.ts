import { displayName, getChog } from '@chog-city/data';
import type { StartedRun } from '@chog-city/server';
import { makeRaidPass } from '@chog-city/server/ticket';

/** The robber's pass into the raid room on the live server, carrying the run's setup. */
export function robberPass(run: StartedRun & { prisoner?: number }, chogId: number): string {
  return makeRaidPass({
    role: 'rob',
    run: run.id,
    chog: chogId,
    name: displayName(getChog(chogId)!),
    setup: {
      map: run.vault,
      tier: run.tier,
      breakout: run.prisoner !== undefined,
      powers: run.powers,
      guards: run.guards,
      target: run.target,
    },
  });
}
