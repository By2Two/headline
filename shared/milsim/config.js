import { allowedFor, teamKey } from '../weapons.js';
import { MW, mw, caliberOf, ammoFor, attachFor, ATTACH, AMMO } from './weapons.js';

export const MIL = {
  maxPlayers: 48,
  maxTeamPlayers: 24,
  maxBots: 47,
  respawnMs: 15000,
  downedMs: 90000,
  stableExtendMs: 60000,
  downedMaxMs: 180000,
  giveUpAfterMs: 15000,
  reviveMsBasic: 10000,
  reviveHpBasic: 25,
  maxRevives: 2,
  bleedRates: [0, 0.35, 0.8, 1.6],
  bodyMs: 120000,
  dragMult: 0.35,
  downedHp: 100,
  reviveMs: 5000,
  reviveHp: 50,
  bleedRate: 0.7,
  bleedFrom: 18,
  winHoldMs: 180000,
  winPauseMs: 15000,
  spawnCost: 15,
  spawnProtectMs: 1500,
  hp: 100,
  gravity: 9.81,
  maxBulletTime: 3.2,
  capRate: 1 / 45,
  capMaxMen: 5,
  capRegen: 1 / 60,
  mainSupply: 30000,
  mainRegen: 25,
  sectorMax: 3000,
  fobMax: 4000,
  truckMax: 1500,
  loadRate: 100,
  pointMax: 3000,
  pointProduce: 200,
  pointEveryMs: 25000,
  upkeepEveryMs: 10000,
  upkeepBase: 1,
  upkeepPerStructure: 0.25,
  fobCost: 300,
  fobMinDist: 300,
  fobRadius: 100,
  maxFobs: 3,
  structLimitSector: 40,
  structLimitFob: 25,
  structLimitMap: 260,
  buildReach: 14,
  tentReach: 14,
  vehCooldownMs: 180000,
  vehPerTeam: 14,
  vehAbandonMs: 300000,
  vehIdleMs: 240000,
  botWalkDist: 240,
  botRideDist: 120,
  resupplyCost: 10,
  mgBeltCost: 8,
  healCost: 10,
  mortarShellCost: 5,
  enemyBaseNoGo: 330,
  prepMs: 40000,
  respawnMaxMs: 30000,
  fobBlockDist: 50,
  baseInnerR: 90,
  baseGraceMs: 6000,
  baseDps: 12,
};

export const TEAM_NAMES = ['OPFOR', 'BLUFOR'];
export const SQUADS = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'];
export const SQUAD_SIZE = 6;
export const SQUAD_COLORS = ['#7fd07a', '#f1c75b', '#c48cff', '#5fd3e0'];
export const VOICE_RANGE = 50;
export const MARKER_TYPES = {
  move: 'squad',
  attack: 'squad',
  defend: 'squad',
  observe: 'squad',
  enemy: 'team',
  vehicle: 'team',
  fob: 'team',
  supply: 'team',
  mortar: 'team',
};
export const TEAM_COLORS = ['#e8892b', '#4a9be8'];

export const MOVE_MIL = {
  slow: 0.95,
  walk: 1.7,
  run: 4.0,
  sprint: 6.2,
  crouchWalk: 1.2,
  crouchRun: 2.6,
  prone: 0.8,
  accel: 6,
  airAccel: 1.2,
  friction: 4.2,
  stopSpeed: 1.8,
  gravity: 13,
  jump: 3.3,
  maxSlope: 0.95,
  adsMult: 0.55,
  proneHeight: 0.55,
  proneEye: 0.32,
  rollSpeed: 3.2,
  rollTime: 0.45,
};

export const STAMINA = {
  sprintDrain: 0.045,
  runRegen: 0.018,
  jumpCost: 0.07,
  regenIdle: 0.07,
  regenWalk: 0.04,
  regenCrouch: 0.085,
  regenSeated: 0.06,
  lowAt: 0.25,
  noSprintBelow: 0.08,
  breathHoldDrain: 0.07,
  rollCost: 0.08,
};

export const BASE_WEIGHT = 9;

