# Chog City: build plan

> **Revised again 8 Oct 2026 (after checkpoint 2c):** the user played the gang war: it works, but "the game is the
> whole idea" reads as a small build. Chosen: **a live city**. You walk around a night-time city as your Chog and
> see every other holder walking around live. Each gang has a building; walk to a rival's door to rob its vault
> (the heist); walk into your own to set up your vault's defences with stolen cash. Caught Chogs sit in a jail
> everyone can see, and friends can break them out. Every robbery can be watched as a replay. Visitors without a
> Chog walk in as a guest and can do practice runs. Parts of this plan about jobs, crews, districts, turf, moves
> and the nightly turf flip are obsolete. The heist rules (vault cash, jail, fines, once a day, revenge) still hold.
> Days, in order (Day 1 = 9 Oct):
> - Day 1: city map + renderer (night streets, 16 gang buildings, jail, plaza, training warehouse), walking (keys, drag, click-to-walk), minimap, door cards, wandering Chogs.
> - Day 2: live server (WebSocket, signed tickets from the web app, 10 updates a second), other holders live, guests, Chog cards on click, emotes; deploy behind Caddy.
> - Day 3: city <-> heist (rob from the door, come back to the street), your gang's building inside (members, vault, robberies), live alarm on robbed buildings, jail with jailed Chogs.
> - Day 4: gang defences: spend vault cash on guards, cameras and lasers in fixed spots; the server builds each vault from its gang's defences.
> - Day 5: replays of every robbery + share; jail break-out (a jail heist).
> - Day 6: vault layouts 3 and 4, guided first run in the training warehouse.
> - Day 7: polish, sound, phones; Checkpoint 3 with the user.
> - Day 8: $CHOG on-chain (bail, building looks), only with the user's OK. Day 9: closed test with holders.
> - Day 10: fixes, load test (200 bots), performance. Day 11: public launch (wipe test data first).
> - Day 12: live fixes, events. Day 13: video, README. Day 14: submit.

Solo entry for Chogathon 2026. Version 1, written 8 October 2026, before the hackathon starts.

The plan has nine parts. Part 1 is the short version. The rest is the spec I build from.

1. The short version
2. Game rules
3. Design
4. Tech
5. Day-by-day plan
6. Launch, judging week and submission
7. Risks
8. What gets cut first
9. Application text

Appendices: A skills, B gangs, C districts, D first jobs, E facts checked and where.

---

## 1. The short version

### What it is

A browser game, for phone and desktop, where all 1,969 Chog NFTs live in one city.

- **Traits are skills.**
  - Laser eyes can cut a safe.
  - A Knife makes a robbery safer.
  - A Tuxedo can talk its way into a gala.
  - A Squid Game Guard outfit makes your Chog a guard who can arrest wanted Chogs.
- **Every Chog reps a gang, and its traits decide which ones it can join.** These are the gangs people already put in their Discord names: MCGA Gang, Lazoor Gang, Gangstas, Robbers and more.
- **Every day each district of the city posts jobs.**
  - Small jobs you do alone, and the result shows in seconds.
  - Big jobs need a crew with specific skills. If the bank job needs Laser and your Chog has none, you need a holder whose Chog does.
- **Jobs earn cash for your Chog and turf points for your gang.** Every night the gang with the most points in each district takes it over, and its tag goes up on the city map.
- **Crime has risk.** Your Chog can pick up Wanted stars, get robbed, get arrested and sit in jail for a few hours, unless someone bails it out.
- **Everything goes on the Chog's record:** level, cash, jobs, arrests, crews and rivals.
  - The record belongs to the NFT. Sell the Chog and the buyer gets the record.
  - A Chog with a famous record is worth more than the same Chog with none.
- **$CHOG is burned** for three things: getting out of jail instantly, putting a Wanted poster on a Chog, and hanging your gang's banner on the map.

### Why it can win

| Judged on | What scores it here |
|---|---|
| Novelty (30%) | Traits work as job skills, so holders need each other's Chogs to pull the big jobs. Gangs come from traits, which the community already does by hand. The record belongs to the token and changes what a Chog is worth. |
| Fun (20%) | Results in seconds, crew jobs, robbing your friends, getting revenge, and the turf map changing every night. |
| Retention (20%) | Moves refill every day, turf flips every night, crew invites, jail timers, levels and a record that keeps growing. |
| Clarity (15%) | One job board, plain words, and the odds shown before every move. |
| Execution (15%) | Fast on phones, checkable dice, tested rules and a careful design. |
| NFT must be essential | No Chog, no player. Traits decide what it can do, which gang it joins and where it lives. The record is tied to the token ID. |
| $CHOG bonus | Real on-chain burns through a small contract, with a public "$CHOG burned" counter. |

### What the community already gives us

- Discord names like "MCGA gng", "lazoor gang", "gangsta" and "robber". The community has already sorted itself into gangs by trait. The game makes that real.
- 1,969 Chogs held by 1,012 wallets. 721 wallets own exactly one, and the two biggest hold 68 and 63 (read on-chain on 8 Oct).

### Rules that keep it from looking like AI slop

1. **No AI-written text in the game.** Every job, result line and daily-recap line is written by hand. I draft them, you edit them, and they use the community's own words.
2. **The Chog art is the hero on every screen.** No stock icons as decoration and no generated images.
3. **One visual style, taken from the Chog art and chog.xyz:** beige paper, black ink outlines, hot pink, Koulen headings and paper grain.
4. **Every screen has a designed empty, loading and error state,** and is checked on a real phone width before it ships.
5. **Plain words only.** If a label doesn't say what the button does, it gets renamed.

### Timeline at a glance

Dates assume the hackathon starts on Thursday 9 October. The site's countdown gives no date, so the days are numbered and can shift.

| When | What |
|---|---|
| Before start (now) | You submit the application, check gang names with the community, ask the Chog team for a Discord channel and buy a domain. I write no code before the start. |
| Week 1 (Days 1–7) | Data, game engine, server, design system and all screens. Playable with test wallets by Day 7. |
| Week 2 (Days 8–14) | Contracts and $CHOG. Closed test with 10–20 holders on Day 9, public launch on Day 11, submission package on Day 13, submit by Day 14. |
| Judging week | Left vs Right election and Halloween week, so players keep coming back while the judges look. |

### Who does what

- **Me:** all code, tests, design implementation, deploys, monitoring, and first drafts of all game text.
- **You:**
  - the community: gang names, recruiting playtesters, the Chog team contacts;
  - decisions and design sign-off at three checkpoints;
  - editing the game text so it sounds like Chog Discord, not like a robot;
  - recording the demo video, using my script and a demo set up for it.

