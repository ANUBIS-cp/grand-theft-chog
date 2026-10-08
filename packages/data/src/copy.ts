// Every line of game text the feed and result screens use. DRAFT: written by hand, to be edited by the owner
// so it sounds like Chog Discord. Rules: plain words, past tense for results, no emoji, no hype words.
// Placeholders: {chog} {target} {crew} {pay} {loot} {bounty} {stars} {gang} {from} {district} {level} {amount}

export type Lines = readonly string[];

export const JOB_LINES: Record<string, { win: Lines; lose: Lines }> = {
  'skim-atm': {
    win: [
      '{chog} skimmed the ATM. {pay} cash, nobody noticed.',
      '{chog} found a "bug" in the ATM. {pay} cash.',
    ],
    lose: ["The ATM kept {chog}'s card and called the cops.", '{chog} got caught on camera at the ATM.'],
  },
  'front-run': {
    win: ['{chog} front-ran the exchange for {pay}.', '{chog} bought before the news. {pay} cash.'],
    lose: ['{chog} front-ran the wrong side and got noticed.', "The exchange flagged {chog}'s trades."],
  },
  'mon-vault': {
    win: [
      '{crew} cracked the Mon Square vault. {pay} each.',
      'The Mon Square vault is empty. {crew} split it, {pay} each.',
    ],
    lose: ['{crew} got stuck in the Mon Square vault door.', 'The vault alarm went off on {crew}.'],
  },
  'crash-gala': {
    win: [
      '{chog} walked into the gala like it owned it. {pay} cash in tips.',
      '{chog} crashed the gala and left with {pay}.',
    ],
    lose: ["Security at the gala knew {chog} wasn't on the list.", '{chog} got thrown out of the gala.'],
  },
  'con-whale': {
    win: ['{crew} conned a whale out of {pay} each.', 'A whale on Purple Hill trusted {crew}. {pay} each.'],
    lose: ['The whale saw through {crew}.', '{crew} pitched the whale and the whale called the cops.'],
  },
  'crown-jewels': {
    win: ['{crew} stole the crown jewels. {pay} each.', 'The crown jewels are gone. {crew}: {pay} each.'],
    lose: ['{crew} set off every alarm on Purple Hill.', 'The guards were waiting for {crew} at the jewels.'],
  },
  'corner-store': {
    win: [
      '{chog} robbed the corner store. {pay} cash and a snack.',
      '{chog} hit the corner store for {pay}.',
    ],
    lose: [
      'The corner store owner chased {chog} down the street.',
      '{chog} tried the corner store. The owner had a bat.',
    ],
  },
  'shake-down': {
    win: ['{crew} shook down the market. {pay} each.', 'The market paid {crew} to go away. {pay} each.'],
    lose: ['The market fought back against {crew}.', 'Somebody at the market called the cops on {crew}.'],
  },
  'market-stall': {
    win: [
      '{chog} ran a market stall. {pay} cash, honest money.',
      '{chog} sold out at the market. {pay} cash.',
    ],
    lose: ["{chog}'s market stall sold nothing today."],
  },
  'shady-boat': {
    win: [
      '{chog} unloaded a shady boat. {pay} cash, no questions.',
      'Whatever was on that boat, {chog} got {pay} for it.',
    ],
    lose: [
      '{chog} dropped the shady cargo in the water.',
      'The harbour patrol caught {chog} at the shady boat.',
    ],
  },
  container: {
    win: [
      '{crew} smuggled a container through Aqua Docks. {pay} each.',
      'One container went missing at the docks. {crew}: {pay} each.',
    ],
    lose: [
      "Customs opened {crew}'s container.",
      '{crew} got the wrong container. It was full of rubber ducks.',
    ],
  },
  'dock-work': {
    win: ['{chog} worked a shift at the docks. {pay} cash.'],
    lose: ['{chog} showed up late at the docks. No pay.'],
  },
  'card-tables': {
    win: ['{chog} hustled the card tables for {pay}.', '{chog} read every hand at the tables. {pay} cash.'],
    lose: ['The dealer caught {chog} counting.', '{chog} lost the hustle and the table.'],
  },
  'party-tickets': {
    win: [
      '{crew} threw a party and sold every ticket twice. {pay} each.',
      'Best party on the Strip. {crew} made {pay} each.',
    ],
    lose: [
      "Nobody came to {crew}'s party. The cops did.",
      '{crew} sold the same ticket to an undercover cop.',
    ],
  },
  casino: {
    win: ['{crew} robbed the casino. {pay} each.', 'The house lost. {crew} took {pay} each.'],
    lose: ['The casino saw {crew} coming on every camera.', '{crew} hit the casino and the casino hit back.'],
  },
  harvest: {
    win: ['{chog} harvested the farm. {pay} cash, dirty hands, clean money.'],
    lose: ["{chog}'s crop failed."],
  },
  'grow-illegal': {
    win: ['{chog} grew something in Green Park. Sold it for {pay}.', "{chog}'s secret garden paid {pay}."],
    lose: ["A park ranger found {chog}'s garden.", "{chog}'s plants got seized."],
  },
  potions: {
    win: [
      '{crew} brewed potions and sold them all. {pay} each.',
      "Nobody knows what was in {crew}'s potions. {pay} each.",
    ],
    lose: ["{crew}'s potion blew up.", "Someone drank {crew}'s potion and called the cops."],
  },
  'office-wifi': {
    win: [
      '{chog} hacked the office wifi and sold the passwords. {pay} cash.',
      '{chog} is in the Blue Heights network. {pay} cash.',
    ],
    lose: ['IT traced the hack back to {chog}.', '{chog} hacked the wrong office: the police station.'],
  },
  'launch-codes': {
    win: ['{crew} stole the launch codes. {pay} each.', 'The launch codes are with {crew} now. {pay} each.'],
    lose: [
      '{crew} got caught in the server room.',
      'The launch codes were fake and the cops were real. Bad day for {crew}.',
    ],
  },
  'pump-coin': {
    win: ['{crew} pumped a memecoin and sold the top. {pay} each.', 'Up only, then {crew} sold. {pay} each.'],
    lose: [
      '{crew} pumped it, then got rugged by their own coin.',
      "{crew}'s memecoin went to zero in four minutes.",
    ],
  },
  jailbreak: {
    win: ['{crew} broke {target} out of jail.', '{target} is out. {crew} did it.'],
    lose: ['{crew} tried to break {target} out and got caught at the wall.'],
  },
  'guard-shift': {
    win: ['{chog} worked a guard shift. {pay} cash.'],
    lose: ['{chog} fell asleep on shift.'],
  },
  'clean-streets': {
    win: ['{chog} cleaned the streets. {pay} cash.', '{chog} swept up the city. {pay} cash.'],
    lose: ['{chog} cleaned the wrong street. No pay.'],
  },
  haunt: {
    win: ['{chog} haunted Purple Hill. The rich left their wallets behind: {pay}.'],
    lose: ['Nobody on Purple Hill was scared of {chog}.'],
  },
  'toxic-barrels': {
    win: ['{crew} leaked the toxic barrels. Someone paid {pay} each to make it look like an accident.'],
    lose: ['{crew} leaked the toxic barrels on themselves.'],
  },
  summon: {
    win: ['{crew} summoned something. It paid {pay} each and left.'],
    lose: ['{crew} summoned something. It called the cops.'],
  },
};