export const MIL_CLASS = {
  rifle: {
    v: 860,
    k: 0.00095,
    dmg: 1.45,
    kg: 3.8,
    kick: 1.25,
    side: 0.45,
    ads: 0.28,
    sway: 1,
    zero: [100, 200, 300, 400, 500, 600, 700, 800],
    hip: 0.035,
    moa: 0.0006,
    range: 320,
  },
  smg: {
    v: 400,
    k: 0.0019,
    dmg: 1.25,
    kg: 2.8,
    kick: 0.65,
    side: 0.35,
    ads: 0.21,
    sway: 0.8,
    zero: [25, 50, 100, 150, 200],
    hip: 0.028,
    moa: 0.0014,
    range: 110,
  },
  sniper: {
    v: 900,
    k: 0.0005,
    dmg: 1.2,
    kg: 6.5,
    kick: 3.2,
    side: 0.6,
    ads: 0.42,
    sway: 1.15,
    zero: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
    hip: 0.06,
    moa: 0.00012,
    range: 700,
  },
  mg: {
    v: 850,
    k: 0.001,
    dmg: 1.35,
    kg: 8.5,
    kick: 1.05,
    side: 0.6,
    ads: 0.48,
    sway: 1.5,
    zero: [100, 200, 300, 400, 500, 600, 700, 800],
    hip: 0.05,
    moa: 0.0011,
    range: 360,
  },
  shotgun: {
    v: 400,
    k: 0.006,
    dmg: 1.0,
    kg: 3.6,
    kick: 3.0,
    side: 0.8,
    ads: 0.26,
    sway: 1,
    zero: [25, 50, 75, 100],
    hip: 0.03,
    moa: 0.001,
    range: 45,
  },
  pistol: {
    v: 360,
    k: 0.0021,
    dmg: 1.2,
    kg: 1.0,
    kick: 1.9,
    side: 0.55,
    ads: 0.17,
    sway: 0.75,
    zero: [25, 50],
    hip: 0.03,
    moa: 0.002,
    range: 55,
  },
  launcher: {
    v: 120,
    k: 0.0002,
    dmg: 1,
    kg: 6.3,
    kick: 4,
    side: 0.5,
    ads: 0.6,
    sway: 1.6,
    zero: [50, 100, 150, 200, 300],
    hip: 0.04,
    moa: 0.002,
    range: 220,
  },
  melee: {
    v: 0,
    k: 0,
    dmg: 1.2,
    kg: 0.3,
    kick: 0,
    side: 0,
    ads: 0.2,
    sway: 0.5,
    zero: null,
    hip: 0,
    moa: 0,
    range: 2,
  },
  tool: {
    v: 0,
    k: 0,
    dmg: 1,
    kg: 1.2,
    kick: 0,
    side: 0,
    ads: 0.2,
    sway: 0.5,
    zero: null,
    hip: 0,
    moa: 0,
    range: 2,
  },
  grenade: {
    v: 0,
    k: 0,
    dmg: 1,
    kg: 0.5,
    kick: 0,
    side: 0,
    ads: 0.2,
    sway: 0.5,
    zero: null,
    hip: 0,
    moa: 0,
    range: 30,
  },
  medical: {
    v: 0,
    k: 0,
    dmg: 0,
    kg: 0.2,
    kick: 0,
    side: 0,
    ads: 0.2,
    sway: 0.5,
    zero: null,
    hip: 0,
    moa: 0,
    range: 0,
  },
};
export const milClass = (weapon) => MIL_CLASS[weapon?.class] || MIL_CLASS.rifle;
export const PART_MULT_MIL = { head: 3.2, body: 1, arms: 0.75, legs: 0.7 };

export function zeroList(weapon, optic) {
  const positionZ = milClass(weapon).zero;
  if (!positionZ) {
    return null;
  }
  if (weapon.class === 'rifle' || weapon.class === 'mg') {
    return optic === 'iron' ? positionZ.slice(0, 4) : positionZ;
  }
  return positionZ;
}

export function fireModes(weapon) {
  if (!weapon || weapon.melee || weapon.grenade || weapon.item || !weapon.auto) {
    return ['SEMI'];
  }
  return ['AUTO', 'SEMI'];
}

export const OPTICS = [
  { id: 'iron', name: 'Iron sights', cost: 0, kg: 0, zoom: 1.15, mag: false },
  { id: 'reddot', name: 'Red dot', cost: 10, kg: 0.25, zoom: 1.25, mag: false },
  { id: 'holo', name: 'Holographic', cost: 12, kg: 0.35, zoom: 1.3, mag: false },
  {
    id: 'acog',
    name: '4x combat scope',
    cost: 20,
    kg: 0.5,
    zoom: 4,
    mag: true,
    zoomRange: [1.5, 4],
  },
  {
    id: 'scope8',
    name: '8x marksman scope',
    cost: 28,
    kg: 0.7,
    zoom: 8,
    mag: true,
    zoomRange: [2, 8],
  },
  {
    id: 'scope12',
    name: '12x long-range scope',
    cost: 36,
    kg: 1.1,
    zoom: 12,
    mag: true,
    zoomRange: [3, 12],
  },
];
export const VESTS = [
  { id: 'none', name: 'No vest', cost: 0, kg: 0, prot: 0, slots: 0 },
  { id: 'light', name: 'Soft vest (IIIA)', cost: 15, kg: 4, prot: 0.3, slots: 6 },
  { id: 'heavy', name: 'Plate carrier (IV)', cost: 35, kg: 10, prot: 0.5, slots: 10 },
];
export const HELMETS = [
  { id: 'none', name: 'No helmet', cost: 0, kg: 0, prot: 0 },
  { id: 'light', name: 'Combat helmet', cost: 10, kg: 1.3, prot: 0.3 },
  { id: 'heavy', name: 'Ballistic helmet', cost: 22, kg: 2.1, prot: 0.5 },
];
export const PACKS = [
  { id: 'none', name: 'No backpack', cost: 0, kg: 0, slots: 0 },
  { id: 'small', name: 'Assault pack', cost: 5, kg: 1.5, slots: 8 },
  { id: 'large', name: 'Field pack', cost: 10, kg: 2.5, slots: 14 },
];
export const UNIFORMS = ['forest', 'desert', 'urban', 'night', 'arctic'];
export const POCKET_SLOTS = 4;

