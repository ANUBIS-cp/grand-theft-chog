import { displayName, getChog } from '@chog-city/data';
import type { FinishedRun, StartedRun } from '@chog-city/server';
import { makeGetawayPass, makeRaidPass } from '@chog-city/server/ticket';

/** The robber's pass into the raid room on the live server, carrying the run's setup. */
export function robberPass(run: StartedRun & { prisoner?: number }, chogId: number, loud = false): string {
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
      ...(loud ? { loud: true } : {}),
    },
  });
}

/** Out of the vault with a bag: the pass for carrying it home through the live city (stage 3). */
export function withGetaway<T extends FinishedRun>(runId: string, r: T): T & { getawayPass?: string } {
  const g = r.getaway;
  if (!g) return r;
  return {
    ...r,
    getawayPass: makeGetawayPass({
      run: runId,
      chog: g.chog,
      name: displayName(getChog(g.chog)!),
      from: g.from,
      home: g.home,
      bag: g.bag,
      tier: g.tier,
    }),
  };
}