### Decisions I need from you (my default in brackets)

1. **Gang list and names.** [Appendix B, checked with the community before Day 3.]
2. **Daily reset time.** Moves refill and turf flips at the same moment. [18:00 UTC: evening in Europe, midday in the US.]
3. **Can Chogs whose owners haven't joined be robbed?** [Yes, once a day for a small amount. A holder who joins late sees "your Chog was robbed 4 times while you were away", which pulls people in.]
4. **$CHOG prices.** DECIDED 8 Oct: cents, not dollars (10,000 CHOG is about $33, and people won't pay $1 in a new game). Bail 30 (~$0.10), Wanted poster 60 (~$0.20), gang banner 150 (~$0.50). Adjustable from the admin page.
5. **Domain.** DECIDED 8 Oct: a free sslip.io address first, then DuckDNS (free). Buying a domain is decided later.
6. **Server.** [New e2-medium VM, not spot, in us-east4, about $25–35 a month (estimate). I confirm the price with you before creating it.]
7. **Repo visibility.** [Private while building, public at submission.]
8. **A new game wallet** that signs the daily on-chain record. [About 5 MON from you. It holds nothing else.]

---

## 2. Game rules (v1)

All numbers here are starting values. Day 3's balance simulator tunes them before anyone plays.

### 2.1 The words used in the game

| Word | Means |
|---|---|
| Skills | What your Chog can do. They come from its traits (Appendix A). |
| Gang | The team your Chog plays for. Its traits decide which gangs it can join (Appendix B). |
| Free agent | A Chog with no gang trait. It can join any gang. |
| District | One of the city's 8 areas. Each Chog's home district comes from its Background trait (Appendix C). |
| Jobs | Things to do in a district. Solo, crew, big or legal. |
| Crew | 2–5 Chogs doing one job together. |
| Moves | How many things your Chog can do today. 5 a day. |
| Cash | In-game money. It has no real value and can't be withdrawn. |
| Wanted stars | 0–5. Crimes add stars. Guards can arrest Chogs with 3 or more. |
| Jail | Your Chog can't make moves until it's out. |
| Bail | Getting a Chog out of jail early. |
| Turf | Which gang controls a district. |
| Level | 1–10. Goes up with jobs and unlocks bigger ones. |
| Record | Everything the Chog has done. It belongs to the NFT. |

### 2.2 Your Chog

- **Skills come from traits.**
  - Every normal Chog has at least one, and the average is 2.7.
  - The 10 Legendary 1:1 Chogs have no normal traits, so they get a special rule: each counts as any one skill per job.
- **Gang.** You pick one gang from the gangs your Chog's traits allow.
  - The 456 Chogs with no gang trait are free agents and can join any gang, which gives gangs a reason to recruit them.
  - Legendary 1:1s can join any gang.
  - Anyone can switch gang once every 7 days.
- **Home district** comes from the Background trait.
  - It gives +5% odds on jobs there.
  - Legendary 1:1s count every district as home.
- **Starting state:** 100 cash, level 1, no Wanted stars, 5 moves.
- **All 1,969 Chogs are in the city from day one,** even if their owner hasn't joined yet. They show "owner hasn't played yet" on their page.

### 2.3 Moves

- Each Chog gets 5 moves a day. They refill at the daily reset.
- Moves belong to the Chog, not the wallet. Moving or selling a Chog doesn't give it fresh moves.
- A holder with several Chogs plays each one separately.

### 2.4 Jobs

| Type | Chogs | Level | Result | Pay (cash) | Risk |
|---|---|---|---|---|---|
| Legal | 1 | 1 | Seconds | 15–30 | None. Removes one Wanted star. |
| Solo | 1 | 1 | Seconds | 30–60 | +1 star. Failing can mean 2 hours of jail. |
| Crew | 2–4 | 2 | When the crew is full | 200–1,000, split | +1–2 stars. Failing can jail each member. |
| Big | 5 | 5 | When the crew is full | 1,500+, split | +2 stars. Longer jail. |

- **Every job card shows:**
  - the skill each slot needs, and skills that help;
  - your odds, with the breakdown;
  - the pay, the turf points, the stars it adds and the jail time if it fails.
- **Odds:**
  `base + 5% for each helpful skill in the crew (max +20%) + 1% per level + 5% in your home district + 5% if your gang holds the district − 5% per Wanted star`, kept between 5% and 95%.
- **Crew jobs:**
  - A leader opens the job and the slots fill in three ways: an invite link, a Discord or Telegram ping, or the public "Open crews" list, where any player whose Chog has the needed skill can join.
  - The job runs the moment the last slot fills.
  - If it never fills, it expires at the reset and everyone gets their move back.
  - Pay is split evenly.
  - A Chog can be in one crew at a time.
- **Job board:** each district posts 4–6 jobs a day from its job list (Appendix D). The day's seed picks them, so everyone sees the same board.

### 2.5 Robbing, revenge and arrests

- **Rob (1 move):** pick any Chog.
  - Odds start at 50%.
  - Your skills add: Muscle +10%, Blade +15%, Stealth +5%.
  - The target's skills subtract: Muscle 10%, Guard 15%, Blade 10%.
  - Win: take 10% of its cash, up to 200.
  - Lose: +2 Wanted stars and a 40% chance of jail.
- **Limits:**
  - A Chog can be robbed at most 3 times a day.
  - A Chog whose owner hasn't played can be robbed once a day, only from its starting 100 cash.
- **Revenge:** if you get robbed, you get one free rob back at that Chog within 24 hours, with +10% odds. It costs no move.
- **Arrest (Guard skill only, 1 move):**
  - The target needs 3 or more Wanted stars.
  - Win: the target goes to jail, and you get a bounty of 25 cash per star, plus any Wanted-poster bounty on it.

### 2.6 Wanted stars and jail

- **Stars:**
  - Each job shows how many stars it adds. The maximum is 5.
  - One star drops every 6 hours, and each legal job drops one.
- **Jail:** comes from a failed job or an arrest.
  - Time is 2 hours plus 1 hour per star.
  - A jailed Chog can't make moves.
- **Ways out:**
  - wait;
  - anyone pays bail in cash (50 cash per hour left);
  - burn $CHOG for instant release;
  - a Jailbreak crew job (Jailbird + Runner + Muscle) frees one Chog.

### 2.7 Levels

- Jobs give XP, and levels run from 1 to 10.
- Level 2 unlocks crew jobs and level 5 unlocks big jobs.
- Each level adds 1% to odds.
- The level is part of the record and goes with the NFT.

### 2.8 Gang turf

- **Points:** every job done in a district gives your gang turf points there. Legal 1, solo 2–3, crew 5–10, big 15.
- **Best 15 rule:** only your gang's best 15 Chogs per district per day count. A big gang can't win on headcount alone, and a small active gang can take a district.
- **Nightly flip:** at the daily reset, each district goes to the gang with the most points there. In a tie, the current holder keeps it.
- **Holding a district gives:**
  - +5% odds and +10% pay for your gang's Chogs there;
  - your tag on the map;
  - a line in the daily recap.
- **Season title:** the gang that held the most district-days.

### 2.9 Record

- **What's stored, per token:**
  - level, cash now and all-time, jobs done by type, biggest job;
  - robberies won, lost and suffered;
  - arrests and jail hours;
  - gangs repped, top crewmates and top rival;
  - titles earned and how many owners it has had.
- **Example titles:**
  - "Vault Cracker": 3 bank jobs;
  - "Untouchable": 20 jobs without an arrest;
  - "Jailbreaker";
  - "Most Wanted": 5 stars held for 24 hours;
  - "Turf Boss": the gang's top scorer for a week.
- **Where it shows:**
  - a public page for every Chog;
  - a share image for X;
  - a public JSON address any other app can read.
- **Proof:** each night the game publishes one hash (a Merkle root) of every Chog's record on Monad. Anyone can check a Chog's record against it.

### 2.10 $CHOG

Everything is burned and nothing is paid out.

| Use | Starting price | What it does |
|---|---:|---|
| Instant bail | 30 (~$0.10) | Out of jail now. |
| Wanted poster | 60 (~$0.20) | A poster on the target Chog for 24 hours, on the map and in the recap. Picked from a list of ready-made lines, so no free text to moderate. Adds a 100-cash city bounty for guards, which only matters if the target already has 3+ stars. |
| Gang banner | 150 (~$0.50) | Your gang's banner on the map for 24 hours, and a mention in the recap. |

- Any wallet can do these, even without a Chog. This is how non-holders take part.
- A public counter shows the total "$CHOG burned in Chog City".
- In-game cash has no real value, can't be withdrawn, and the game pays out no $CHOG, so it isn't gambling. A short terms page says so.

### 2.11 Events in judging week

These are behind switches and are the first things cut if time runs short.

- **Left vs Right election (3 days):**
  - Every job counts as a vote for your Chog's Side trait.
  - Score = votes ÷ active Chogs on that side. Left has 650 Chogs and Right has 1,309, so headcount can't decide it.
  - The winning side votes on one rule for the next 3 days: double turf points, half-price bail, or double bounty for guards.
- **Halloween week (to 31 October):**
  - The Radioactive Zone opens.
  - Undead (the 60 Skull Chogs), Toxic (the 30 Radioactive Chogs) and Magic get their own jobs.
  - Halloween night has double turf points.

### 2.12 Demo city for visitors

- A separate copy of the game with 12 test Chogs and a faster clock.
- Plainly labelled "Demo city, not the real game".
- Judges without a Chog can try every feature. The real city needs a Chog.

---

## 3. Design

### 3.1 The look

- **Sources.**
  - The Chog art: thick black outlines, flat colour, paper grain, close-up portraits.
  - chog.xyz: beige `#D8D6C7` background, black text, hot pink `#D83E7E`, Koulen headings, and a street-wall illustration with a chalk Chog doodle.
- **The idea: the city at street level.**
  - Jobs are posters pinned to a wall.
  - Results are rubber stamps.
  - Turf is a gang tag sprayed on a district.
  - Districts have street-name plates.
- **Colours.**
  - Base: paper, raised paper, ink, ink at 60%, pink (main actions), night navy (dark mode).
  - Status: cash green, jail red, Wanted amber.
  - Districts: 8 colours sampled from the real Background colours in the art.
  - Gangs: one colour each.
- **Type.**
  - Koulen for headings and big numbers.
  - Archivo for interface text.
  - JetBrains Mono for odds, timers and dice rolls.
- **Shapes.** 2 px ink outlines, small corners (4–6 px), hard offset shadows. No blur, no gradients, no glass, no glow.
- **Texture.** Light paper grain, like the NFT images.
- **Icons.**
  - One interface set (Phosphor, Bold).
  - 17 custom skill badges drawn in the same thick-outline style: knife, laser, mask, bow tie, coin, visor, wizard hat, crown, whistle, stripes, sneaker, clown nose, pitchfork, heart, skull, radiation sign and fist.
- **Motion.** Only where it tells you something:
  - the result stamp;
  - cash counting up;
  - a tag spraying onto a district;
  - crew slots filling.

  Transitions take 150–250 ms and turn off when the phone asks for reduced motion.
- **Sound.** Off by default: a stamp, cash and a siren, all free-licence files.

### 3.2 Screens

| Screen | What's on it |
|---|---|
| Landing | The live city map with turf colours, a ticker of what just happened, "Connect wallet to play your Chog" and "Look around first". |
| First minute | See 3.3. |
| City map | The 8 districts in their colours with the holding gang's tag and live dots for moves happening now. Tap a district to see its jobs. |
| Job board | Job posters with slots, skill badges, your odds, pay, turf points and risk. Filter: "jobs my Chog can do". |
| Result | Stamp (DONE, BUSTED or GOT AWAY), the dice roll vs the number needed, cash and star changes, the record line added, and a share button. |
| Crew room | Slots with the skill each needs, filled with Chog portraits. Invite link, "find Chogs with this skill" (with when the owner last played), a countdown, and leave/start. |
| My Chogs | Every Chog in the wallet: moves left, jail timer, stars, cash, level. Switch between them in one tap. |
| Chog page (public) | Big portrait, traits as skill badges, gang, home district, level, cash, stars, titles, a timeline of what it did, and how many owners it has had. Buttons for Rob, Invite to crew and Post Wanted poster. |
| Gangs | Standings, districts held, active members, top scorers. Each gang has its own page. |
| Daily recap | "Yesterday in Chog City": turf changes, biggest job, most robbed, arrests, posters. Has a share image. |
| Jail | Timer, the bail options and "Ask your crew for a Jailbreak". |
| Settings | Linked wallets (play from a hot wallet), Discord/Telegram link, notifications, sound. |
| Verify | Pick a day and recompute every roll from the published seed. |
| Admin (private) | Players, moves, crews, retention, burns; job board override; recap preview before it posts. |

### 3.3 The first minute

1. Connect a wallet using Reown AppKit, the same wallet window chog.xyz uses. Sign one message. No gas.
2. "We found 3 Chogs." Pick one.
3. Its card shows its skills, the gangs it can join and its home district. Pick a gang.
4. First job: a solo job in its home district, with the odds shown. The stamp comes down.
5. The city map shows your gang's tag and "Moves reset in 9h 12m".

Target: from connecting to the first result in under 60 seconds on a phone, with no help.

### 3.4 Quality checklist

Every screen passes this before it ships:

- [ ] no gradients, glass, glow or blurred shadows
- [ ] no emoji in interface text
- [ ] only our colour tokens (no default Tailwind slate, indigo and so on)
- [ ] no generic "big title + 3 feature cards" layout
- [ ] Chog art visible on the screen
- [ ] tested with real data: long names, zero, huge numbers, 1 Chog and 60 Chogs
- [ ] empty, loading and error states designed
- [ ] works at 360 px wide with no sideways scroll
- [ ] text contrast passes WCAG AA (pink is a fill behind black text, never pink text on beige)
- [ ] every number has a label
- [ ] read aloud, a Chog holder understands it the first time

### 3.5 Design checkpoints with you

- **Day 5:** the style page (`/design`) with every component, on your phone.
- **Day 7:** every main screen with test data.
- **Day 10:** after the playtest fixes.

You approve or veto at each one, and nothing moves past a veto.

---

## 4. Tech

### 4.1 Stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language, with types shared from the game rules to the screens. |
| Web app | Next.js (latest stable on Day 1, pinned) + React | Server-rendered public pages (Chog pages, recaps) and share images. |
| Styling | Tailwind CSS v4 with our own tokens only | Speed without the default look. |
| Building blocks | Radix primitives (unstyled) | Accessible dialogs, menus and tabs. |
| Motion | Motion (formerly Framer Motion) | Stamp, counters, slots. |
| Wallet | wagmi + viem + Reown AppKit | Same wallet window as chog.xyz. |
| Login | Sign-In With Ethereum + httpOnly cookie | One signature, no gas. |
| Database | Postgres 16 + Drizzle | Transactions and row locks for moves, crews and robberies. |
| Live updates | Server-Sent Events + Postgres LISTEN/NOTIFY | No extra servers. |
| Background work | One Node worker under systemd | Chain watcher, nightly flip, on-chain posts, recap, Discord/Telegram posts. |
| Contracts | Solidity + Foundry | Tested on a Monad mainnet fork with the real $CHOG. |
| Hosting | New non-spot GCP VM + Caddy (HTTPS, Let's Encrypt) on a DuckDNS/sslip.io name | Free name now; Cloudflare only if a real domain is bought later. |
| Errors | Sentry (free tier) | Alerts also go to your Telegram. |
| Tests | Vitest, fast-check, Playwright, k6, Foundry | See 4.12. |

### 4.2 Repo layout

One repo (`ANUBIS-cp/chog-city`), using pnpm workspaces.

```
apps/web        Next.js app: pages, API, live feed, share images
apps/worker     chain watcher, nightly flip, on-chain posts, recap, bot posts
packages/game   the rules, pure functions with no database or network
packages/data   skills, gangs, districts, jobs and all game text, as reviewed data files
packages/db     schema and migrations
contracts       ChogCityLedger, ChogCityBurn, Foundry tests
tools/sim       balance simulator
tools/images    image cache, resize and hash check
docs            this plan, balance notes, the submission write-up
```

### 4.3 How a move works

1. The phone sends `POST /api/move` with the Chog, the action and the target.
2. The server checks that the logged-in wallet controls that Chog, as owner or approved player wallet. It uses the ownership table the chain watcher keeps, and re-checks on-chain if the entry is older than 30 seconds.
3. In one database transaction, with the Chog rows locked:
   1. check moves, jail, level and slot rules;
   2. roll;
   3. apply the result;
   4. write an event row.
4. Commit, send the event to everyone on the live feed, and reply with the result, the odds breakdown and the roll.

The event table is append-only and is the source of truth. Every night a check rebuilds every Chog's state from the events and alerts if anything differs.

### 4.4 Fair dice

- At each daily reset, the game posts the hash of a secret seed for the new day on Monad.
- Every roll is `HMAC(seed, chog id + move number + action)`, turned into a number from 1 to 100.
- At the next reset, the game posts the seed itself, and the Verify page recomputes every roll of that day.
- The game can't change rolls afterwards, because the hash was public first. Players can't predict rolls, because the seed stays secret until the day ends.

### 4.5 Contracts

There are two small ones, and neither holds anything.

- **ChogCityLedger**
  - `commitDay(day, seedHash)` and `revealDay(day, seed, recordsRoot)`.
  - Only the game wallet can call them. About 2 transactions a day, costing cents.
- **ChogCityBurn**
  - `burn(action, chogId, amount, permit signature)`: uses $CHOG's `permit`, then `burnFrom`, then emits `Burned(wallet, action, chogId, amount)`.
  - No owner. It can only burn the exact amount the wallet signed for.
  - One transaction for the player, with no separate approve step.
- **Facts checked on 8 October:**
  - $CHOG is `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777` (from chog.xyz), 18 decimals, 1,000,000,000 supply.
  - It's a minimal proxy. Its implementation contains `permit`, `burn` and `burnFrom`, and has no `mint` or `owner` functions.
  - This was a bytecode selector check. Day 8's fork test confirms it for real.
- **The game wallet's key** lives in its own signer process on the VM, the same pattern as your bots. It never appears in the repo, in logs, or in any file an AI reads.

### 4.6 Chain watcher

- **Owners:**
  - Start from a full `ownerOf` snapshot through Multicall3: 8 calls, already done once on 8 October.
  - Then follow new `Transfer` logs every few seconds, in windows of at most 100 blocks (Monad's log limit). Blocks are about 0.3 seconds.
- **When a Chog changes owner,** control moves to the new owner at once. It leaves any open crew, its used moves stay used, and its record stays.
- **Burns and ledger events** are followed the same way.
- **RPC:** the public Monad RPC, plus one new keyed RPC just for this game. Never the bots' keys.

### 4.7 Playing from a hot wallet

- Many holders keep Chogs in a cold wallet. The owner signs one message ("let wallet X play my Chogs") and can cancel it any time.
- delegate.xyz v2 isn't on Monad. Code exists at v1's usual address but I couldn't confirm it's genuine, so the game doesn't rely on it.

### 4.8 Images

- The 1,969 images (1000×1000 WebP, about 275 KB each) are fetched once from IPFS and checked against the metadata.
- Each is resized to 96, 256 and 640 px in WebP and AVIF.
- They're served from our domain with a one-year cache through Cloudflare.

### 4.9 Discord and Telegram

- **Daily recap:** the recap image and the top 5 lines go to a Chog Discord channel and to the Telegram group through your Chog bot.
  - Discord needs a webhook, or "Send Messages" for the bot in that channel, from the Chog team.
- **Personal pings:** after a player links Discord or Telegram: "you were robbed", "crew invite", "out of jail".
- **Gang roles in Discord:** needs "Manage Roles" from the Chog team. Nice to have.
- **Bot tokens stay where they are now.** The game sends events to a small endpoint the bot exposes.

### 4.10 Security

- **Login:** Sign-In With Ethereum, checked for nonce, domain and expiry.
- **Limits and checks:**
  - rate limits per wallet and per IP;
  - every input validated (zod);
  - every rule enforced on the server.
- **Secrets:**
  - only in systemd environment files (mode 600);
  - never in the repo, in logs, or in a file an AI reads;
  - RPC URLs are redacted in logs.
- **Admin pages:** behind a separate login.
- **Contracts:** minimal, tested on a fork, with source verified on Monadscan. The game never holds user funds.

### 4.11 Performance and reliability targets

- Mobile Lighthouse: performance 90 or above, accessibility 95 or above.
- First screen in 2.5 s or less on fast 4G. Taps respond within 200 ms.
- Move API: 95% of requests under 150 ms at 200 requests a second (k6).
- Nightly database backup to a GCS bucket, with one restore test before launch.
- Uptime check, and error alerts to your Telegram.

### 4.12 Tests

- **Game engine:**
  - a test for every rule;
  - property tests: cash never negative, moves never above 5, a Chog in at most one crew, turf points add up, and the same seed always gives the same results.
- **Balance simulator:**
  - 2,000 bot Chogs play 21 days;
  - it reports results per skill, gang and district;
  - numbers are tuned with it before launch and again after the playtest.
- **API:** integration tests on a real Postgres.
- **Browser:** Playwright on the main flows at 375 px and 1440 px, with screenshot comparison.
- **Contracts:** Foundry tests on a Monad mainnet fork with the real $CHOG.
- **Load:** k6 with 500 players at once.

### 4.13 Running costs (estimates, to confirm)

| Item | Cost |
|---|---|
| VM | e2-medium, not spot: about $25–35 a month. |
| Domain | About $10–40 a year. |
| Sentry and Cloudflare | Free tiers. |
| Gas | A few cents of MON a day for 2 transactions. |
| AI | Nothing. No AI runs in the game. |

---

## 5. Day-by-day plan

- Every day ends with a deploy to staging and a ticked line in `~/tasks/chogathon.md`.
- "Done when" is the test for each day.
- Days assume Day 1 is 9 October.

### Day 0: before the start (8 Oct). No code.

- [ ] You submit the application (text in Part 9).
- [ ] You ask in Discord "what gang do you rep?" to check the gang list and names in Appendix B.
- [ ] You ask the Chog team for:
  - a #chog-city channel plus a webhook, or Send Messages for the bot;
  - Manage Roles for gang roles (optional);
  - permission to use the chog.xyz street art (optional).
- [ ] You buy the domain.
- [ ] You answer the decisions in Part 1.

### Day 1: foundations

- [ ] Repo, workspace, lint, format, typecheck, CI on GitHub Actions.
- [ ] VM created after you approve its size and cost; Caddy + HTTPS on the domain; Postgres; one-command deploy.
- [ ] All 1,969 images cached, resized and hash-checked.
- [ ] Traits imported and spot-checked on-chain (`tokenURI` for 25 random Chogs).
- [ ] Skill, gang and district tables loaded, with a coverage report showing every Chog has a skill.

**Done when:** the domain serves a grid of all 1,969 Chogs that loads fast on a phone, and CI is green.

### Day 2: game engine, part 1

- [ ] Chog state, moves, solo and legal jobs, odds with breakdown, dice, Wanted stars, jail, cash bail, levels, record counters.
- [ ] Tests for every rule, plus property tests.

**Done when:** all rules are covered and the same seed always gives the same results.

### Day 3: game engine, part 2, and balance

- [ ] Crew jobs (slots, joining, auto-run, expiry, refunds), robbing, revenge, arrests, turf points and the nightly flip, titles.
- [ ] Balance simulator. Tune numbers and write the results to `docs/balance.md`.
- [ ] Job list v1 in data, plus about 150 hand-written result and recap lines for you to edit.

**Done when:**
- in the simulator, every gang holds at least one district on some days;
- no skill is useless, and cash doesn't run away.

### Day 4: server

- [ ] Database schema and migrations.
- [ ] Wallet login.
- [ ] Owner snapshot and live Transfer watcher.
- [ ] Hot-wallet approval.
- [ ] Move API with transactions and locks.
- [ ] Live feed.
- [ ] Rate limits and validation.
- [ ] Integration tests.

**Done when:** a script with 3 test wallets plays a full day through the API against staging: solo, crew, rob, jail, bail and flip.

### Day 5: design system

- [ ] Tokens, fonts, grain, and district colours sampled from the art.
- [ ] The `/design` page with every component in every state:
  - buttons and inputs;
  - Chog portrait frame, the 17 skill badges, gang tags;
  - job poster, odds breakdown, result stamp, crew slots;
  - sheets, toasts, tabs and timers.
- [ ] **Checkpoint 1** with you, on your phone.

**Done when:** you sign off the `/design` page.

### Day 6: screens, part 1

- [ ] Landing, first minute, My Chogs, Chog page with share image, job board, result.

**Done when:** a new player gets from connecting to the first result in under 60 seconds on a phone, with no help.

### Day 7: screens, part 2

- [ ] Crew room (invite link, find Chogs by skill, open crews list).
- [ ] City map (SVG districts, tags, live dots).
- [ ] Gang pages, jail and bail, the robbing flow, notifications, daily recap page.
- [ ] **Checkpoint 2.**

**Done when:** the whole game works on staging with test wallets, and every screen passes the 3.4 checklist at 375, 768 and 1440 px.

### Day 8: on-chain

- [ ] Both contracts, with Foundry tests on a Monad fork (real $CHOG permit and burnFrom).
- [ ] Deploy to mainnet after your OK, and verify on Monadscan.
- [ ] Signer process.
- [ ] Nightly seed commit and reveal, and the records root.
- [ ] Burn watcher.
- [ ] $CHOG screens: bail, poster, banner.
- [ ] Verify page.

**Done when:** a real $CHOG burn on mainnet bails out a test Chog, and the Verify page reproduces yesterday's rolls.

### Day 9: closed test

- [ ] 10–20 holders play on real mainnet ownership. You invite them.
- [ ] Recap generator and share images.
- [ ] Discord and Telegram posting, or you post by hand if the permission hasn't come yet.
- [ ] I watch logs and sessions live, and collect feedback in one thread.

**Done when:** at least 10 holders have played, and the issues list is ranked.

### Day 10: fix and harden

- [ ] Fix the playtest issues, and retune numbers with real data.
- [ ] Performance (Lighthouse) and accessibility (axe) passes.
- [ ] Screenshot-test baseline.
- [ ] Load test.
- [ ] Backup and restore drill.
- [ ] Alerts.
- [ ] **Checkpoint 3.**

**Done when:** the 4.11 targets are met, and no open bug loses moves, cash or records.

### Day 11: public launch, Season 1

- [ ] Announcement in Discord and on X with a 30-second clip.
- [ ] Demo city live.
- [ ] Admin metrics page.

**Done when:** it's live and the numbers are recording.

### Day 12: live

- [ ] Fix what launch shows.
- [ ] Election and Halloween built behind switches.
- [ ] More jobs.

### Day 13: submission package

- [ ] Demo video: my script and a clean demo setup, recorded by you.
- [ ] README: what it is, why the Chog matters, how to verify the dice and records.
- [ ] Testing steps for holders and for the demo city.
- [ ] Usage numbers and next steps.

**Done when:** someone who has never seen it can test it from the instructions alone.

### Day 14: submit

- [ ] Submit early in the day.
- [ ] Keep the city running.

### Judging week (about 23–29 Oct)

- [ ] Election, about 24–26 Oct.
- [ ] Halloween week, about 27–31 Oct.
- [ ] Daily recaps, with fixes within hours.

---

## 6. Launch, judging week and submission

### What we measure

These come from our own database and show on the admin page:

- holders connected and daily active Chogs;
- moves per day and crews completed;
- how many come back the next day and after 7 days;
- robberies and arrests;
- $CHOG burned;
- recap views and shares.

**Goals, not promises:** 150 holders connected, 60 daily active Chogs, and 40% of players coming back the next day.

### Submission checklist (the site's six items)

1. **Project:** name, you, and your Discord and X handles.
2. **What it is and what's new:** Part 1.
3. **Why the Chog matters:** Part 9.
4. **Demo link, video (3 minutes or less), testing steps:** holder path and demo-city path.
5. **Repo, stack, pre-existing work:** Part 4, and the note in Part 9.
6. **Usage and next steps:** the admin numbers, playtest feedback, and Season 2 ideas.

### Video script (3:00)

| Time | Shows |
|---|---|
| 0:00–0:15 | Discord names like "MCGA gng" and "lazoor gang". The community already sorted itself into gangs by trait. Chog City makes it a game. |
| 0:15–0:40 | Connect. The Chog card turns traits into skills. Pick a gang. |
| 0:40–1:05 | A solo job: odds breakdown, the stamp, the record updating. |
| 1:05–1:45 | The bank job needs Laser. Find a laser Chog and invite its owner from Discord. The crew fills, the vault is cracked, turf points land. |
| 1:45–2:10 | The nightly flip: the map changes, gang standings move, the recap posts in Discord. |
| 2:10–2:30 | Robbed, then revenge. Jailed, then bailed with $CHOG, with the burn shown on Monadscan. |
| 2:30–2:45 | The record page. Transfer the Chog and the new owner gets its record. The Verify page. |
| 2:45–3:00 | Real numbers (players, jobs, crews, burns) and what's next. |

---

## 7. Risks

| Risk | What we do about it |
|---|---|
| Too few players online for crews to fill | Crews wait hours, not minutes. Holders with several Chogs can fill slots themselves. Open crews list plus Discord/Telegram pings. Most crews have 2–3 slots. |
| Big gangs win on headcount | Best-15 rule; district jobs favour different skills; tuned in the simulator. |
| Free agents (456) feel left out | They can join any gang, and gangs compete to recruit them. |
| Charm (48%) and Clown (36%) too common, Blade (18 Chogs) too rare | Trim in the table review. Rare skills are bonuses in most jobs and required in only a few. |
| Game text sounds like AI | All lines hand-written, your edit pass, community check before launch. |
| Design looks generic | 3.4 checklist, three checkpoints, art-first layouts. |
| Too much for one person in two weeks | Cut list (Part 8), engine first, features behind switches. |
| Monad RPC outage | Public RPC plus a keyed backup. The watcher resumes from its last block. Ownership cache. |
| Cheating or bots | Moves per Chog, rate limits, all rules on the server, one crew at a time. |
| $CHOG price swings | Prices in $CHOG and adjustable. Nothing paid out. |
| Discord permission comes late | Telegram works now; you post recaps by hand until then. |
| Server failure | Non-spot VM, nightly backups, restore tested before launch. |
| Start date differs | The plan counts days, not dates. |
| Trait names include slurs (e.g. "RETARD Cap" is a real trait) | Trait names show as they are in the collection. Our own text never uses slurs. |

---

## 8. What gets cut first

If we fall behind, cut in this order:

1. The election event.
2. Halloween jobs beyond the first three.
3. Gang banners.
4. Personal Discord/Telegram pings (keep the recap post).
5. Sound.
6. Hot-wallet play (fallback: play from the owner wallet).

**Never cut:**
- the job board, solo and crew jobs;
- robbing and jail, the turf map, the Chog record page;
- the demo city;
- the design quality;
- the engine and contract tests.

---

## 9. Application text (ready to paste)

- **Project name:** Chog City
- **One-line pitch:** "A city game where your Chog's traits are its skills: pull jobs with crews of other holders, win turf for your gang, and build a record that stays with the NFT when it's sold."
- **Why the Chog NFT matters:** "The traits are the character. Outfit, eyes, head and accessory decide its skills (only Laser Chogs can cut the vault, only Knife Chogs get the knife bonus). They also decide which gangs it can join, the same gangs holders already put in their Discord names, and its Background decides its home district. Only the owner can play it, and its record (level, cash, arrests, crew, rivals) is tied to the token and passes to the next owner. Without the NFT there's no character, no gang and no record."
- **Pre-existing work** (for the submission):
  - a snapshot of the Chog trait metadata, from my earlier reveal watcher;
  - experience from my Monad Pixel Wars game (live updates on Monad).
  - All game code is written during the hackathon.

---

## Appendix A: Skills (draft v2, from all 1,969 Chogs)

- Every normal Chog has at least one skill. On average a Chog has 2.7.
- To fix in review:
  - Charm and Clown are too common;
  - "Sad"/"Worried" mouths as Worker, and JEET Cap as Runner ("jeets run"), are jokes the community should approve.
- The 10 Legendary 1:1s count as any one skill per job.

| Skill | Chogs | Comes from |
|---|---:|---|
| Muscle | 456 | Body: Gangster suit, Black Vest, Tank Top, Orange Sleeveless, Red Sleeveless, White Sleeveless, Blue Sleeveless, Purple Tank, White Tank, Army Vest, dark vest, Golden Armor; Head: Spartan Helmet, Russian Hat, Balls Cap, MEGA Chog; Eyes: Thug, Angry; Mouth: Grit |
| Stealth | 438 | Head: Robber, Red Bandana, Head Wrap, Durag, Blue Bucket Cap, Orange Bucket Cap, Gray Bucket Cap; Body: Black Trackset, dark jacket, dark tee, Black Shirt; Eyes: Side Eye, Green Side Eye, Mixed Side Eye; Mouth: Flat |
| Laser | 278 | Eyes: Purple laser, fire laser, Green laser, cyan laser; Head: Blue Laser |
| Blade | 18 | Accessory: Knife |
| Smooth | 431 | Body: Tuxedo, Red Tuxedo, White tuxedo, Cream Tuxedo, Pink Tuxedo, Aqua Tuxedo, Blue tuxedo, Cyan tuxedo, CEO Vest; Mouth: Gold Tooth, Lip Bite |
| Money | 314 | Accessory: Coin, Cigar, Green Candle, Red Candle; Head: Dollar Cap, BTC Cap, BTC Beanie, Buttcoin Cap, ETH Cap; Eyes: BTC Glass; Mouth: BTC Coin, Mon coin |
| Tech | 437 | Eyes: Gradient visor, Sunset visor, Plasma visor, Modern VR, Classic VR, 3D Glass, Chog Viper; Body: Sci Fi, Astro Suit, Glitch Hoodie, Electro Hoodie; Head: 10k TPS Cap, TISM Cap, NEET, Cloud Cap |
| Magic | 139 | Head: Wizard Hat, Wizard Beanie, 3rd Eye, Holy Seal, Poison Shroom, 8 Ball Beanie; Body: Wizard, Wizard Cape, Jesus, Jesus Robe |
| Royal | 143 | Head: Crown, Silver wreath, Gold Thorn, Silver Thorn, Diamond; Body: Kings Robe; Aura: Royal Aura |
| Guard | 48 | Body: Squid Game Guard, Army Vest |
| Jailbird | 126 | Body: Inmate, Prisoner, Stripes, Stripe Shirt, Stripe shirts, Squid Game |
| Runner | 277 | Body: Yellow 143 Jersey, Blue 143 Jersey, Red 143 Jersey, Red Trackset, Six Seven; Head: Japan Headband, Red Headband, Thunder Cap, JEET Cap, Jeet Cap; Aura: Wind |
| Clown | 706 | Head: Clown Nose, Rainbow Wig, Taped Banana, RETARD Cap; Eyes: Clown Eye, Clown Eye Mix, XD; Mouth: Clown Mouth, Rainbow Puke, Drooling, wo; Body: Banana suit, Duck Float, Shark Suit, Dragon suit, toad blue suit, Toad pink suit, Toad green Suit |
| Charm | 947 | Eyes: Heart, Happy, Green Happy, Mixed Happy, Blue Happy; Accessory: Heart; Mouth: Bubblegum, normal smile, Smile; Body: Hawaiian Polo, MILF Lover; Aura: Rose Aura, Rose Scent, Pink Mist; Head: Horny Cap, Boob Cap, BOOB Cap, Bob Hair, Peace hat, Red Peace Cap, Peace Cap, Star Cap, WAGMI Cap |
| Worker | 474 | Body: Farmer Shirt, Brown Homeless Shirt, Grey Homeless Shirt, Blue Homeless Shirt, Yellow Yukata, White Yukata; Head: Plumber; Eyes: Tired; Mouth: Sad, Worried |
| Undead | 60 | Form: Skull; Body: Mummy |
| Toxic | 30 | Base: Radioactive |

## Appendix B: Gangs (draft; names to check with the community)

- 456 Chogs have none of these traits. They're free agents and can join any gang.
- Legendary 1:1s can join any gang.
- Open questions for the community:
  - should MMGA Cap (34 Chogs) join MCGA Gang?
  - do people rep cap gangs like TISM or JEET?

| Gang | Chogs that can join | Comes from |
|---|---:|---|
| MCGA Gang | 56 | Head: MCGA, MCGA Cap |
| Lazoor Gang | 278 | Eyes: Purple laser, fire laser, Green laser, cyan laser; Head: Blue Laser |
| Gangstas | 115 | Body: Gangster suit, Chug Life, Blue Mafia; Head: Mafia Hat; Eyes: Thug; Accessory: Cigar |
| Robbers | 44 | Head: Robber, Red Bandana; Accessory: Knife |
| Suits | 247 | Body: Tuxedo, Red Tuxedo, White tuxedo, Cream Tuxedo, Pink Tuxedo, Aqua Tuxedo, Blue tuxedo, Cyan tuxedo, CEO Vest |
| Royals | 102 | Head: Crown, Silver wreath, Gold Thorn, Silver Thorn, Diamond; Body: Kings Robe |
| Wizards | 105 | Head: Wizard Hat, Wizard Beanie; Body: Wizard, Wizard Cape |
| Squid Game | 55 | Body: Squid Game Guard, Squid Game |
| Jailbirds | 101 | Body: Inmate, Prisoner, Stripes |
| Clowns | 152 | Head: Clown Nose, Rainbow Wig; Eyes: Clown Eye, Clown Eye Mix; Mouth: Clown Mouth |
| BTC Maxis | 154 | Head: BTC Cap, BTC Beanie, Buttcoin Cap; Eyes: BTC Glass; Mouth: BTC Coin |
| Mon Maxis | 210 | Head: Mon Cap, Mon Beanie, 10k TPS Cap; Body: Mon Hoodie, Yellow 143 Jersey, Blue 143 Jersey, Red 143 Jersey; Mouth: Mon coin |
| Crybabies | 245 | Eyes: Round Crying, Closed Eye Crying, Teary, Round Tear |
| Visor Gang | 256 | Eyes: Gradient visor, Sunset visor, Plasma visor, Modern VR, Classic VR, 3D Glass, Chog Viper |
| Skulls | 60 | Form: Skull |
| Radioactive | 30 | Base: Radioactive |

## Appendix C: Districts (home district = Background trait)

- The Radioactive Zone opens for Halloween.
- Legendary 1:1s have no Background, so every district counts as home for them.

| District | Home Chogs | Backgrounds | Kind of jobs |
|---|---:|---|---|
| Mon Square | 131 | Mon | Bank, exchange: Money, Tech, Laser |
| Purple Hill | 369 | Light Purple, Soft Lavender, Light Magenta, Deep Purple, Supreme Purple, Magenta | Rich area, galas: Smooth, Royal |
| Lemon Row | 407 | Lemon, Lemon Yellow, Sunlight, Bright Yellow, Gold, Afternoon Orange | Shops, market: Muscle, Blade |
| Aqua Docks | 249 | Aqua, Aqua Mint, Deep Aqua, Aqua Blue | Smuggling: Stealth, Runner |
| Pink Strip | 395 | Rosie, Coral Pink, Peach Pink, Rosy Pink, Rose Pink, Red Sky, Blood Red | Nightlife, casino: Charm, Clown, Smooth |
| Green Park | 245 | Mint, Fresh Green, Lime Green | Farms (legal), potions: Worker, Magic |
| Blue Heights | 133 | Sky Blue, Deep Blue, Royal Blue, Noble Blue | Offices: Tech, Stealth |
| Radioactive Zone | 30 | Radioactive | Halloween: Undead, Toxic, Magic |

## Appendix D: First jobs (draft)

- The names are plain on purpose.
- The one-line flavour text under each job comes later, written in the community's voice and edited by you.
- Numbers get tuned in the simulator.

| Job | District | Crew | Needs | Helps | Base odds | Pay |
|---|---|---|---|---|---:|---:|
| Skim the ATM | Mon Square | Solo | Tech | Stealth | 70% | 40 |
| Front-run the exchange | Mon Square | Solo | Money | Tech | 65% | 50 |
| Crack the Mon Square vault | Mon Square | Big (5) | Laser, Tech, Stealth, Runner, Muscle | Blade | 45% | 1,500 |
| Crash the gala | Purple Hill | Solo | Smooth or Royal | Charm | 70% | 45 |
| Con a whale | Purple Hill | 2 | Smooth, Money | Charm | 60% | 260 |
| Steal the crown jewels | Purple Hill | 4 | Royal, Stealth, Laser, Runner | Tech | 50% | 900 |
| Rob the corner store | Lemon Row | Solo | Muscle or Blade | Stealth | 65% | 35 |
| Shake down the market | Lemon Row | 3 | Muscle, Muscle, Smooth | Blade | 55% | 400 |
| Run a market stall (legal) | Lemon Row | Solo | Any | Worker | 95% | 20 |
| Unload a shady boat | Aqua Docks | Solo | Stealth | Runner | 65% | 40 |
| Smuggle a container | Aqua Docks | 3 | Stealth, Runner, Muscle | Tech | 55% | 450 |
| Dock work (legal) | Aqua Docks | Solo | Worker | Muscle | 95% | 25 |
| Hustle the card tables | Pink Strip | Solo | Smooth or Clown | Charm | 60% | 45 |
| Throw a party, sell the tickets twice | Pink Strip | 2 | Charm, Clown | Money | 65% | 220 |
| Rob the casino | Pink Strip | 4 | Clown, Laser, Tech, Runner | Stealth | 50% | 1,000 |
| Harvest the farm (legal) | Green Park | Solo | Any | Worker | 95% | 20 |
| Grow something illegal | Green Park | Solo | Worker or Magic | Stealth | 65% | 40 |
| Brew potions | Green Park | 2 | Magic, Worker | Toxic | 65% | 200 |
| Hack the office wifi | Blue Heights | Solo | Tech | Stealth | 70% | 40 |
| Steal the launch codes | Blue Heights | 3 | Tech, Stealth, Smooth | Laser | 55% | 480 |
| Pump a memecoin | Blue Heights | 3 | Money, Clown, Charm | Tech | 55% | 450 |
| Jailbreak | Anywhere | 3 | Jailbird, Runner, Muscle | Stealth | 55% | Frees one Chog |
| Guard shift (legal) | Anywhere | Solo | Guard | Muscle | 95% | 30 |
| Clean the streets (legal) | Anywhere | Solo | Any | Worker | 95% | 15 |
| Haunt Purple Hill | Radioactive Zone | Solo | Undead | Magic | 65% | 60 |
| Leak the toxic barrels | Radioactive Zone | 2 | Toxic, Runner | Stealth | 60% | 300 |
| Summon something | Radioactive Zone | 3 | Magic, Undead, Toxic | Royal | 50% | 700 |

## Appendix E: Facts checked and where (8 Oct 2026)

| Fact | Where it came from |
|---|---|
| Hackathon rules, weights, prizes, deliverables | chogathon.chog.xyz |
| "488 APPS" and the 5 project cards are fixed in the page code; the real project list returned nothing | The page's own code and its database query, while logged in |
| 1,969 Chogs and every trait count | Your verified metadata snapshot, `~/chog-rare-listing-watcher/server-snapshot-2026-09-29` |
| 1,012 holder wallets; 721 hold one; the biggest two hold 68 and 63 | `ownerOf` for every token through Multicall3 on the public Monad RPC |
| $CHOG address | chog.xyz |
| $CHOG details (18 decimals, 1B supply, minimal proxy, permit/burn/burnFrom present, no mint/owner) | Read on-chain. The selectors were found by a bytecode scan; Day 8's fork test confirms them for real. |
| Brand colours and fonts (`#D8D6C7`, `#D83E7E`, Koulen, Reown AppKit) | chog.xyz styles |
| Art style (outlines, flat colour, grain, 1000×1000 WebP) | Chog #683, #12 and #1500 from IPFS |
| Monad blocks about 0.30 s; Multicall3 present; delegate.xyz v2 absent; code at the v1 address not confirmed genuine | On-chain reads |
| Prior art: AI towns (Fable's AI Nouns Town, Stanford Smallville), The Heist (Solana), a Guess Who game on Mina | Web search |

**Not checked:**
- today's $CHOG and Chog floor prices;
- whether the domain is free;
- whether "Chog City" is already used in the community;
- GCP prices;
- the hackathon's exact start date;
- the size of the Chog Discord.