export const ITEMS = {
  he: { name: 'HE grenade', size: 1, kg: 0.45, cost: 5, max: 2 },
  smoke: { name: 'Smoke grenade', size: 1, kg: 0.4, cost: 4, max: 2 },
  bandage: { name: 'Bandage', size: 1, kg: 0.1, cost: 1, max: 6 },
  medkit: { name: 'Medical kit', size: 2, kg: 1.0, cost: 6, max: 3, cls: 'medic' },
  rocket: { name: 'HEAT rocket', size: 3, kg: 2.6, cost: 25, max: 3, cls: 'assault' },
  shovel: { name: 'Entrenching tool', size: 2, kg: 1.2, cost: 3, max: 1, cls: 'engineer' },
  binos: { name: 'Binoculars', size: 1, kg: 0.6, cost: 5, max: 1 },
  map: { name: 'Map', size: 0, kg: 0.05, cost: 0, max: 1 },
  light: { name: 'Flashlight', size: 0, kg: 0.2, cost: 2, max: 1 },
  nvg: { name: 'Night vision', size: 0, kg: 0.7, cost: 15, max: 1 },
};
export const MAG_COST = 2;

export const CLASSES = {
  assault: {
    name: 'Assault',
    desc: 'Rifles, machine guns, extra grenades and an RPG.',
    weapons: ['rifle', 'mg'],
    extra: { he: 4 },
    launcher: true,
  },
  medic: {
    name: 'Medic',
    desc: 'SMGs and medical kits. Heals and revives allies.',
    weapons: ['smg'],
    medkit: true,
  },
  engineer: {
    name: 'Engineer',
    desc: 'Shotguns, SMGs and a shovel. Builds structures and repairs vehicles.',
    weapons: ['shotgun', 'smg'],
    shovel: true,
  },
  sniper: {
    name: 'Sniper',
    desc: 'Sniper rifles and a rangefinder.',
    weapons: ['sniper'],
    rangefinder: true,
  },
};
export const CLASS_IDS = Object.keys(CLASSES);

export const milPrimaries = (team, classId = 'assault') =>
  MW.filter(
    (weapon) =>
      weapon.slot === 'primary' &&
      !weapon.disabled &&
      allowedFor(weapon, teamKey(team)) &&
      (CLASSES[classId] || CLASSES.assault).weapons.includes(weapon.class),
  );
export const milSecondaries = (team) =>
  MW.filter(
    (weapon) =>
      weapon.slot === 'secondary' &&
      !weapon.disabled &&
      weapon.id !== 'dualies' &&
      allowedFor(weapon, teamKey(team)),
  );

export const builtInOptic = (weapon, chosen) => {
  if (!weapon?.scope) {
    return null;
  }
  if (weapon.class !== 'sniper') {
    return 'acog';
  }
  return chosen === 'scope12' ? 'scope12' : 'scope8';
};
export function opticsFor(weapon) {
  if (!weapon || weapon.slot !== 'primary') {
    return ['iron'];
  }
  const currentBuiltInOptic = builtInOptic(weapon);
  if (currentBuiltInOptic) {
    return currentBuiltInOptic === 'scope8' ? ['scope8', 'scope12'] : [currentBuiltInOptic];
  }
  if (weapon.class === 'shotgun' || weapon.class === 'smg') {
    return ['iron', 'reddot', 'holo'];
  }
  return ['iron', 'reddot', 'holo', 'acog', 'scope8', 'scope12'];
}

const byId = (list, id) => list.find((options) => options.id === id);
const clampN = (value, max) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
const magSize = (width) => {
  const weapon = mw(width);
  if (!weapon) {
    return 1;
  }
  return caliberOf(width).includes('belt') ? 2 : 1;
};

export function defaultKit(team, classId = 'assault') {
  const prim =
    {
      assault: team === 1 ? 'm4a4' : 'rifle',
      medic: team === 1 ? 'mp9' : 'mac10',
      engineer: 'shotgun',
      sniper: 'scout',
    }[classId] || 'rifle';
  const sec = team === 1 ? 'usp' : 'glock';
  const mags = [
    { w: prim, ammo: 'fmj' },
    { w: prim, ammo: 'fmj' },
    { w: prim, ammo: 'fmj' },
    { w: sec, ammo: 'fmj' },
    { w: sec, ammo: 'fmj' },
  ];
  return {
    cls: classId,
    uniform: team === 1 ? 'forest' : 'desert',
    helmet: 'light',
    vest: 'light',
    pack: 'small',
    primary: {
      id: prim,
      optic: classId === 'sniper' ? 'scope8' : 'iron',
      muzzle: 'none',
      rail: 'none',
      grip: 'none',
    },
    secondary: { id: sec, rail: 'none' },
    launcher: classId === 'assault' ? 'rpg' : '',
    ghillie: classId === 'sniper',
    mags,
    items: {
      he: classId === 'assault' ? 1 : 0,
      smoke: classId === 'assault' || classId === 'medic' ? 1 : 0,
      bandage: 2,
      medkit: classId === 'medic' ? 2 : 0,
      rocket: classId === 'assault' ? 1 : 0,
      shovel: classId === 'engineer' ? 1 : 0,
      binos: 1,
      map: 1,
      light: 0,
      nvg: 0,
    },
  };
}

