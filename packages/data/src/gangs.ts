// Gangs a Chog can join, by trait. Names are drafts: the community renames them while we build.
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
] as const;
export type GangId = (typeof GANG_IDS)[number];

export interface GangDef {
  id: GangId;
  name: string;
  from: TraitMatch[];
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
    name: 'Suits',
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
    name: 'Squid Game',
    from: [
      ['Body', 'Squid Game Guard'],
      ['Body', 'Squid Game'],
    ],
  },
  jailbirds: {
    id: 'jailbirds',
    name: 'Jailbirds',
    from: [
      ['Body', 'Inmate'],
      ['Body', 'Prisoner'],
      ['Body', 'Stripes'],
    ],
  },
  clowns: {
    id: 'clowns',
    name: 'Clowns',
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
    name: 'BTC Maxis',
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
    name: 'Mon Maxis',
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
    name: 'Crybabies',
    from: [
      ['Eyes', 'Round Crying'],
      ['Eyes', 'Closed Eye Crying'],
      ['Eyes', 'Teary'],
      ['Eyes', 'Round Tear'],
    ],
  },
  'visor-gang': {
    id: 'visor-gang',
    name: 'Visor Gang',
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
};
