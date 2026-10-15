import {
  WEAPONS,
  C4,
  DEFAULT_LOADOUTS,
  loadoutSlots,
  teamKey,
  weaponIndex,
  allowedFor,
} from '../shared/weapons.js';
import { ECON, PRICES, killReward } from '../shared/econ.js';
import { groundAt } from '../shared/map.js';
import { raycastWorld } from '../shared/raycast.js';
import { PLAYER } from '../shared/constants.js';
import { skinIndex } from '../shared/skins.js';

let api = null;
export function initEcon(currentApi) {
  api = currentApi;
}

const roundToTwoDecimals = (value) => Math.round(value * 100) / 100;
const fullAmmo = (weapon) => ({ mag: WEAPONS[weapon].mag, reserve: WEAPONS[weapon].reserve });

export function addMoney(player, amount, why = '') {
  if (!amount) {
    return;
  }
  player.money = Math.max(0, Math.min(ECON.max, (player.money ?? ECON.start) + amount));
  api.send(player, { t: 'money', m: player.money, d: amount, why });
}

export function setMoney(player, message) {
  player.money = message;
  api.send(player, { t: 'money', m: player.money, d: 0 });
}

export function knifeOf(player) {
  return loadoutSlots(player.loadout, teamKey(player.team))[2];
}

export function invOf(player) {
  const slots = player.slots;
  const pick = (slot) =>
    [slots[0], slots[1]].find(
      (index) => (index ?? null) !== null && WEAPONS[index]?.slot === slot,
    ) ?? null;
  return { primary: pick('primary'), secondary: pick('secondary') };
}

export function setInv(player, { primary, secondary }) {
  const knife = knifeOf(player);
  const nade = player.slots[3] ?? null;
  const bomb = player.slots.includes(C4);
  player.slots = [
    primary ?? secondary ?? knife,
    secondary ?? primary ?? knife,
    knife,
    nade,
    ...(bomb ? [C4] : []),
  ];
  if (!player.slots.includes(player.weapon)) {
    player.weapon = player.slots[0];
  }
}

export function defaultSlots(player) {
  const key = teamKey(player.team);
  const pistol = weaponIndex(DEFAULT_LOADOUTS[key].secondary);
  return [pistol, pistol, knifeOf(player), null];
}

export const skinOf = (player, weapon) =>
  player.wskin?.[weapon] ?? player.skins?.[WEAPONS[weapon]?.id] ?? 'default';

export function sendInv(player, changed = []) {
  api.send(player, {
    t: 'inv',
    sl: player.slots,
    w: player.weapon,
    am: changed.map((index) => [index, player.ammo[index].mag, player.ammo[index].reserve]),
    ws: player.wskin || {},
  });
}

export function absorbArmor(player, damage) {
  if (!(player.armor > 0) || damage <= 0) {
    return damage;
  }
  const absorbed = Math.min(player.armor, damage);
  player.armor -= absorbed;
  api.send(player, { t: 'armor', a: player.armor });
  return damage - absorbed;
}

export function landingSpot(room, player, distance = 1.2) {
  const map = room.map;
  let positionX = player.pos[0];
  let positionZ = player.pos[2];
  if (distance > 0) {
    const direction = [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)];
    const origin = [player.pos[0], player.pos[1] + 1.0, player.pos[2]];
    const hit = raycastWorld(origin, direction, distance, room.solids);
    const reach = Math.max(0, (hit ? hit.t : distance) - 0.45);
    const nextX = origin[0] + direction[0] * reach;
    const nextZ = origin[2] + direction[2] * reach;
    const ground = groundAt(map, nextX, nextZ);
    const inside = room.solids.some(
      (other) =>
        !other.floor &&
        nextX > other.min[0] - 0.15 &&
        nextX < other.max[0] + 0.15 &&
        nextZ > other.min[2] - 0.15 &&
        nextZ < other.max[2] + 0.15 &&
        other.max[1] > ground + 0.05 &&
        other.min[1] < ground + 1.0,
    );
    if (!inside && ground <= player.pos[1] + PLAYER.step + 0.05) {
      positionX = nextX;
      positionZ = nextZ;
    }
  }
  positionX = Math.max(-map.hx + 0.5, Math.min(map.hx - 0.5, positionX));
  positionZ = Math.max(-map.hz + 0.5, Math.min(map.hz - 0.5, positionZ));
  return [
    roundToTwoDecimals(positionX),
    groundAt(map, positionX, positionZ),
    roundToTwoDecimals(positionZ),
  ];
}