export const capacityOf = (kit) =>
  POCKET_SLOTS + (byId(VESTS, kit.vest)?.slots || 0) + (byId(PACKS, kit.pack)?.slots || 0);
export function usedSlots(kit) {
  let count = 0;
  for (const magazine of kit.mags || []) {
    count += magSize(magazine.w);
  }
  for (const [key, cost] of Object.entries(kit.items || {})) {
    count += (ITEMS[key]?.size || 0) * cost;
  }
  if (kit.launcher) {
    count += 4;
  }
  return count;
}

export function sanitizeKit(key, team) {
  const options = key && typeof key === 'object' ? key : {};
  const classId = CLASSES[options.cls] ? options.cls : 'assault';
  const definition = defaultKit(team, classId);
  const prims = milPrimaries(team, classId);
  const primaryWeapon =
    prims.find((weapon) => weapon.id === options.primary?.id) ||
    prims.find((weapon) => weapon.id === definition.primary.id) ||
    prims[0];
  const secs = milSecondaries(team);
  const secondaryWeapon =
    options.secondary === null
      ? null
      : secs.find((weapon) => weapon.id === options.secondary?.id) ||
        secs.find((weapon) => weapon.id === definition.secondary.id);
  const pick = (value, list) => (list.includes(value) ? value : list[0]);
  const primary = {
    id: primaryWeapon.id,
    optic: pick(options.primary?.optic ?? definition.primary.optic, opticsFor(primaryWeapon)),
    muzzle: pick(options.primary?.muzzle, attachFor(primaryWeapon, 'muzzle')),
    rail: pick(options.primary?.rail, attachFor(primaryWeapon, 'rail')),
    grip: pick(options.primary?.grip, attachFor(primaryWeapon, 'grip')),
  };
  const secondary = secondaryWeapon
    ? {
        id: secondaryWeapon.id,
        rail: pick(options.secondary?.rail, attachFor(secondaryWeapon, 'rail')),
      }
    : null;
  const launcher =
    CLASSES[classId].launcher && (options.launcher ?? definition.launcher) === 'rpg' ? 'rpg' : '';
  const calibers = new Set([
    caliberOf(primaryWeapon.id),
    secondaryWeapon ? caliberOf(secondaryWeapon.id) : null,
  ]);
  const mags = (Array.isArray(options.mags) ? options.mags : definition.mags)
    .slice(0, 20)
    .filter((magazine) => magazine && mw(magazine.w) && calibers.has(caliberOf(magazine.w)))
    .map((magazine) => ({
      w: magazine.w,
      ammo: ammoFor(mw(magazine.w)).includes(magazine.ammo)
        ? magazine.ammo
        : ammoFor(mw(magazine.w))[0],
    }));
  const items = {};
  for (const [id, item] of Object.entries(ITEMS)) {
    let max = item.max;
    if (item.cls && item.cls !== classId) {
      max = 0;
    }
    if (id === 'he' && CLASSES[classId].extra?.he) {
      max = CLASSES[classId].extra.he;
    }
    if (id === 'rocket' && !launcher) {
      max = 0;
    }
    items[id] = clampN(options.items?.[id] ?? definition.items[id] ?? 0, max);
  }
  const kit = {
    cls: classId,
    uniform: UNIFORMS.includes(options.uniform) ? options.uniform : definition.uniform,
    helmet: byId(HELMETS, options.helmet) ? options.helmet : definition.helmet,
    vest: byId(VESTS, options.vest) ? options.vest : definition.vest,
    pack: byId(PACKS, options.pack) ? options.pack : definition.pack,
    primary,
    secondary,
    launcher,
    ghillie: classId === 'sniper' && (options.ghillie ?? definition.ghillie) === true,
    mags,
    items,
  };
  for (const width of [primary.id, secondary?.id].filter(Boolean)) {
    const caliber = caliberOf(width);
    const have = kit.mags.filter((magazine) => caliberOf(magazine.w) === caliber).length;
    for (let index = have; index < 2; index++) {
      kit.mags.unshift({ w: width, ammo: ammoFor(mw(width))[0] });
    }
  }
  const cap = capacityOf(kit);
  const order = ['rocket', 'medkit', 'shovel', 'smoke', 'he', 'bandage', 'binos'];
  for (const id of order) {
    while (usedSlots(kit) > cap && kit.items[id] > 0) {
      kit.items[id]--;
    }
  }
  while (usedSlots(kit) > cap && kit.mags.length) {
    kit.mags.pop();
  }
  if (usedSlots(kit) > cap) {
    kit.launcher = '';
  }
  return kit;
}

