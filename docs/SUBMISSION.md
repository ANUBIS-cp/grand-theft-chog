# Chogathon submission (ready to paste)

Each section is one field of the form at chogathon.chog.xyz → Submit project. Fill the usage numbers from
https://grandtheftchog.duckdns.org/usage (signed in with the owner's wallet) on the day you submit.

---

## Project name

Grand Theft Chog

## App link

https://grandtheftchog.duckdns.org

## GitHub repo

https://github.com/ANUBIS-cp/grand-theft-chog (make it public before submitting)

## Tech stack

Next.js 16, React, TypeScript, canvas 2D, WebSocket live server (Node), Postgres + Drizzle, viem + WalletConnect on Monad, Telegram bot, Caddy on a single VM

## Description

Grand Theft Chog is a live city at night where every Chog Genesis holder walks the streets as their own Chog, at the same time. Your Chog's traits decide which gang it can rep (20 gangs, each with its own building, vault, walk and lock), and gangs rob each other's vaults.

A robbery has three stages:

1. Break in. Every gang's door has its own lock: pick the pins, cut the alarm wires in order, stop the slot reels on the gang's building, or turn the safe dial. Slip more than once and the alarm goes off.
2. The vault. Grab the cash and crack the safe while the gang's guards hunt you. The guards are that gang's own Chogs. Your Chog's traits are its powers: laser eyes, the cardboard box, a blink, a coin toss and more.
3. The run home. Out of the vault with the bag, you have to carry it through the live city to your own gang's door, with police on foot and siren cars after you, while everyone online watches. Members of the gang you robbed can run you down themselves.

Get home and the cash lands in your gang's vault. Get caught and it goes back, your gang pays a fine, and your Chog sits in the city jail, where a gang-mate can break you out.

What makes it new:

- Every holder is in one city at once. Raids are live: the robbed gang can jump into its own vault and steer a guard against you, and anyone can watch.
- The record belongs to the token. Cash stolen, escapes, busts and catches stay with the Chog when it's sold.
- Every robbery has a replay, from the break-in to the run home, made from the moves the server checked. Share the link and anyone can watch it.
- $CHOG is burned from your own wallet for bail (30), a Wanted poster on a rival (60: an extra officer on its getaways and a bounty on it) and a gang banner over your building (150). The plaza's big screen counts every $CHOG burned.
- The Chog Telegram bot posts the biggest robberies and a daily recap ("Yesterday in Grand Theft Chog") to the community.
- Judging week has events: a Left vs Right election (24–26 Oct) where every bag carried home scores for your Chog's Side trait, and Halloween week (27–31 Oct) when the city is haunted, Skulls and Radioactive take more, and every haul counts double on the 31st.
- It's built for a phone first: a thumb stick, big buttons, a map you can pinch.

Why the Chog NFT is essential:

Take the NFT out and there's no game. Your Chog is your character: its picture is the piece you move and the face everyone sees. Its traits pick its gang, its walk and its powers. The guards in a gang's vault are that gang's Chogs. The record is kept on the token, so it moves with the Chog when it changes hands. Ownership is read from the Chog Genesis contract and followed live, so a Chog sold walks out of your wallet and into the buyer's.

How it stays fair: the vault plays the same way every time from each run's seed, your phone sends only your key presses, and the server replays them to find what really happened. The run home is refereed by the live server, which signs the result. $CHOG burns are read from Monad and counted once. More: https://grandtheftchog.duckdns.org/fair

## Judge access instructions

No wallet needed to try it.

1. Open https://grandtheftchog.duckdns.org (a phone works best). You arrive in the plaza as a guest.
2. Walk: drag anywhere on a phone, arrow keys or WASD on a computer.
3. Follow the gold arrow to the Practice warehouse and press Use. That runs a whole robbery with no real cash: the lock, the vault, then the run home past the police.
4. Watch a real robbery: https://grandtheftchog.duckdns.org/recap shows yesterday's biggest haul; tap it to watch the replay.
5. With a wallet that holds a Chog, press Connect wallet (WalletConnect works on phones): your Chog walks the city, its traits pick its gang, and robberies move real gang cash.

