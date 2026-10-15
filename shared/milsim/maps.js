export const MIL_MAPS = [
  {
    id: 'kestrel',
    name: 'Kestrel Valley',
    desc: 'Open conquest across four sectors, rivers, villages and wooded hills.',
  },
  {
    id: 'ironpass',
    name: 'Iron Pass',
    desc: 'A rocky canyon with a quarry, rail yard, fortress and refinery. Seven objectives in a frontline.',
  },
];
export const mapId = (id) => (MIL_MAPS.some((map) => map.id === id) ? id : 'kestrel');
export const IRON_PASS = {
  bases: [
    { team: 0, name: 'Rook Forward Base', x: -600, z: -760, r: 115 },
    { team: 1, name: 'Anvil Logistics Base', x: 600, z: 760, r: 115 },
  ],
  sectors: [
    { id: 'A', name: 'Stonewatch Keep', x: -520, z: -430, r: 75, kind: 'fortress' },
    { id: 'B', name: 'Ferrum Switchyard', x: -380, z: 0, r: 85, kind: 'industrial' },
    { id: 'C', name: 'Raven Escarpment', x: 345, z: -85, r: 70, kind: 'hill' },
    { id: 'D', name: 'Gorge Bridgehead', x: 76, z: 40, r: 95, kind: 'bridge' },
    { id: 'E', name: 'Cinder Refinery', x: 360, z: 310, r: 80, kind: 'industrial' },
    { id: 'F', name: 'Redcut Quarry', x: -235, z: -320, r: 80, kind: 'quarry' },
    { id: 'G', name: 'Anvil Garrison', x: 500, z: 440, r: 80, kind: 'outpost' },
  ],
  chain: ['A', 'F', 'B', 'D', 'C', 'E', 'G'],
  supply: [
    { id: 0, name: 'Rook Supply Yard', x: -780, z: -370, r: 35 },
    { id: 1, name: 'Anvil Fuel Farm', x: 750, z: 520, r: 35 },
    { id: 2, name: 'West Quarry Depot', x: -570, z: 350, r: 35 },
    { id: 3, name: 'East Ridge Depot', x: 650, z: -440, r: 35 },
    { id: 4, name: 'Relay Stores', x: 470, z: 150, r: 32 },
  ],
  towns: [
    { name: 'Ferrum Workers Quarter', x: -490, z: 100, r: 60, houses: 8 },
    { name: 'Cinder Service Town', x: 500, z: 290, r: 60, houses: 7 },
  ],
  fields: [],
  river: [
    [-20, -1120],
    [-10, -850],
    [-45, -650],
    [-40, -420],
    [22, -170],
    [76, 40],
    [141, 290],
    [165, 540],
    [95, 800],
    [65, 1120],
  ],
  riverHalfWidth: 13,
  riverBank: 36,
  roads: [
    {
      kind: 'asphalt',
      name: 'Foundry Highway',
      pts: [
        [-600, -685],
        [-600, -652],
        [-610, -610],
        [-520, -430],
        [-430, -330],
        [-235, -320],
        [-280, -180],
        [-380, 0],
        [-200, 40],
        [10, 40],
        [76, 40],
        [145, 40],
        [245, 10],
        [345, -85],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Anvil Ramp',
      pts: [
        [345, -85],
        [440, 10],
        [470, 150],
        [360, 310],
        [500, 440],
        [550, 590],
        [600, 652],
        [600, 685],
      ],
    },
    {
      kind: 'dirt',
      name: 'Western Canyon Flank',
      pts: [
        [-672, -720],
        [-706, -720],
        [-780, -640],
        [-780, -370],
        [-850, -200],
        [-820, 50],
        [-710, 250],
        [-570, 350],
        [-410, 270],
        [-380, 0],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Eastern Ridge Route',
      pts: [
        [680, 700],
        [706, 720],
        [750, 650],
        [750, 520],
        [780, 310],
        [820, 70],
        [850, -190],
        [770, -360],
        [650, -440],
        [470, -340],
        [345, -85],
      ],
    },
    {
      kind: 'dirt',
      name: 'Quarry Haul Track',
      pts: [
        [-520, -430],
        [-400, -550],
        [-200, -540],
        [-130, -410],
        [-235, -320],
        [-400, -240],
        [-600, -250],
        [-780, -370],
      ],
    },
    {
      kind: 'dirt',
      name: 'Freight Backroad',
      pts: [
        [-380, 0],
        [-490, 100],
        [-570, 350],
        [-250, 410],
        [-70, 310],
        [140, 290],
        [260, 280],
        [360, 310],
      ],
    },
    {
      kind: 'dirt',
      name: 'Northern Gorge Crossing',
      pts: [
        [-235, -320],
        [-120, -210],
        [22, -170],
        [140, -170],
        [255, -200],
        [345, -85],
      ],
    },
    {
      kind: 'dirt',
      name: 'Garrison Service Road',
      pts: [
        [245, 10],
        [262, 170],
        [360, 310],
        [500, 290],
        [750, 520],
      ],
    },
  ],
};
export function canCapture(sectors, team, id, chain) {
  if (!chain?.length) {
    return true;
  }
  const line = team === 0 ? chain : [...chain].reverse();
  const index = line.indexOf(id);
  if (index < 0) {
    return false;
  }
  if (sectors.find((sector) => sector.id === id)?.owner === team) {
    return true;
  }
  return line
    .slice(0, index)
    .every((key) => sectors.find((sector) => sector.id === key)?.owner === team);
}