export function kitCost(kit) {
  const primaryWeapon = mw(kit.primary?.id);
  const PRIMARY_COST = { pistol: 0, smg: 8, shotgun: 8, rifle: 18, mg: 38, sniper: 42 };
  let cost = PRIMARY_COST[primaryWeapon?.class] ?? 15;
  if (!builtInOptic(primaryWeapon)) {
    cost += byId(OPTICS, kit.primary?.optic)?.cost || 0;
  }
  for (const slots of ['muzzle', 'rail', 'grip']) {
    cost += byId(ATTACH[slots], kit.primary?.[slots])?.cost || 0;
  }
  if (kit.secondary) {
    cost += 3 + (byId(ATTACH.rail, kit.secondary.rail)?.cost || 0);
  }
  if (kit.launcher) {
    cost += 15;
  }
  if (kit.ghillie) {
    cost += 8;
  }
  for (const magazine of kit.mags || []) {
    cost += MAG_COST + (AMMO[magazine.ammo]?.cost || 0);
  }
  for (const [key, count] of Object.entries(kit.items || {})) {
    cost += (ITEMS[key]?.cost || 0) * count;
  }
  cost += byId(VESTS, kit.vest)?.cost || 0;
  cost += byId(HELMETS, kit.helmet)?.cost || 0;
  cost += byId(PACKS, kit.pack)?.cost || 0;
  return cost;
}

export function kitWeight(kit) {
  const primaryWeapon = mw(kit.primary?.id);
  let weight = BASE_WEIGHT + milClass(primaryWeapon).kg;
  if (!builtInOptic(primaryWeapon)) {
    weight += byId(OPTICS, kit.primary?.optic)?.kg || 0;
  }
  for (const slots of ['muzzle', 'rail', 'grip']) {
    weight += byId(ATTACH[slots], kit.primary?.[slots])?.kg || 0;
  }
  if (kit.secondary) {
    weight += 1;
  }
  if (kit.launcher) {
    weight += 6.3;
  }
  if (kit.ghillie) {
    weight += 2.5;
  }
  for (const magazine of kit.mags || []) {
    weight += magSize(magazine.w) > 1 ? 2.5 : 0.45;
  }
  for (const [key, count] of Object.entries(kit.items || {})) {
    weight += (ITEMS[key]?.kg || 0) * count;
  }
  weight += byId(VESTS, kit.vest)?.kg || 0;
  weight += byId(HELMETS, kit.helmet)?.kg || 0;
  weight += byId(PACKS, kit.pack)?.kg || 0;
  return Math.round(weight * 10) / 10;
}

export function weightEffects(weight) {
  const over = Math.max(0, weight - 16);
  return {
    speed: Math.max(0.9, 1 - over * 0.004),
    drain: 1 + over * 0.035,
    regen: 1 / (1 + over * 0.025),
  };
}

export const vestOf = (kit) => byId(VESTS, kit.vest) || VESTS[0];
export const helmetOf = (kit) => byId(HELMETS, kit.helmet) || HELMETS[0];
export const opticOf = (id) => byId(OPTICS, id) || OPTICS[0];

export const encodeGear = (kit) =>
  [
    VESTS.findIndex((value) => value.id === kit.vest),
    HELMETS.findIndex((value) => value.id === kit.helmet),
    PACKS.findIndex((value) => value.id === kit.pack),
    OPTICS.findIndex((value) => value.id === kit.primary?.optic),
    UNIFORMS.indexOf(kit.uniform),
    kit.items?.nvg ? 1 : 0,
    kit.primary?.muzzle === 'suppressor' ? 1 : 0,
    kit.launcher ? 1 : 0,
    kit.primary?.rail === 'light' ? 1 : 0,
    ATTACH.grip.findIndex((grip) => grip.id === kit.primary?.grip),
    CLASS_IDS.indexOf(kit.cls),
    kit.ghillie ? 1 : 0,
  ]
    .map((count) => Math.max(0, count))
    .join('');
export function decodeGear(code) {
  const slots = String(code || '000000000000');
  const at = (index, list) => list[Number(slots[index])] || list[0];
  return {
    vest: at(0, VESTS).id,
    helmet: at(1, HELMETS).id,
    pack: at(2, PACKS).id,
    optic: at(3, OPTICS).id,
    uniform: UNIFORMS[Number(slots[4])] || 'forest',
    nvg: slots[5] === '1',
    suppressor: slots[6] === '1',
    launcher: slots[7] === '1',
    light: slots[8] === '1',
    grip: ATTACH.grip[Number(slots[9])]?.id || 'none',
    cls: CLASS_IDS[Number(slots[10])] || 'assault',
    ghillie: slots[11] === '1',
  };
}

