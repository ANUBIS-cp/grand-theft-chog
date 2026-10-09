# Cash Rush: the robbery game (v2)

Replaces the tile-by-tile stealth heist (feedback 9 Oct: "the whole idea isn't fun", "controls don't feel clean", and "today's change is worse"). The user asked for everything mixed together, with the most fun and novelty possible, especially the multiplayer part.

## Why this shape (research)

- **Pac-Man** ([Dossier](https://www.gamedeveloper.com/game-platforms/feature-the-i-pac-man-i-dossier), [ghost AI](https://mentalfloss.com/article/90874/your-pac-man-game-learning-different-strategies-each-ghost)):
  - constant action and a maze full of pickups;
  - chasers alternate between hunting you and backing off (chase and scatter), so there are breathers;
  - each chaser has its own target rule, so you can read them;
  - the power pellet flips the chase, as a risk you choose to take;
  - the player turns corners more easily than the chasers.
- **Risk and reward in heist games** ([The Swindle](https://www.gamedeveloper.com/design/the-risk-reward-loop-of-the-swindle)):
  - loot only counts if you get out;
  - the longer you stay, the more you have to lose;
  - a bonus for taking nearly everything.
- **One robber against defenders** (UNSUB, Heist Night, Asym Altered Axis):
  - a timer protects the defenders;
  - keep the robber's goal short;
  - asymmetric roles are the draw.
- **Controls** ([Celeste forgiveness](https://maddymakesgames.com/articles/celeste_and_forgiveness/)):
  - free movement that slides round corners;
  - remember a turn pressed slightly early;
  - never snag on walls.

## A run, 75 seconds

- **Movement.** You move freely, like walking in the city, with no tiles: 5.2 tiles/s. Walls slide you round corners, and a turn pressed just before an opening is kept for 0.15 s.
- **Cash.** Coins line every corridor ($10 each) and stacks sit in the rooms ($60).
- **Combos.** Each pickup within 0.7 s of the last raises the combo (×1, ×2, ×3, up to ×5), and a pickup is worth its value × the combo. Combos make you take the long way through a full corridor.
- **The safe** is a mini-game. Stand at it and press Use, and a dial spins. Press when the needle is in the green, 3 times; each hit narrows the green. A miss makes a noise: every guard switches to chase for 4 s. Payout by defence level: $600 / $1,000 / $1,800 / $3,000 (`SAFE_BY_TIER`). The lockpick power gives a wider green.
- **Laser gates** on timers cross some corridors, another reflex mini-game. Crossing an active beam sounds the alarm: guards chase at full speed for 8 s.
- **Guards** (3 or 4, more in richer vaults) are the gang's own Chogs:
  - *Bruiser* heads straight for you.
  - *Cutter* aims 3 tiles ahead of where you're going.
  - *Flanker* mirrors the bruiser to box you in.
  - *Drifter* chases when far away and wanders off when close.
- **Waves.** Guards alternate between patrolling their corner and hunting: patrol 6 s, then hunt 14 s. Turning round signals each change. Speeds: patrolling 3.4 tiles/s, hunting 4.4 tiles/s (you're faster), and 5.0 tiles/s in the last 15 seconds.
- **Flip.** Two loudspeakers in the map (pickups): for 6 s guards panic and run, and touching one knocks it out for 6 s (+$100, doubling per guard). Your trait power is a button (Hide, Sprint, Laser eyes and the rest), using the same powers you already have.
- **Getting out.** Touch the exit at any time with at least $1. If a guard touches you, you're busted: your gang pays what you carried + $250, and you get 30 min in jail.
- **The clock.** When the timer hits 0 the doors lock: you have 5 s at the exit, then you're busted.
- **Bonuses.** Clean-out +25% for 80% of the cash and the safe. Revenge +25%.
- **Caps and limits.** Each Chog can hit each rival vault once a day (unchanged). The cash moved is capped by what's in the vault.

## Live raid (multiplayer)

- **Defending.**
  - When a robbery starts, everyone online in the target gang sees "Raid! Defend" with a Join button.
  - Joining puts you in the vault as a guard: your own Chog piece in a guard cap, moving at 4.8 tiles/s (a bit slower than the robber) with a short dash.
  - A defender takes the place of a bot guard. Up to 3 defenders.
  - Catching the robber counts on your record and shows in the city news.
- **Watching.**
  - Anyone in the city can watch a live raid from the building's door or the gang board.
  - Watchers can send emotes that float up in the raid.
- **Who's in charge.** The live server runs the raid: guards, coins, the safe, catches. The robber's screen predicts its own movement so it feels instant, and the server checks every move for speed and walls, as in the city.
- **Results.** The live server reports the result to the web app over a signed internal call, and the web app moves the cash. The server also records positions 10 times a second for the replay.

## Practice

- The same game, in the browser, with bot guards. It starts from the practice vault in the city or from /heist.
- A first run walks you through it: move, grab cash, combo, use the flip, crack the safe, get out.

## Build order

1. The rules engine (packages/game/src/rush): map, movement, guards, combos, flip, safe dial, lasers, payout. With tests and a bot that plays it.
2. The practice game in the browser: renderer, controls, sound, screen layout.
3. Real raids on the live server: start, run, report, settle, replay tracks.
4. Defending and watching from the city.