How it's fair: https://grandtheftchog.duckdns.org/fair

## Plan

Usage so far (from the game's own records, since Season 1 started on 16 Oct): FILL IN on the day: holders who came,
guests who came, robberies, Chogs in a gang, next-day return, $CHOG burned.

Feedback we acted on: phone controls rebuilt three times from playtesting (a thumb stick that reads diagonals,
buttons out of the way, a pinch map); gang faces now always wear their gang's look; replays start on a tap so phones
play their sound.

Next:

- Seasons: the gang vaults reset each month, with the season's winners kept on the Chogs' records.
- More vaults and locks, and a heist for crews of several Chogs at once.
- Discord: the same posts as Telegram, and gang roles from the game.
- A proper domain and an app-like install on phones.

## Banner image

Use a screenshot of the city at night (the plaza or a gang's door), 1200×630. The share picture of any replay works too.

---

# Demo video (2–2½ minutes)

Record on the laptop in full-screen Chrome (Cmd+Shift+5 records the screen on a Mac), each shot on its own with
a few takes, then cut them together (CapCut is free). Keep it moving; captions on screen instead of talking.

**Film mode:** open https://grandtheftchog.duckdns.org/?film=1 signed in with your wallet. The buttons, map and cards
are hidden so the city fills the frame. Keys: **H** shows or hides the game's buttons, **B** shows or hides the
demo bar at the top. The demo bar (only your wallet sees it) calls up a shot on demand, all practice, nothing real
moves:

- **Police chase**: the run home with police cars and the arrow, carrying the cash typed in the $ box.
- **Lock + vault**: a practice break-in, then the vault.
- **Got away**: the "Got away! You ran $X home" banner, with the $ box's amount.
- **Halloween**: the haunted city (ghosts, lanterns, the cauldron) on or off.

**Music:** before recording, open the music button (by the map, press H to see it) and switch **Music off**,
keep **Game sounds** on, and add one song in the editor: *No Sleep* (kontraa) or *Charming Phonk*
(FreeMusicLab), both on Pixabay. The city's *Password Infinity* and the vault's *Spinning Head* are registered
with YouTube's copyright system, so a YouTube upload with them would likely get a claim.

**The shot nobody else has:** a live raid. A friend in a rival gang defends their vault (they jump in and steer a
guard) while you rob it; record both screens and show them side by side.

0:00–0:12 · The city. Open the site, the plaza at night, other Chogs walking. Caption: "Every Chog holder, one city."

0:12–0:30 · Your Chog. Connect, your own Chog appears; open its card (gang, powers from traits). Caption: "Your traits pick your gang and your powers."

0:30–0:50 · Pick a target. Walk to a rival gang's door, show the door card (vault cash, its guards are its own Chogs). Caption: "Every gang has a vault. Its guards are its own Chogs."

0:50–1:10 · Stage 1, the lock. Pick it cleanly. Caption: "Break in quietly, or the alarm goes off."

1:10–1:45 · Stage 2, the vault. Grab cash, use a power, crack the safe, get out. Caption: "Grab the cash. Crack the safe."

1:45–2:15 · Stage 3, the run home. Police on foot, siren cars, the gold arrow, reach your door. Caption: "Now carry it home. Everyone's watching."

2:15–2:30 · The replay and the recap. Open the replay link, then /recap. Caption: "Every robbery has a replay."

2:30–2:45 · $CHOG. The plaza screen's burn counter, a Wanted poster or bail. Caption: "$CHOG burned from your own wallet."

2:45–3:00 · Halloween preview (?halloween=1): the cauldron, ghosts, lanterns. End card: "Grand Theft Chog · grandtheftchog.duckdns.org".
