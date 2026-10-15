import { WEAPONS } from '../weapons.js';

const base = {
  mag: 0,
  reserve: 0,
  reloadTime: 0,
  drawTime: 0.6,
  moveMult: 1,
  spread: { base: 0, move: 0, air: 0, crouchMult: 1 },
  shotInacc: 0,
  inaccMax: 0,
  inaccDecay: 1,
  recoilReset: 1,
  pattern: [[0, 0]],
  auto: false,
};
const EXTRA = [
  {
    id: 'rpg',
    class: 'launcher',
    slot: 'launcher',
    name: 'RPG-7',
    desc: 'Anti-tank rocket launcher. One rocket, long reload.',
    dmg: 120,
    rpm: 8,
    mag: 1,
    reloadTime: 4.0,
    drawTime: 1.1,
    moveMult: 0.86,
    rocket: true,
    spread: { base: 0.003, move: 0.02, air: 0.05, crouchMult: 0.8 },
  },
  {
    id: 'bandage',
    class: 'medical',
    slot: 'item',
    name: 'Bandage',
    desc: 'Stops (or slows heavy) bleeding. Does not heal. Hold fire to use (4 s); hold E on a downed ally to stabilize him.',
    item: true,
    use: 4,
    heal: 5,
    rpm: 60,
  },
  {
    id: 'medkit',
    class: 'medical',
    slot: 'item',
    name: 'Medical kit',
    desc: 'Medic only. Heals to full, revives downed allies.',
    item: true,
    use: 6,
    heal: 100,
    revive: true,
    rpm: 60,
  },
  {
    id: 'shovel',
    class: 'tool',
    slot: 'tool',
    name: 'Entrenching tool',
    desc: 'Engineer only. Needed to build and dismantle. Also a weapon.',
    melee: true,
    tool: true,
    auto: true,
    dmg: 45,
    rpm: 70,
    reach: 2.0,
    partMult: { head: 1.5, body: 1, legs: 0.8 },
  },
].map((weapon) => ({ ...base, ...weapon, interval: 60 / (weapon.rpm || 60), milOnly: true }));

export const MW = [...WEAPONS, ...EXTRA];
export const mwIndex = (id) => MW.findIndex((weapon) => weapon.id === id);
export const mw = (id) => MW.find((weapon) => weapon.id === id);

const CAL = {
  rifle: '7.62x39',
  sg553: '5.56',
  m4: '5.56',
  m4a4: '5.56',
  famas: '5.56',
  aug: '5.56',
  m249: '5.56 belt',
  negev: '7.62 belt',
  smg: '9mm',
  mp9: '9mm',
  mac10: '.45',
  p90: '5.7',
  mp7: '4.6',
  awp: '.338',
  scout: '.308',
  scar20: '7.62x51',
  g3sg1: '7.62x51',
  shotgun: '12ga',
  xm1014: '12ga',
  mag7: '12ga',
  sawedoff: '12ga',
  glock: '9mm',
  usp: '.45',
  cz75: '9mm',
  dualies: '9mm',
  tec9: '9mm',
  deagle: '.50 AE',
  r8: '.357',
  rpg: 'rocket',
};
export const caliberOf = (id) => CAL[id] || id;

export const AMMO = {
  fmj: { name: 'Ball (FMJ)', short: 'FMJ', dmg: 1, pen: 1, armor: 1, cost: 0 },
  ap: { name: 'Armor-piercing', short: 'AP', dmg: 0.9, pen: 2, armor: 0.45, cost: 1 },
  tracer: { name: 'Tracer', short: 'TR', dmg: 1, pen: 1, armor: 1, tracer: true, cost: 1 },
  hp: { name: 'Hollow point', short: 'HP', dmg: 1.3, pen: 0.5, armor: 1.6, cost: 1 },
  subsonic: {
    name: 'Subsonic',
    short: 'SUB',
    dmg: 0.9,
    pen: 0.8,
    armor: 1.1,
    v: 0.6,
    quiet: true,
    cost: 1,
  },
  buck: { name: 'Buckshot', short: 'BUCK', dmg: 1, pen: 0.5, armor: 1.3, cost: 0 },
  slug: { name: 'Slug', short: 'SLUG', dmg: 1, pen: 1.5, armor: 0.8, slug: true, cost: 1 },
  heat: { name: 'HEAT rocket', short: 'HEAT', dmg: 1, pen: 3, armor: 0.2, cost: 0 },
};
export function ammoFor(weapon) {
  if (!weapon) {
    return ['fmj'];
  }
  if (weapon.class === 'launcher') {
    return ['heat'];
  }
  if (weapon.class === 'shotgun') {
    return ['buck', 'slug'];
  }
  if (weapon.class === 'pistol' || weapon.class === 'smg') {
    return ['fmj', 'hp', 'subsonic', 'ap'];
  }
  if (weapon.class === 'sniper') {
    return ['fmj', 'ap', 'tracer', 'subsonic'];
  }
  return ['fmj', 'ap', 'tracer'];
}

export const ATTACH = {
  muzzle: [
    { id: 'none', name: 'None', cost: 0, kg: 0 },
    {
      id: 'suppressor',
      name: 'Suppressor',
      cost: 8,
      kg: 0.4,
      desc: 'Much quieter, no muzzle flash. Pair with subsonic ammo.',
    },
  ],
  rail: [
    { id: 'none', name: 'None', cost: 0, kg: 0 },
    { id: 'light', name: 'Flashlight', cost: 2, kg: 0.2, desc: 'Weapon light (L).' },
  ],
  grip: [
    { id: 'none', name: 'None', cost: 0, kg: 0 },
    { id: 'grip', name: 'Vertical grip', cost: 3, kg: 0.2, desc: 'Less recoil (-15%).' },
    { id: 'bipod', name: 'Bipod', cost: 3, kg: 0.45, desc: 'Prone: half the recoil and sway.' },
  ],
};
export function attachFor(weapon, slot) {
  if (!weapon || weapon.class === 'launcher' || weapon.melee || weapon.item) {
    return ['none'];
  }
  if (slot === 'muzzle') {
    return weapon.class === 'shotgun'
      ? ['none']
      : weapon.silenced
        ? ['none']
        : ['none', 'suppressor'];
  }
  if (slot === 'rail') {
    return ['none', 'light'];
  }
  if (slot === 'grip') {
    if (weapon.slot !== 'primary') {
      return ['none'];
    }
    if (weapon.class === 'sniper' || weapon.class === 'mg') {
      return ['none', 'bipod'];
    }
    if (weapon.class === 'rifle') {
      return ['none', 'grip', 'bipod'];
    }
    return ['none', 'grip'];
  }
  return ['none'];
}
export const isSilenced = (weapon, attack) => !!weapon?.silenced || attack?.muzzle === 'suppressor';