export const ROB_LINES = {
  win: [
    '{chog} robbed {target} for {loot}.',
    '{chog} took {loot} off {target}.',
    '{target} lost {loot} to {chog}.',
  ],
  lose: [
    '{chog} tried to rob {target} and failed.',
    '{target} saw {chog} coming.',
    "{chog} went for {target}'s cash and got nothing.",
  ],
  revengeWin: [
    '{chog} got even with {target}: {loot} back.',
    '{chog} found {target} and took {loot}. Revenge.',
  ],
  revengeLose: ['{chog} went after {target} for revenge and missed.'],
} as const;

export const ARREST_LINES = {
  win: [
    '{chog} arrested {target}. {stars} stars, {bounty} bounty.',
    '{target} is in cuffs. {chog} collected {bounty}.',
  ],
  lose: ['{target} got away from {chog}.', '{chog} chased {target} and lost them.'],
} as const;

export const BAIL_LINES = {
  cash: ["{chog} paid {target}'s bail.", '{target} is out. {chog} paid.'],
  self: ['{target} paid their own bail.'],
  chog: ['{target} burned {amount} $CHOG and walked out of jail.'],
} as const;

export const TURF_LINES = {
  taken: ['{gang} took {district} from {from}.', '{district} belongs to {gang} now. {from} lost it.'],
  takenEmpty: ['{gang} took {district}.'],
} as const;

export const MISC_LINES = {
  level: ['{chog} reached level {level}.'],
  jailed: ['{chog} is in jail.'],
  joinedGang: ['{chog} joined {gang}.'],
} as const;

/** Picks a line by a stable number (the event ID), so the same event always reads the same. */
export function line(options: Lines, n: number): string {
  return options[Math.abs(n) % options.length]!;
}

/** Fills {placeholders}. Unknown placeholders are left as they are so a typo is visible, not silent. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
