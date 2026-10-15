export const MIL_MAPS = [
  {
    id: 'frontier',
    name: 'Frontier Line',
    desc: 'Five flags across a river valley: two outposts in the hills, two villages, and a bridge town in the middle.',
  },
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
export const mapId = (id) => (MIL_MAPS.some((map) => map.id === id) ? id : 'frontier');

export const FRONTIER = {
  bases: [
    { team: 0, name: 'Fort Sentry', x: 40, z: -860, r: 115 },
    { team: 1, name: 'Camp Meridian', x: -40, z: 860, r: 115 },
  ],
  sectors: [
    { id: 'A', name: 'Dry Creek Outpost', x: -430, z: -420, r: 75, kind: 'outpost' },
    { id: 'B', name: 'Brenner', x: 440, z: -380, r: 80, kind: 'village' },
    { id: 'C', name: 'Harrow Crossing', x: 0, z: 70, r: 90, kind: 'industrial' },
    { id: 'D', name: 'Signal Hill', x: -410, z: 400, r: 70, kind: 'hill' },
    { id: 'E', name: 'Mirna', x: 420, z: 430, r: 80, kind: 'village' },
  ],
  supply: [],
  towns: [
    { name: 'Brenner', x: 440, z: -380, r: 85, houses: 12 },
    { name: 'Mirna', x: 420, z: 430, r: 95, houses: 14 },
    { name: 'Kirov', x: -250, z: -60, r: 60, houses: 6 },
    { name: 'Volsk', x: 230, z: 620, r: 50, houses: 5 },
    { name: 'Hollow', x: -300, z: 620, r: 45, houses: 4 },
  ],
  fields: [
    [-140, -330, -20, -240],
    [120, -260, 260, -170],
    [-380, -150, -270, -60],
    [200, 150, 340, 250],
    [-260, 160, -150, 250],
    [100, 520, 220, 600],
    [-150, 540, -60, 640],
  ],
  river: [
    [-1120, -120],
    [-860, -40],
    [-600, 20],
    [-340, 60],
    [-120, 70],
    [90, 72],
    [330, 100],
    [560, 160],
    [800, 235],
    [1120, 300],
  ],
  riverHalfWidth: 11,
  riverBank: 28,
  roads: [
    {
      kind: 'asphalt',
      name: 'MSR Anvil',
      pts: [
        [40, -800],
        [50, -680],
        [20, -560],
        [-20, -440],
        [-10, -300],
        [10, -160],
        [0, -40],
        [0, 70],
        [5, 160],
        [-10, 260],
        [-40, 380],
        [-30, 520],
        [-40, 660],
        [-40, 800],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Dry Creek Road',
      pts: [
        [-20, -440],
        [-200, -440],
        [-330, -430],
        [-430, -420],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Brenner Road',
      pts: [
        [20, -560],
        [200, -480],
        [330, -420],
        [440, -380],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Signal Road',
      pts: [
        [-40, 380],
        [-200, 390],
        [-330, 395],
        [-410, 400],
      ],
    },
    {
      kind: 'asphalt',
      name: 'Mirna Road',
      pts: [
        [-30, 520],
        [100, 500],
        [280, 460],
        [420, 430],
      ],
    },
    {
      kind: 'dirt',
      name: 'Creek Track',
      pts: [
        [-430, -420],
        [-300, -250],
        [-150, -80],
        [0, -40],
      ],
    },
    {
      kind: 'dirt',
      name: 'Brenner Track',
      pts: [
        [440, -380],
        [330, -250],
        [200, -90],
        [60, 28],
      ],
    },
    {
      kind: 'dirt',
      name: 'Signal Track',
      pts: [
        [-410, 400],
        [-300, 270],
        [-150, 170],
        [-20, 108],
      ],
    },
    {
      kind: 'dirt',
      name: 'Mirna Track',
      pts: [
        [420, 430],
        [300, 300],
        [160, 180],
        [30, 108],
      ],
    },
    {
      kind: 'dirt',
      name: 'Kirov lane',
      pts: [
        [-20, -300],
        [-150, -190],
        [-250, -60],
      ],
    },
    {
      kind: 'dirt',
      name: 'Volsk lane',
      pts: [
        [-30, 640],
        [100, 640],
        [230, 620],
      ],
    },
    {
      kind: 'dirt',
      name: 'Hollow lane',
      pts: [
        [-40, 660],
        [-170, 650],
        [-300, 620],
      ],
    },
  ],
};
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
