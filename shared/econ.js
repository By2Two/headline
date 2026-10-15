export const ECON = {
  start: 800,
  max: 16000,
  buyMs: 20000,
  win: { elim: 3250, time: 3250, bomb: 3500, defuse: 3500 },
  lossBonus: [1400, 1900, 2400, 2900, 3400],
  plantedLoss: 800,
  plant: 300,
  defuse: 300,
  vestPrice: 650,
  vestArmor: 25,
};

export const PRICES = {
  glock: 200,
  usp: 200,
  dualies: 300,
  tec9: 500,
  cz75: 500,
  r8: 600,
  deagle: 700,
  mac10: 1050,
  mp9: 1250,
  mp7: 1500,
  smg: 1500,
  p90: 2350,
  shotgun: 1050,
  sawedoff: 1100,
  mag7: 1300,
  xm1014: 2000,
  negev: 1700,
  m249: 5200,
  famas: 2050,
  rifle: 2700,
  m4: 2900,
  sg553: 3000,
  m4a4: 3100,
  aug: 3300,
  scout: 1700,
  awp: 4750,
  scar20: 5000,
  g3sg1: 5000,
  he: 300,
  smoke: 300,
  vest: 650,
};

export function killReward(weapon) {
  if (!weapon) {
    return 300;
  }
  if (weapon.melee) {
    return 1500;
  }
  if (weapon.id === 'awp') {
    return 100;
  }
  if (weapon.id === 'p90') {
    return 300;
  }
  if (weapon.class === 'smg') {
    return 600;
  }
  if (weapon.id === 'xm1014') {
    return 600;
  }
  if (weapon.class === 'shotgun') {
    return 900;
  }
  return 300;
}

export const lossBonus = (streak) =>
  ECON.lossBonus[Math.max(0, Math.min(ECON.lossBonus.length - 1, streak - 1))];

export const BUY_MENU = [
  ['Pistols', ['glock', 'usp', 'dualies', 'tec9', 'cz75', 'r8', 'deagle']],
  ['SMGs', ['mac10', 'mp9', 'mp7', 'smg', 'p90']],
  ['Heavy', ['shotgun', 'sawedoff', 'mag7', 'xm1014', 'negev', 'm249']],
  ['Rifles', ['famas', 'rifle', 'm4', 'sg553', 'm4a4', 'aug', 'scout', 'awp', 'scar20', 'g3sg1']],
  ['Grenades', ['he', 'smoke']],
  ['Gear', ['vest']],
];
