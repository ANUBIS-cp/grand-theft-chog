# Balance notes

The simulator (`npx tsx tools/sim/src/run.ts [days] [activeShare] [seed]`) plays the real rules with bots:
15% of all Chogs active, styles grinder / casual / crew / robber / guard, two play sessions a day,
gangs leaning toward one random district a day. Real players coordinate better than these bots.

## 8 Oct 2026, run 1 (numbers from the plan)

| What | Result | Problem |
|---|---|---|
| Turf | Suits, Lazoor, Visor held 111 of 147 district-days; 6 gangs held nothing | "Best 15 Chogs" never applied: no gang had 15 active members in one district |
| Jail | 17% of sessions found the Chog in jail | Too much waiting |
| Guards | Guard-skill Chogs earned the most (bounties beat job pay) | Too rewarding for 48 Chogs |
| Levels | Most bots at level 7–8 of 10 after 3 weeks | Nothing left to reach |

## Changes

| Number | Before | After | Why |
|---|---|---|---|
| Chogs counted per gang per district | 15 | 5 | Focus beats headcount; a small gang with 5 active Chogs can take a district |
| Jail base time | 2 h | 1 h | Less waiting (still +1 h per star) |
| Solo job jail chance on fail | 30% | 25% | Less jail |
| Crew / big job jail chance on fail | 50% / 60% | 35% / 45% | A failed crew job jailed half the crew |
| Robbery jail chance on fail | 40% | 30% | Less jail |
| Arrest bounty per star | 25 | 15 | Guards were the richest Chogs |
| Vault base odds | 45% | 55% | Big jobs succeeded 27% of the time |
| XP per level | 0/30/80/160/280/450/680/980/1360/1830 | 0/40/120/260/480/780/1180/1700/2350/3150 | Room to grow past week 3 |

## After (three seeds, 21 days)

- Solo jobs succeed ~68%, crew ~51%, big 37–49%, legal ~92%.
- 13–14% of sessions start in jail (bail is the way out; the bots only paid bail when it cost under 30% of their cash).
- Levels spread from 2 to 8, most at 3 or 6.
- Crew players earn the most (median ~3,700 cash), then grinders (~2,700), robbers (~1,500), casual (~800): teamwork pays most, robbing is fun but doesn't beat work.
- Average cash earned per skill is within about 25% across skills: no skill is useless.
- Most gangs held at least one district on some days; the big gangs still hold the most.

To check again after the closed test (Day 9) with real behaviour.
