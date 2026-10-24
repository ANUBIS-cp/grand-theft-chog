# The live hunts: Pumpkin Rush, Most Wanted, the Blood Moon

Built 24 Oct 2026 for the judging week. The live server (apps/live/src/hunts.ts) is the referee and reports to the web app, signed, like getaways; the money side is packages/server/src/hunts.ts.

## Blood Moon (27-31 Oct)

Every night of Halloween week, 18:00-19:00 UTC (the daily reset, when most players are on): every vault is haunted, hauls pay 50% more, and pumpkins pop up all over the city. One hour at a set time puts players in the city together, which is when live raids and races happen. A countdown pill under the map shows the next one (from before the week starts), the city goes red while it's up. Dates: packages/game/src/season.ts.

## Pumpkin Rush (Halloween week)

Pumpkins full of cash on the street; the first Chog of a gang to reach one carries the cash to its gang's vault.

- Blood Moon: up to 5 at once, a new one every 30-55 s, $300-$500, 12% are gold ($1,500); each lasts 2.5 min.
- The rest of the week: one at a time, every 5-10 min, $200-$400 (5% gold), lasting 10 min.
- Never within 3 tiles of a door. The web app checks the Chog's gang, caps a pumpkin at $1,500 and pays each id once (`pumpkins` table). This is new money, so it's small next to upkeep.
- Drawn as a Chog-o'-lantern that pops out of the street and hops, with a column of light and its price over it; off screen, an arrow at the edge points to the nearest one (apps/web/src/components/city/hunts.ts).

## Most Wanted (every day)

- Each game day the Chog that carried the most home the day before (at least $2,000) is Most Wanted. Bounty: 15% of what it stole, $1,000-$6,000, paid by its own gang. Worked out once and kept (`most_wanted` table).
- While the bounty stands, its hauls pay 25% more (so it's worth playing, not hiding).
- In the city a red target turns under it and a MOST WANTED plate with the bounty floats over it; rivals get an edge arrow to it.
- A Chog of any other gang that touches it claims the bounty (up to what the vault has): the cash moves gang to gang, the tagger gets a catch, and it goes to jail for 30 minutes. Safe within 4 tiles of its own gang's door, for 8 s after walking into the city, and while carrying a bag home. Once a day.

## Telegram

`/api/announcements` lists news with ids, each only for a short window: the Blood Moon in 15 minutes, rising, and set (with the pumpkin tally), today's Most Wanted (first 3 hours of the day) and their capture (30 minutes). The chog bot (`~/monad-mystic/bot/cogs/chogworld.js` on the chog VM, `checkNews`) posts each id once, as plain text.

## Local testing

`PUMPKINS=always` on the live server keeps pumpkins out all the time; `?bloodmoon=1` (localhost only) shows a Blood Moon; `?halloween=1` the Halloween city.