export const STRUCTS = {
  sandbags: {
    name: 'Sandbags',
    cost: 20,
    hp: 700,
    bulletMult: 0.05,
    desc: 'Low wall of sandbags. Stops bullets.',
  },
  barricade: {
    name: 'Barricade',
    cost: 15,
    hp: 350,
    bulletMult: 0.6,
    desc: 'Wooden barricade. Cheap, breaks easily.',
  },
  wall: {
    name: 'Concrete wall',
    cost: 50,
    hp: 2400,
    bulletMult: 0.02,
    desc: 'Tall T-wall. Blocks sight and bullets.',
  },
  hesco: {
    name: 'HESCO fortification',
    cost: 80,
    hp: 3000,
    bulletMult: 0.02,
    desc: 'Large earth-filled barrier.',
  },
  hedgehog: {
    name: 'Anti-vehicle barrier',
    cost: 25,
    hp: 1500,
    bulletMult: 0.01,
    desc: 'Steel barrier. Stops vehicles.',
  },
  wire: {
    name: 'Barbed wire',
    cost: 10,
    hp: 200,
    bulletMult: 0.2,
    desc: 'Slows and hurts infantry.',
  },
  cover: {
    name: 'Infantry cover',
    cost: 15,
    hp: 600,
    bulletMult: 0.05,
    desc: 'Low wall to crouch behind.',
  },
  post: {
    name: 'Defensive post',
    cost: 60,
    hp: 1200,
    bulletMult: 0.04,
    desc: 'Sandbag ring for a fighting position.',
  },
  mg: {
    name: 'MG position',
    cost: 120,
    hp: 1400,
    bulletMult: 0.04,
    desc: 'Mounted machine gun in a sandbag nest.',
    limit: 3,
  },
  tower: {
    name: 'Observation tower',
    cost: 90,
    hp: 1500,
    bulletMult: 0.25,
    desc: 'Wooden lookout tower.',
    limit: 1,
    flat: 0.8,
  },
  bunker: {
    name: 'Small bunker',
    cost: 150,
    hp: 4500,
    bulletMult: 0.01,
    desc: 'Covered bunker with firing slits.',
    limit: 3,
    flat: 0.7,
  },
  ammo: {
    name: 'Ammo crate',
    cost: 40,
    hp: 400,
    bulletMult: 0.5,
    desc: 'Resupply and change gear.',
    limit: 3,
  },
  medical: {
    name: 'Medical point',
    cost: 60,
    hp: 400,
    bulletMult: 0.5,
    desc: 'Heals to full health.',
    limit: 2,
  },
  mortar: {
    name: 'Mortar pit',
    cost: 150,
    hp: 1200,
    bulletMult: 0.05,
    desc: 'Indirect fire support.',
    limit: 2,
    flat: 1.0,
  },
  fob: {
    name: 'FOB radio',
    cost: MIL.fobCost,
    hp: 2000,
    bulletMult: 0.3,
    desc: 'Forward base. Needs a supply truck nearby.',
    fob: true,
  },
};
export const STRUCT_IDS = Object.keys(STRUCTS);
export const buildTimeOf = (type) => 3 + (STRUCTS[type]?.cost || 0) / 15;

