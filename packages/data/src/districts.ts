// Districts. A Chog's home district comes from its Background trait.

export const DISTRICT_IDS = [
  'mon-square',
  'purple-hill',
  'lemon-row',
  'aqua-docks',
  'pink-strip',
  'green-park',
  'blue-heights',
  'radioactive-zone',
] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export interface DistrictDef {
  id: DistrictId;
  name: string;
  kind: string;
  backgrounds: string[];
  /** Closed until an event opens it. */
  eventOnly: boolean;
}

export const DISTRICTS: Record<DistrictId, DistrictDef> = {
  'mon-square': {
    id: 'mon-square',
    name: 'Mon Square',
    kind: 'Bank and exchange',
    backgrounds: ['Mon'],
    eventOnly: false,
  },
  'purple-hill': {
    id: 'purple-hill',
    name: 'Purple Hill',
    kind: 'Rich area, galas',
    backgrounds: [
      'Light Purple',
      'Soft Lavender',
      'Light Magenta',
      'Deep Purple',
      'Supreme Purple',
      'Magenta',
    ],
    eventOnly: false,
  },
  'lemon-row': {
    id: 'lemon-row',
    name: 'Lemon Row',
    kind: 'Shops and the market',
    backgrounds: ['Lemon', 'Lemon Yellow', 'Sunlight', 'Bright Yellow', 'Gold', 'Afternoon Orange'],
    eventOnly: false,
  },
  'aqua-docks': {
    id: 'aqua-docks',
    name: 'Aqua Docks',
    kind: 'Docks and smuggling',
    backgrounds: ['Aqua', 'Aqua Mint', 'Deep Aqua', 'Aqua Blue'],
    eventOnly: false,
  },
  'pink-strip': {
    id: 'pink-strip',
    name: 'Pink Strip',
    kind: 'Nightlife and the casino',
    backgrounds: ['Rosie', 'Coral Pink', 'Peach Pink', 'Rosy Pink', 'Rose Pink', 'Red Sky', 'Blood Red'],
    eventOnly: false,
  },
  'green-park': {
    id: 'green-park',
    name: 'Green Park',
    kind: 'Farms and potions',
    backgrounds: ['Mint', 'Fresh Green', 'Lime Green'],
    eventOnly: false,
  },
  'blue-heights': {
    id: 'blue-heights',
    name: 'Blue Heights',
    kind: 'Offices and tech',
    backgrounds: ['Sky Blue', 'Deep Blue', 'Royal Blue', 'Noble Blue'],
    eventOnly: false,
  },
  'radioactive-zone': {
    id: 'radioactive-zone',
    name: 'Radioactive Zone',
    kind: 'Opens for Halloween',
    backgrounds: ['Radioactive'],
    eventOnly: true,
  },
};
