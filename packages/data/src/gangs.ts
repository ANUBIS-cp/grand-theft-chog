// Gangs a Chog can join, by what it visibly wears. A Chog that matches two or more gangs picks one; one
// that matches none is in the Naked Gang; the ten 1:1s are the Legends. Names are the owner's (15 Oct).
import type { TraitMatch } from './traits.ts';

export const GANG_IDS = [
  'mcga',
  'lazoor',
  'gangstas',
  'robbers',
  'suits',
  'royals',
  'wizards',
  'squid-game',
  'jailbirds',
  'clowns',
  'btc-maxis',
  'mon-maxis',
  'crybabies',
  'visor-gang',
  'skulls',
  'radioactive',
  'caps',
  'durags',
  'naked',
  'legends',
] as const;
export type GangId = (typeof GANG_IDS)[number];

export interface GangDef {
  id: GangId;
  name: string;
  from: TraitMatch[];
  /** Also every Chog that matches no other gang. */
  fallback?: true;
}

export const GANGS: Record<GangId, GangDef> = {
  mcga: {
    id: 'mcga',
    name: 'MCGA Gang',
    from: [
      ['Head', 'MCGA'],
      ['Head', 'MCGA Cap'],
    ],
  },
  lazoor: {
    id: 'lazoor',
    name: 'Lazoor Gang',
    from: [
      ['Eyes', 'Purple laser'],
      ['Eyes', 'fire laser'],
      ['Eyes', 'Green laser'],
      ['Eyes', 'cyan laser'],
      ['Head', 'Blue Laser'],
    ],
  },
  gangstas: {
    id: 'gangstas',
    name: 'Gangstas',
    from: [
      ['Body', 'Gangster suit'],
      ['Body', 'Chug Life'],
      ['Body', 'Blue Mafia'],
      ['Head', 'Mafia Hat'],
      ['Eyes', 'Thug'],
      ['Accessory', 'Cigar'],
    ],
  },
  robbers: {
    id: 'robbers',
    name: 'Robbers',
    from: [
      ['Head', 'Robber'],
      ['Head', 'Red Bandana'],
      ['Accessory', 'Knife'],
    ],
  },
  suits: {
    id: 'suits',
    name: 'Tuxedo Gang',
    from: [
      ['Body', 'Tuxedo'],
      ['Body', 'Red Tuxedo'],
      ['Body', 'White tuxedo'],
      ['Body', 'Cream Tuxedo'],
      ['Body', 'Pink Tuxedo'],
      ['Body', 'Aqua Tuxedo'],
      ['Body', 'Blue tuxedo'],
      ['Body', 'Cyan tuxedo'],
      ['Body', 'CEO Vest'],
    ],
  },
  royals: {
    id: 'royals',
    name: 'Royals',
    from: [
      ['Head', 'Crown'],
      ['Head', 'Silver wreath'],
      ['Head', 'Gold Thorn'],
      ['Head', 'Silver Thorn'],
      ['Head', 'Diamond'],
      ['Body', 'Kings Robe'],
    ],
  },
  wizards: {
    id: 'wizards',
    name: 'Wizards',
    from: [
      ['Head', 'Wizard Hat'],
      ['Head', 'Wizard Beanie'],
      ['Body', 'Wizard'],
      ['Body', 'Wizard Cape'],
    ],
  },
  'squid-game': {
    id: 'squid-game',
    name: 'Squid Gang',
    from: [
      ['Body', 'Squid Game Guard'],
      ['Body', 'Squid Game'],
    ],
  },
  jailbirds: {
    id: 'jailbirds',
    name: 'Inmates',
    from: [
      ['Body', 'Inmate'],
      ['Body', 'Prisoner'],
      ['Body', 'Stripes'],
    ],
  },
  clowns: {
    id: 'clowns',
    name: 'Clown Gang',
    from: [
      ['Head', 'Clown Nose'],
      ['Head', 'Rainbow Wig'],
      ['Eyes', 'Clown Eye'],
      ['Eyes', 'Clown Eye Mix'],
      ['Mouth', 'Clown Mouth'],
    ],
  },
  'btc-maxis': {
    id: 'btc-maxis',
    name: 'BTC Gang',
    from: [
      ['Head', 'BTC Cap'],
      ['Head', 'BTC Beanie'],
      ['Head', 'Buttcoin Cap'],
      ['Eyes', 'BTC Glass'],
      ['Mouth', 'BTC Coin'],
    ],
  },
  'mon-maxis': {
    id: 'mon-maxis',
    name: 'Mon Gang',
    from: [
      ['Head', 'Mon Cap'],
      ['Head', 'Mon Beanie'],
      ['Head', '10k TPS Cap'],
      ['Body', 'Mon Hoodie'],
      ['Body', 'Yellow 143 Jersey'],
      ['Body', 'Blue 143 Jersey'],
      ['Body', 'Red 143 Jersey'],
      ['Mouth', 'Mon coin'],
    ],
  },
  crybabies: {
    id: 'crybabies',
    name: 'Rekt Gang',
    from: [
      ['Eyes', 'Round Crying'],
      ['Eyes', 'Closed Eye Crying'],
      ['Eyes', 'Teary'],
      ['Eyes', 'Round Tear'],
    ],
  },
  'visor-gang': {
    id: 'visor-gang',
    name: 'VR Gang',
    from: [
      ['Eyes', 'Gradient visor'],
      ['Eyes', 'Sunset visor'],
      ['Eyes', 'Plasma visor'],
      ['Eyes', 'Modern VR'],
      ['Eyes', 'Classic VR'],
      ['Eyes', '3D Glass'],
      ['Eyes', 'Chog Viper'],
    ],
  },
  skulls: {
    id: 'skulls',
    name: 'Skulls',
    from: [['Form', 'Skull']],
  },
  radioactive: {
    id: 'radioactive',
    name: 'Radioactive',
    from: [['Base', 'Radioactive']],
  },
  caps: {
    id: 'caps',
    name: 'Cap Gang',
    // Any hat on the street: printed caps, beanies, bucket hats, the Russian hat, the Spartan helmet.
    from: [
      ['Head', 'Balls Cap'],
      ['Head', 'Horny Cap'],
      ['Head', 'Boob Cap'],
      ['Head', 'BOOB Cap'],
      ['Head', 'Dollar Cap'],
      ['Head', 'Cloud Cap'],
      ['Head', 'TISM Cap'],
      ['Head', 'Thunder Cap'],
      ['Head', 'Star Cap'],
      ['Head', 'Choggie Cap'],
      ['Head', 'Chog Cap'],
      ['Head', 'Red Peace Cap'],
      ['Head', 'Peace Cap'],
      ['Head', 'Peace hat'],
      ['Head', 'JEET Cap'],
      ['Head', 'Jeet Cap'],
      ['Head', 'RETARD Cap'],
      ['Head', 'WAGMI Cap'],
      ['Head', 'MMGA Cap'],
      ['Head', 'MEGA Chog'],
      ['Head', 'ETH Cap'],
      ['Head', 'NEET'],
      ['Head', 'Choggie Beanie'],
      ['Head', 'RH Beanie'],
      ['Head', '8 Ball Beanie'],
      ['Head', 'Plumber'],
      ['Head', 'Blue Bucket Cap'],
      ['Head', 'Orange Bucket Cap'],
      ['Head', 'Gray Bucket Cap'],
      ['Head', 'Russian Hat'],
      ['Head', 'Spartan Helmet'],
    ],
  },
  durags: {
    id: 'durags',
    name: 'Durag Gang',
    from: [
      ['Head', 'Durag'],
      ['Head', 'Red Headband'],
      ['Head', 'Japan Headband'],
      ['Head', 'Head Wrap'],
    ],
  },
  naked: {
    id: 'naked',
    name: 'Naked Gang',
    from: [['Naked', 'Yes']],
    fallback: true,
  },
  legends: {
    id: 'legends',
    name: 'Legends',
    from: [['Base', '1:1']],
  },
};