export const VEHICLES = {
  truck: {
    name: 'Logistics truck',
    kind: 'car',
    cat: 'car',
    cost: 150,
    len: 7.2,
    wid: 2.5,
    hgt: 3.1,
    seats: 2,
    hp: 650,
    armor: 0.35,
    accel: 2.6,
    brake: 6,
    vmax: 23,
    offroad: 0.62,
    wheelbase: 4.4,
    steer: 0.55,
    cargo: MIL.truckMax,
    mass: 3,
    tip: 0.55,
  },
  jeep: {
    name: 'Jeep',
    kind: 'car',
    cat: 'car',
    cost: 80,
    len: 4.6,
    wid: 2.1,
    hgt: 1.9,
    seats: 4,
    hp: 380,
    armor: 0.6,
    accel: 4.8,
    brake: 8,
    vmax: 32,
    offroad: 0.75,
    wheelbase: 2.9,
    steer: 0.62,
    exposed: true,
    mass: 1,
    tip: 0.75,
  },
  mjeep: {
    name: 'Armed jeep (.50 cal)',
    kind: 'car',
    cat: 'car',
    cost: 140,
    len: 4.6,
    wid: 2.1,
    hgt: 2.4,
    seats: 4,
    hp: 420,
    armor: 0.6,
    accel: 4.4,
    brake: 8,
    vmax: 30,
    offroad: 0.75,
    wheelbase: 2.9,
    steer: 0.6,
    exposed: true,
    mass: 1.2,
    tip: 0.72,
  },
  transport: {
    name: 'Troop transport',
    kind: 'car',
    cat: 'car',
    cost: 150,
    len: 7.6,
    wid: 2.6,
    hgt: 3.2,
    seats: 10,
    hp: 720,
    armor: 0.35,
    accel: 2.5,
    brake: 6,
    vmax: 22,
    offroad: 0.6,
    wheelbase: 4.6,
    steer: 0.52,
    mass: 3,
    tip: 0.55,
  },
  apc: {
    name: 'APC',
    kind: 'car',
    cat: 'heavy',
    cost: 600,
    len: 6.8,
    wid: 2.9,
    hgt: 2.5,
    seats: 7,
    hp: 1600,
    armor: 0.04,
    accel: 2.8,
    brake: 6.5,
    vmax: 20,
    offroad: 0.82,
    wheelbase: 4.0,
    steer: 0.5,
    mass: 6,
    tip: 0.8,
    heavyArmor: true,
    engineRear: true,
  },
  ifv: {
    name: 'IFV (30 mm)',
    kind: 'car',
    cat: 'heavy',
    cost: 900,
    len: 7.0,
    wid: 3.1,
    hgt: 2.8,
    seats: 7,
    hp: 2200,
    armor: 0.025,
    accel: 2.4,
    brake: 6,
    vmax: 18,
    offroad: 0.86,
    wheelbase: 4.2,
    steer: 0.48,
    mass: 7,
    tip: 0.85,
    heavyArmor: true,
    tracks: true,
    pivot: 0.7,
  },
  tank: {
    name: 'Main battle tank',
    kind: 'car',
    cat: 'heavy',
    cost: 1500,
    len: 7.8,
    wid: 3.6,
    hgt: 2.6,
    seats: 3,
    hp: 3600,
    armor: 0.004,
    accel: 1.7,
    brake: 5,
    vmax: 15,
    offroad: 0.9,
    wheelbase: 4.6,
    steer: 0.4,
    mass: 12,
    tip: 1.0,
    heavyArmor: true,
    tracks: true,
    pivot: 0.5,
    engineRear: true,
  },
  heli: {
    name: 'Transport helicopter',
    kind: 'heli',
    cat: 'heli',
    cost: 800,
    len: 13,
    wid: 2.6,
    hgt: 3.6,
    seats: 8,
    hp: 650,
    armor: 0.5,
    mass: 4,
  },
  gunship: {
    name: 'Attack helicopter',
    kind: 'heli',
    cat: 'heli',
    cost: 1400,
    len: 13.5,
    wid: 2.0,
    hgt: 3.6,
    seats: 2,
    hp: 900,
    armor: 0.35,
    mass: 4,
  },
};
export const VEH_CATS = {
  car: { name: 'Vehicle depot', types: ['jeep', 'mjeep', 'truck', 'transport'] },
  heavy: { name: 'Armor depot', types: ['apc', 'ifv', 'tank'] },
  heli: { name: 'Heliport', types: ['heli', 'gunship'] },
};
export function platformVelocity(type, state) {
  if (VEHICLES[type]?.kind === 'heli') {
    return [state.vx || 0, state.vy || 0, state.vz || 0];
  }
  return [-Math.sin(state.yaw) * (state.v || 0), 0, -Math.cos(state.yaw) * (state.v || 0)];
}
export const VEH_GUNS = {
  mjeep: {
    seat: 1,
    kind: 'mg',
    name: '.50 cal',
    spread: 0.0025,
    mag: 100,
    spare: 400,
    interval: 0.11,
    turn: 3.0,
    pitch: [-0.3, 0.6],
    zoom: 1.8,
    reload: 4000,
  },
  apc: {
    seat: 1,
    kind: 'mg',
    name: 'Heavy MG',
    spread: 0.002,
    mag: 200,
    spare: 800,
    interval: 0.1,
    turn: 1.6,
    pitch: [-0.2, 0.5],
    zoom: 2.5,
    reload: 3500,
  },
  ifv: {
    seat: 1,
    kind: 'autocannon',
    name: '30 mm autocannon',
    mag: 40,
    spare: 160,
    interval: 0.32,
    turn: 1.0,
    pitch: [-0.15, 0.45],
    zoom: 4,
    reload: 5000,
  },
  tank: {
    seat: 1,
    kind: 'cannon',
    name: '120 mm cannon',
    mag: 1,
    spare: 30,
    interval: 6.0,
    turn: 0.55,
    pitch: [-0.12, 0.35],
    zoom: 6,
    reload: 6000,
  },
  gunship: {
    seat: 1,
    kind: 'mg',
    name: 'Chin minigun',
    spread: 0.005,
    mag: 500,
    spare: 1500,
    interval: 0.05,
    turn: 2.6,
    yawLimit: 1.7,
    pitch: [-1.1, 0.25],
    zoom: 3,
    reload: 4000,
  },
};
export const SHELLS = {
  autocannon: {
    v: 700,
    g: 3,
    radius: 2.8,
    dmg: 60,
    structDmg: 140,
    vehDmg: 150,
    direct: 1.3,
    maxT: 3,
    small: true,
  },
  cannon: {
    v: 480,
    g: 3.5,
    radius: 6,
    dmg: 170,
    structDmg: 1800,
    vehDmg: 1500,
    direct: 1.4,
    maxT: 5,
  },
};
export const FLEET = {
  jeep: 4,
  mjeep: 2,
  truck: 2,
  transport: 2,
  apc: 2,
  ifv: 1,
  tank: 1,
  heli: 2,
  gunship: 1,
};
export const RANKS = [
  { name: 'Recruit', short: 'Rct', xp: 0 },
  { name: 'Private', short: 'Pvt', xp: 300 },
  { name: 'Private First Class', short: 'PFC', xp: 800 },
  { name: 'Corporal', short: 'Cpl', xp: 1600 },
  { name: 'Sergeant', short: 'Sgt', xp: 2800 },
  { name: 'Staff Sergeant', short: 'SSgt', xp: 4500 },
  { name: 'Sergeant First Class', short: 'SFC', xp: 7000 },
  { name: 'Master Sergeant', short: 'MSgt', xp: 10000 },
  { name: 'Second Lieutenant', short: '2Lt', xp: 14000 },
  { name: 'First Lieutenant', short: '1Lt', xp: 19000 },
  { name: 'Captain', short: 'Capt', xp: 25000 },
  { name: 'Major', short: 'Maj', xp: 33000 },
];
export const rankOf = (experience) => {
  let rank = 0;
  for (let index = 0; index < RANKS.length; index++) {
    if ((experience || 0) >= RANKS[index].xp) {
      rank = index;
    }
  }
  return rank;
};
export const VEH_RANK = {
  jeep: 0,
  truck: 0,
  transport: 0,
  mjeep: 1,
  apc: 3,
  heli: 4,
  ifv: 5,
  tank: 8,
  gunship: 9,
};
export const XP = {
  kill: 100,
  head: 25,
  vehLight: 200,
  vehHeavy: 400,
  built: 25,
  fob: 200,
  heal: 30,
  revive: 80,
  cap: 150,
  supplyPer: 0.3,
  transport: 10,
  repair: 25,
  teamkill: -150,
};
export const VEH_RESPAWN = {
  jeep: 60000,
  mjeep: 120000,
  truck: 90000,
  transport: 90000,
  apc: 240000,
  ifv: 300000,
  tank: 420000,
  heli: 300000,
  gunship: 480000,
};
export const GEARS = {
  '-1': { v: 0.25, a: 1.1 },
  1: { v: 0.3, a: 1.45 },
  2: { v: 0.55, a: 1.05 },
  3: { v: 0.8, a: 0.78 },
  4: { v: 1, a: 0.58 },
};