export function spawnDrop(room, weapon, position, ammo, skin = 'default') {
  const direction = {
    id: ++room.dropId,
    w: weapon,
    p: position,
    ry: Math.random() * Math.PI * 2,
    ammo: { ...ammo },
    skin,
  };
  room.drops.push(direction);
  api.broadcast(room, {
    t: 'wdrop',
    id: direction.id,
    w: weapon,
    p: position,
    ry: roundToTwoDecimals(direction.ry),
    sk: skinIndex(skin),
  });
  return direction;
}

export function clearDrops(room) {
  room.drops = [];
}

export function dropOnDeath(room, player) {
  const { primary, secondary } = invOf(player);
  const weapon = primary ?? secondary;
  if ((weapon ?? null) === null) {
    return;
  }
  spawnDrop(
    room,
    weapon,
    landingSpot(room, player, 0),
    player.ammo[weapon],
    skinOf(player, weapon),
  );
}

export function dropHeld(room, player) {
  const weapon = player.weapon;
  const definition = WEAPONS[weapon];
  if (
    !player.alive ||
    !definition ||
    (definition.slot !== 'primary' && definition.slot !== 'secondary')
  ) {
    return;
  }
  const inv = invOf(player);
  spawnDrop(
    room,
    weapon,
    landingSpot(room, player, 1.4),
    player.ammo[weapon],
    skinOf(player, weapon),
  );
  setInv(player, {
    primary: definition.slot === 'primary' ? null : inv.primary,
    secondary: definition.slot === 'secondary' ? null : inv.secondary,
  });
  player.weapon = player.slots[0];
  player.readyAt = api.now() + WEAPONS[player.weapon].drawTime * 1000 - 150;
  sendInv(player);
}

export function pickDrop(room, player, id) {
  const index = room.drops.findIndex((direction) => direction.id === id);
  if (index < 0 || !player.alive) {
    return;
  }
  const currentDirection = room.drops[index];
  if (
    Math.hypot(player.pos[0] - currentDirection.p[0], player.pos[2] - currentDirection.p[2]) >
      2.4 ||
    Math.abs(player.pos[1] - currentDirection.p[1]) > 1.6
  ) {
    return;
  }
  const definition = WEAPONS[currentDirection.w];
  if (definition.slot !== 'primary' && definition.slot !== 'secondary') {
    return;
  }
  room.drops.splice(index, 1);
  api.broadcast(room, { t: 'wpick', id: currentDirection.id, i: player.id });
  const inv = invOf(player);
  const old = inv[definition.slot];
  if ((old ?? null) !== null) {
    spawnDrop(room, old, currentDirection.p, player.ammo[old], skinOf(player, old));
  }
  player.ammo[currentDirection.w] = { ...currentDirection.ammo };
  player.wskin = {
    ...(player.wskin || {}),
    [currentDirection.w]: currentDirection.skin || 'default',
  };
  setInv(player, { ...inv, [definition.slot]: currentDirection.w });
  player.weapon = currentDirection.w;
  player.reloading = false;
  player.readyAt = api.now() + definition.drawTime * 1000 - 150;
  sendInv(player, [currentDirection.w]);
}

export function canBuy(room, player, now) {
  const competitive = room.comp;
  if (!competitive || !player.alive || room.winner >= 0) {
    return false;
  }
  const inTime =
    competitive.phase === 'freeze' ||
    (competitive.phase === 'live' && now - (competitive.liveAt || 0) < ECON.buyMs);
  if (!inTime) {
    return false;
  }
  const positionZ = room.map.spawn[teamKey(player.team)];
  const deltaX = Math.max(positionZ.x[0] - player.pos[0], 0, player.pos[0] - positionZ.x[1]);
  const deltaZ = Math.max(positionZ.z[0] - player.pos[2], 0, player.pos[2] - positionZ.z[1]);
  return Math.hypot(deltaX, deltaZ) < 8;
}

