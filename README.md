# Chog World

A live city at night for the 1,969 Chog NFTs on Monad. You walk the streets as your own Chog, join the gang your
traits allow, and rob other gangs' vaults in three stages: pick the lock on the door, grab the cash inside the
vault, then carry the bag home through the city with the police after you. Every holder online is in the same city
and can see you run. Built for Chogathon 2026.

**Play:** https://chogworld.duckdns.org (works on a phone; no wallet needed to try it)

## For judges: try it in two minutes

1. Open the link. You arrive in the plaza as a guest.
2. Walk: drag anywhere (phone) or use the arrow keys / WASD (computer).
3. Walk straight down from the plaza to the **Practice** warehouse at the bottom of the map (open the map to tap
   it and pick **Walk there**) and press **Use** (or E) at its door. This runs a whole robbery with no
   real cash:
   - **Break in:** one of four locks, depending on the gang you rob (pins, wires, slot reels or a safe dial). Slip
     more than once and the alarm goes off, so the vault starts loud.
   - **The vault:** grab the coins and open the safe while the guards hunt you. Drag the stick (phone) or use the
     arrow keys. Your Chog's powers are on Q and E.
   - **Run it home:** back in the city with the bag, follow the gold arrow to the door before the police catch you.
4. With a wallet that holds a Chog, press **Connect wallet**: your Chog's picture walks the city, its traits decide
   its gang and powers, and robberies move real gang cash.

## Why the Chog NFT is the game

- **Your Chog is your character.** Its picture is the piece you move; every other holder sees it.
- **Traits pick your gang.** Visible traits (hats, outfits, MCGA, Lazoor and more) decide which of the 20 gangs a
  Chog can join. Each gang has its own building, vault, walk and lock.
- **Traits are powers.** Laser eyes, cardboard box, blink and others come from the Chog's traits.
- **The record belongs to the token.** Cash stolen, escapes, busts and catches stay with the Chog, so a buyer gets its
  history.
- **Guards are real Chogs.** A gang's vault is guarded by its own members' pictures.

## $CHOG

Every $CHOG spent in the game is burned from the player's own wallet; the server checks the burn on Monad before
anything happens.

| Burn | What it does |
| --- | --- |
| Bail (30) | Out of jail now |
| Wanted poster (60) | A rival is WANTED for 24 h: an extra officer on its getaways, and a bounty to the gang that catches it |
| Gang banner (150) | Your gang's flag over its building for 24 h |

The total burned is shown on the big screen in the plaza.

## What makes it fair

- **The server replays every run.** The vault game runs the same way every time from the run's seed, so the browser sends only your key
  presses and the server plays them back to find out what really happened. A modified browser can't fake a result.
- **The live server referees the getaway.** It moves the police, checks every step and signs the result it sends
  to the web app.
- **Every robbery has a replay.** `/replay/<id>` plays the break-in, the vault and the run home, so anyone can watch
  and share it.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js app: the city, the vault, the locks, replays, wallet login, APIs |
| `apps/live` | The live city server (WebSocket): players, chat, raids, getaways and police |
| `apps/worker` | Background jobs: follows Chog transfers on Monad (so a sold Chog moves to its new owner), opens each game day, banks getaways nobody reported on |
| `packages/game` | Game rules shared by the browser and the servers: city map, police, locks, vault (Cash Rush) |
| `packages/server` | Database, robberies, burns, sign-in |
| `packages/data` | Chog traits from the verified metadata snapshot, gangs, powers |
| `tools/smoke` | End-to-end checks against a running site (login, a whole robbery, a two-wallet raid) |
| `deploy` | Server setup, Caddy, systemd, deploy script |
| `docs` | Design notes: [stages](docs/stages.md), [vault](docs/rush.md), [balance](docs/balance.md), [plan](docs/PLAN.md) |

## Commands

```bash
npm ci
npm test            # rules, servers and data tests
npm run typecheck
npm run lint
npm run dev         # web app on http://localhost:3000
deploy/deploy.sh    # build and ship the current commit to the server
npx tsx tools/smoke/run.ts https://chogworld.duckdns.org   # 23 checks against the live site
```

`packages/data/scripts/verify-onchain.ts` checks the trait data against the Chog contract.