export const SEATS = {
  truck: [
    [-0.6, 1.6, -2.6],
    [0.6, 1.6, -2.6],
  ],
  jeep: [
    [-0.45, 1.15, -0.25],
    [0.45, 1.15, -0.25],
    [-0.45, 1.3, 0.9],
    [0.45, 1.3, 0.9],
  ],
  transport: [
    [-0.6, 1.6, -2.8],
    [0.6, 1.6, -2.8],
    [-0.85, 1.62, -0.7],
    [0.85, 1.62, -0.7],
    [-0.85, 1.62, 0.4],
    [0.85, 1.62, 0.4],
    [-0.85, 1.62, 1.5],
    [0.85, 1.62, 1.5],
    [-0.85, 1.62, 2.6],
    [0.85, 1.62, 2.6],
  ],
  mjeep: [
    [-0.45, 1.15, -0.25],
    [0, 1.75, 0.85],
    [0.45, 1.15, -0.25],
    [0.6, 1.3, 1.5],
  ],
  ifv: [
    [-0.7, 1.5, -2.4],
    [0, 2.75, -0.3],
    [0.65, 2.75, 0.45],
    [-0.75, 1.3, 1.2],
    [0.75, 1.3, 1.2],
    [-0.75, 1.3, 2.3],
    [0.75, 1.3, 2.3],
  ],
  tank: [
    [0, 1.45, -2.8],
    [-0.5, 2.6, 0.1],
    [0.6, 2.6, 0.5],
  ],
  gunship: [
    [0, 1.65, -1.0],
    [0, 1.35, -2.7],
  ],
  apc: [
    [-0.6, 1.4, -2.2],
    [0, 2.55, -0.5],
    [-0.7, 1.2, 0],
    [0.7, 1.2, 0],
    [-0.7, 1.2, 1.1],
    [0.7, 1.2, 1.1],
    [0, 1.2, 2.2],
  ],
  heli: [
    [-0.55, 1.35, -3.5],
    [0.55, 1.35, -3.5],
    [-0.7, 1.2, -1.6],
    [0.7, 1.2, -1.6],
    [-0.7, 1.2, -0.5],
    [0.7, 1.2, -0.5],
    [-0.7, 1.2, 0.6],
    [0.7, 1.2, 0.6],
  ],
};
export const DOOR_SEATS = {
  jeep: [0, 1, 2, 3],
  mjeep: [0, 2, 3],
  truck: [0, 1],
  transport: [0, 1],
};
export const hasDoor = (type, seat) => !!DOOR_SEATS[type]?.includes(seat);
export const seatYaw = (type, seat) =>
  type === 'transport' && seat >= 2 ? (seat % 2 === 0 ? -Math.PI / 2 : Math.PI / 2) : 0;
export const seatExposed = (type, seat) =>
  !['apc', 'ifv', 'tank'].includes(type) || (type === 'apc' && seat === 1);
export const seatVisible = (type, seat) =>
  !['apc', 'ifv', 'tank'].includes(type) || (type === 'apc' && seat === 1);
export const isGunner = (type, seat) => VEH_GUNS[type]?.seat === seat;
export function seatRole(type, seat) {
  const definition = VEHICLES[type];
  if (seat === 0) {
    return definition?.kind === 'heli' ? 'pilot' : 'driver';
  }
  if (isGunner(type, seat)) {
    return 'gunner';
  }
  if ((type === 'tank' || type === 'ifv') && seat === 2) {
    return 'commander';
  }
  if (type === 'heli' && seat === 1) {
    return 'co-pilot';
  }
  return 'passenger';
}
export const REAR = { truck: [0, 1, 4.0], transport: [0, 1, 4.1] };

export const MORTAR = {
  v: 95,
  minEl: 45,
  maxEl: 85,
  cooldown: 3.2,
  radius: 20,
  lethal: 6,
  dmg: 220,
  structDmg: 900,
  vehDmg: 900,
};
export const HE_MIL = { radius: 10, dmg: 105, structDmg: 450, vehDmg: 350 };
export const ROCKET = {
  v: 120,
  g: 2.5,
  radius: 7,
  dmg: 170,
  structDmg: 1500,
  vehDmg: 1050,
  direct: 1.35,
  maxT: 4,
};

export const bearingOf = (yaw) => ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
export const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const isMilsim = (room) => room?.game === 'milsim';
export const TIMES = { day: 'Day', dusk: 'Dusk', night: 'Night' };