export function buy(room, player, id, now) {
  if (id === 'vest') {
    if (
      !canBuy(room, player, now) ||
      (player.armor || 0) >= ECON.vestArmor ||
      (player.money ?? 0) < ECON.vestPrice
    ) {
      return false;
    }
    player.armor = ECON.vestArmor;
    addMoney(player, -ECON.vestPrice, 'buy');
    api.send(player, { t: 'armor', a: player.armor });
    return true;
  }
  const weapon = weaponIndex(id);
  const definition = WEAPONS[weapon];
  const price = PRICES[id];
  if (
    weapon < 0 ||
    (price ?? null) === null ||
    !canBuy(room, player, now) ||
    !allowedFor(definition, teamKey(player.team))
  ) {
    return false;
  }
  if ((player.money ?? 0) < price) {
    return false;
  }
  if (definition.slot === 'grenade') {
    if (player.slots[3] === weapon && player.ammo[weapon].mag > 0) {
      return false;
    }
    player.slots[3] = weapon;
    player.ammo[weapon] = fullAmmo(weapon);
  } else if (definition.slot === 'primary' || definition.slot === 'secondary') {
    const inv = invOf(player);
    if (inv[definition.slot] === weapon) {
      return false;
    }
    const old = inv[definition.slot];
    if ((old ?? null) !== null) {
      spawnDrop(room, old, landingSpot(room, player, 0), player.ammo[old], skinOf(player, old));
    }
    player.ammo[weapon] = fullAmmo(weapon);
    if (player.wskin) {
      delete player.wskin[weapon];
    }
    setInv(player, { ...inv, [definition.slot]: weapon });
    player.weapon = weapon;
    player.reloading = false;
    player.readyAt = now + definition.drawTime * 1000 - 150;
  } else {
    return false;
  }
  addMoney(player, -price, 'buy');
  sendInv(player, [weapon]);
  return true;
}

export function freeBuy(room, player, id) {
  if (!player.alive || room.winner >= 0) {
    return false;
  }
  player.loadout ||= {};
  if (id === 'vest') {
    player.armor = ECON.vestArmor;
    player.loadout.vest = true;
    api.send(player, { t: 'armor', a: player.armor });
    return true;
  }
  const weapon = weaponIndex(id);
  const definition = WEAPONS[weapon];
  if (weapon < 0 || !['primary', 'secondary', 'grenade'].includes(definition.slot)) {
    return false;
  }
  if (!allowedFor(definition, teamKey(player.team))) {
    return false;
  }
  player.loadout[definition.slot] = id;
  player.ammo[weapon] = fullAmmo(weapon);
  if (definition.slot === 'grenade') {
    player.slots[3] = weapon;
  } else {
    setInv(player, { ...invOf(player), [definition.slot]: weapon });
    player.weapon = weapon;
    player.reloading = false;
    player.readyAt = api.now() + definition.drawTime * 1000 - 150;
  }
  sendInv(player, [weapon]);
  return true;
}

export function botBuy(room, bot, now) {
  const key = teamKey(bot.team);
  const have = invOf(bot);
  const message = () => bot.money ?? 0;
  if ((have.primary ?? null) === null) {
    const rifle = key === 'T' ? 'rifle' : Math.random() < 0.5 ? 'm4' : 'm4a4';
    if (message() >= 4750 + 1000 && Math.random() < 0.2) {
      buy(room, bot, 'awp', now);
    } else if (message() >= PRICES[rifle] + 300) {
      buy(room, bot, rifle, now);
    } else if (message() >= 2300 && Math.random() < 0.6) {
      buy(room, bot, key === 'T' ? 'mac10' : 'mp9', now);
    }
  }
  if (message() >= ECON.vestPrice + 200 && Math.random() < 0.8) {
    buy(room, bot, 'vest', now);
  }
  if (message() >= 900 && Math.random() < 0.6) {
    buy(room, bot, Math.random() < 0.5 ? 'he' : 'smoke', now);
  }
  if (
    have.secondary === weaponIndex(DEFAULT_LOADOUTS[key].secondary) &&
    message() >= 1500 &&
    Math.random() < 0.3
  ) {
    buy(room, bot, 'deagle', now);
  }
  bot.weapon = bot.slots[0];
}

export const killMoney = (weapon) => killReward(weapon);
