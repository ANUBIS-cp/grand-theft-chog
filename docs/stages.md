# Heist in stages

User, 14 Oct: the game is "mid", "only one game", "feels like the whole build is a Pac-Man game". Picked:
every robbery is three different games in a row, and the last one happens in the live city.

## The three stages

1. **Break in** (about 12 s): a lock at the vault door, a different kind per gang, drawn in that gang's look.
   - Tumbler (old locks): pins rise and fall; tap when each sits in the gold band. Royals, gangstas, robbers,
     jailbirds, skulls.
   - Wires (alarms): the panel flashes an order; cut the wires in that order. Lazoor, suits, radioactive,
     mon maxis.
   - Reels (slot lock): three reels spin; stop each on the gang's symbol. Squid game, clowns, visor gang,
     MCGA.
   - Dial (safe dial): spin the dial to three numbers in turn; it clicks as you pass each. BTC maxis,
     wizards, crybabies.
   - A clean break-in = quiet: the guards start on patrol. A slow or sloppy one = loud: the alarm is already
     ringing when you get in (guards hunt from the first second). You never fail outright.
   - Deterministic from the run's seed and the tap times, so the server replays it like the chase.
2. **Grab the cash**: Cash Rush as today (shorter clock), quiet or loud from stage 1.
3. **Get away**: you come out of the robbed building's door into the real city carrying the bag, with a
   timer and an arrow to your own gang's door. Police come for you (on foot, and cars on the roads), and
   members of the robbed gang who are online get "Stop the robber!" and can tag you themselves. Everyone
   in the city sees the chase: sirens, the bag's value over your head, police lights. Reach your door:
   the cash is banked. Caught: the bag goes back, and you go to jail.
   - The live server runs the police and decides the result; it tells the web app with a signed message,
     like live raids.
   - The bag leaves the robbed vault when you get out of stage 2 (so it can't be spent twice) and lands
     in your gang's vault only when you reach your door.
   - If the live server never reports back, the bag is banked after 5 minutes (a server failure shouldn't
     cost the player).
   - Break-outs have no getaway (no cash): stage 2 frees the prisoner as now.

## Why this answers the feedback

- Three different feels per robbery (timing or memory, chase, run through the streets) instead of one maze.
- The getaway puts the robbery in the shared city: the moment other players see and join.
- Live raids stop needing a second player in the vault: the robbed gang can always chase in the street.
