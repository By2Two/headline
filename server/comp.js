import { COMP, compWinner, siteAt } from '../shared/comp.js';
import { WEAPONS, C4 } from '../shared/weapons.js';
import { groundAt } from '../shared/map.js';
import { raycastWorld } from '../shared/raycast.js';
import { PLAYER } from '../shared/constants.js';
import { ECON, lossBonus } from '../shared/econ.js';
import {
  addMoney,
  setMoney,
  dropOnDeath,
  clearDrops,
  botBuy,
  killMoney,
  absorbArmor,
} from './econ.js';
import { C4 as C4I } from '../shared/weapons.js';

let api = null;
export function initComp(list) {
  api = list;
}

export const isComp = (room) => room.game === 'comp';
const roundToTwoDecimals = (value) => Math.round(value * 100) / 100;

export function newCompState() {
  return {
    round: 0,
    phase: 'wait',
    phaseEnd: 0,
    swapped: false,
    fresh: true,
    loss: [1, 1],
    liveAt: 0,
    target: 'A',
    bomb: { state: 'none', carrier: null, pos: null, site: null, explodeAt: 0, planter: null },
  };
}

const alivePlayers = (room, team) =>
  [...room.players.values()].filter((player) => player.alive && player.team === team);
const teamPlayers = (room, team) =>
  [...room.players.values()].filter((player) => player.team === team);

export function startRound(room) {
  const competitive = room.comp;
  const now = api.now();
  competitive.round++;
  competitive.phase = 'freeze';
  competitive.phaseEnd = now + COMP.freezeMs;
  competitive.target = Math.random() < 0.5 ? 'A' : 'B';
  competitive.bomb = {
    state: 'none',
    carrier: null,
    pos: null,
    site: null,
    explodeAt: 0,
    planter: null,
  };
  room.nades = [];
  room.smokes = [];
  clearDrops(room);
  api.resetDoors(room);
  api.broadcast(room, { t: 'doors', broken: [] });
  const fresh = competitive.fresh;
  competitive.fresh = false;
  if (fresh) {
    competitive.loss = [1, 1];
  }
  for (const player of room.players.values()) {
    player.keep =
      !fresh && player.alive && player.slots
        ? {
            slots: player.slots.slice(0, 4).map((winner) => (winner === C4I ? null : winner)),
            ammo: player.ammo,
            wskin: player.wskin || {},
            armor: player.armor || 0,
          }
        : null;
    if (fresh || (player.money ?? null) === null) {
      setMoney(player, ECON.start);
    }
    player.planting = 0;
    player.defusing = 0;
    player.plantSpot = null;
    player.defendSite = player.isBot ? (Math.random() < 0.5 ? 'A' : 'B') : null;
    player.lurk = player.isBot && Math.random() < 0.25;
    player.holdUntil = 0;
    api.spawn(room, player);
    player.protectedUntil = 0;
  }
  for (const player of room.players.values()) {
    if (player.isBot) {
      botBuy(room, player, now);
    }
  }
  const terrorists = alivePlayers(room, 0);
  if (terrorists.length) {
    giveBomb(room, terrorists[Math.floor(Math.random() * terrorists.length)], false);
  }
  makePlans(room, competitive);
  api.broadcast(room, { t: 'round', r: competitive.round, sc: room.score });
}

function makePlans(room, competitive) {
  const shuffle = (list) =>
    list
      .map((positionX) => [Math.random(), positionX])
      .sort((left, right) => left[0] - right[0])
      .map((positionX) => positionX[1]);
  const randomValue = Math.random();
  const type =
    randomValue < 0.35 ? 'exec' : randomValue < 0.6 ? 'split' : randomValue < 0.8 ? 'fake' : 'rush';
  const freezeEnd = competitive.phaseEnd;
  const execAt = type === 'rush' ? freezeEnd : freezeEnd + 7000 + Math.random() * 11000;
  competitive.plan = {
    type,
    site: competitive.target,
    fake: competitive.target === 'A' ? 'B' : 'A',
    execAt,
    rotateAt: execAt + 7000 + Math.random() * 5000,
    main: Math.random() < 0.5 ? 0 : 1,
  };
  const terrorists = shuffle(
    [...room.players.values()].filter((player) => player.isBot && player.team === 0),
  );
  terrorists.forEach((bomb, index) => {
    bomb.plantSpot = null;
    bomb.stageIdx =
      type === 'split'
        ? index % 2
        : Math.random() < 0.75
          ? competitive.plan.main
          : 1 - competitive.plan.main;
    bomb.role =
      type === 'fake'
        ? competitive.bomb.carrier === bomb.id || index === 0
          ? 'lurk'
          : 'fake'
        : 'main';
  });
  const cts = shuffle(
    [...room.players.values()].filter((player) => player.isBot && player.team === 1),
  );
  const setups = ['std', 'std', 'stackA', 'stackB', 'aggro'];
  const setup = setups[Math.floor(Math.random() * setups.length)];
  competitive.ctSetup = setup;
  const peeks = room.map.ctPeek || [];
  cts.forEach((bomb, index) => {
    const stack = Math.ceil(cts.length * 0.7);
    bomb.defendSite =
      setup === 'stackA'
        ? index < stack
          ? 'A'
          : 'B'
        : setup === 'stackB'
          ? index < stack
            ? 'B'
            : 'A'
          : index % 2
            ? 'A'
            : 'B';
    bomb.peek =
      setup === 'aggro' && index === 0 && peeks.length
        ? peeks[Math.floor(Math.random() * peeks.length)]
        : null;
    bomb.peekUntil = freezeEnd + 12000 + Math.random() * 8000;
  });
}

function endRound(room, team, why) {
  const competitive = room.comp;
  if (competitive.phase !== 'live' && competitive.phase !== 'freeze') {
    return;
  }
  const now = api.now();
  competitive.phase = 'post';
  competitive.phaseEnd = now + COMP.endMs;
  for (const player of room.players.values()) {
    player.planting = player.defusing = 0;
  }
  room.score[team]++;
  const lose = 1 - team;
  competitive.loss[team] = Math.max(0, competitive.loss[team] - 1);
  competitive.loss[lose] = Math.min(ECON.lossBonus.length, competitive.loss[lose] + 1);
  const planted = (competitive.bomb.planter ?? null) !== null;
  for (const player of room.players.values()) {
    if (player.team === team) {
      addMoney(player, ECON.win[why] ?? ECON.win.elim, 'win');
    } else {
      addMoney(
        player,
        lossBonus(competitive.loss[lose]) + (lose === 0 && planted ? ECON.plantedLoss : 0),
        'loss',
      );
    }
  }
  api.broadcast(room, { t: 'rend', w: team, why, sc: room.score });
  const winner = compWinner(room.score);
  if (winner >= 0) {
    room.winner = winner;
    room.nextMatchAt = now + api.WIN_PAUSE_MS;
    api.broadcast(room, { t: 'win', team: winner, score: room.score });
    console.log(
      `* ${room.code}: ${winner === 0 ? 'T' : 'CT'} won ${room.score[0]}-${room.score[1]} (competitive)`,
    );
    return;
  }
  if (!competitive.swapped && room.score[0] + room.score[1] === COMP.halfRounds) {
    competitive.swapped = true;
    for (const player of room.players.values()) {
      player.team = 1 - player.team;
      if (player.isBot) {
        player.loadout = api.randomLoadout(player.team);
      } else {
        api.send(player, { t: 'team', team: player.team });
      }
    }
    room.score.reverse();
    competitive.fresh = true;
    api.broadcast(room, { t: 'half', sc: room.score });
  }
}

export function resetComp(room) {
  room.comp = newCompState();
  for (const player of room.players.values()) {
    player.alive = false;
  }
  room.score = [0, 0];
  startRound(room);
}

function giveBomb(room, player, announce = true) {
  const bomb = room.comp.bomb;
  bomb.state = 'carried';
  bomb.carrier = player.id;
  bomb.pos = null;
  if (!player.slots.includes(C4)) {
    player.slots = [...player.slots.slice(0, 4), C4];
  }
  api.send(player, { t: 'bomb', sl: player.slots });
  if (announce) {
    api.broadcast(room, { t: 'bpick', i: player.id, n: player.name });
  }
}

function takeBomb(player) {
  player.slots = player.slots.filter((winner) => winner !== C4);
  player.planting = 0;
  if (player.weapon === C4) {
    player.weapon = player.slots[0];
    player.readyAt = api.now() + WEAPONS[player.weapon].drawTime * 1000 - 150;
  }
  api.send(player, { t: 'bomb', sl: player.slots, w: player.weapon });
}

export function dropBomb(room, player, throwIt = true) {
  const bomb = room.comp.bomb;
  if (bomb.state !== 'carried' || bomb.carrier !== player.id) {
    return;
  }
  takeBomb(player);
  const map = room.map;
  let positionX = player.pos[0];
  let positionZ = player.pos[2];
  if (throwIt) {
    const direction = [-Math.sin(player.yaw), 0, -Math.cos(player.yaw)];
    const origin = [player.pos[0], player.pos[1] + 1.0, player.pos[2]];
    const hit = raycastWorld(origin, direction, 2.5, room.solids);
    const distance = Math.max(0, (hit ? hit.t : 2.5) - 0.45);
    const nextX = origin[0] + direction[0] * distance;
    const nextZ = origin[2] + direction[2] * distance;
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
    const tooHigh = ground > player.pos[1] + PLAYER.step + 0.05;
    if (!inside && !tooHigh) {
      positionX = nextX;
      positionZ = nextZ;
    }
  }
  positionX = Math.max(-map.hx + 0.5, Math.min(map.hx - 0.5, positionX));
  positionZ = Math.max(-map.hz + 0.5, Math.min(map.hz - 0.5, positionZ));
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.pos = [
    roundToTwoDecimals(positionX),
    groundAt(map, positionX, positionZ),
    roundToTwoDecimals(positionZ),
  ];
  player.dropAt = api.now();
  api.broadcast(room, {
    t: 'bdrop',
    i: player.id,
    from: [
      roundToTwoDecimals(player.pos[0]),
      roundToTwoDecimals(player.pos[1] + 1.1),
      roundToTwoDecimals(player.pos[2]),
    ],
    p: bomb.pos,
  });
}

export function setPlanting(room, player, on) {
  const competitive = room.comp;
  if (!on) {
    player.planting = 0;
    return;
  }
  if (
    competitive.phase !== 'live' ||
    !player.alive ||
    player.team !== 0 ||
    competitive.bomb.carrier !== player.id ||
    player.weapon !== C4 ||
    !player.ms.onGround
  ) {
    return;
  }
  if (!siteAt(room.map, player.pos[0], player.pos[2])) {
    return;
  }
  player.planting = api.now();
  player.ms.vx = player.ms.vz = 0;
  player.plantPos = [player.pos[0], player.pos[2]];
}

function stopDefusing(room, player) {
  if (!player.defusing) {
    return;
  }
  player.defusing = 0;
  api.broadcast(room, { t: 'dfx', i: player.id });
}

export function setDefusing(room, player, on) {
  const competitive = room.comp;
  if (!on) {
    stopDefusing(room, player);
    return;
  }
  const bomb = competitive.bomb;
  if (
    competitive.phase !== 'live' ||
    !player.alive ||
    player.team !== 1 ||
    bomb.state !== 'planted' ||
    player.defusing
  ) {
    return;
  }
  if (
    Math.hypot(player.pos[0] - bomb.pos[0], player.pos[2] - bomb.pos[2]) > COMP.defuseRange ||
    Math.abs(player.pos[1] - bomb.pos[1]) > 1.6
  ) {
    return;
  }
  for (const other of room.players.values()) {
    if (other !== player && other.defusing) {
      return;
    }
  }
  player.defusing = api.now();
  player.ms.vx = player.ms.vz = 0;
  api.broadcast(room, { t: 'dfs', i: player.id, p: bomb.pos });
}

function plant(room, player) {
  const competitive = room.comp;
  const bomb = competitive.bomb;
  const now = api.now();
  player.planting = 0;
  takeBomb(player);
  bomb.state = 'planted';
  bomb.carrier = null;
  bomb.pos = [
    roundToTwoDecimals(player.pos[0]),
    groundAt(room.map, player.pos[0], player.pos[2]),
    roundToTwoDecimals(player.pos[2]),
  ];
  bomb.site = siteAt(room.map, player.pos[0], player.pos[2]);
  bomb.explodeAt = now + COMP.bombMs;
  bomb.planter = player.id;
  addMoney(player, ECON.plant, 'plant');
  api.broadcast(room, {
    t: 'planted',
    i: player.id,
    n: player.name,
    s: bomb.site,
    p: bomb.pos,
    ex: COMP.bombMs,
  });
}

function explode(room) {
  const bomb = room.comp.bomb;
  bomb.state = 'exploded';
  api.broadcast(room, { t: 'boom', p: bomb.pos });
  endRound(room, 0, 'bomb');
  const planter = room.players.get(bomb.planter);
  for (const other of room.players.values()) {
    if (!other.alive) {
      continue;
    }
    const direction = Math.hypot(
      other.pos[0] - bomb.pos[0],
      other.pos[1] + 1 - bomb.pos[1],
      other.pos[2] - bomb.pos[2],
    );
    const damage = absorbArmor(
      other,
      Math.round(COMP.blastDmg * Math.max(0, 1 - direction / COMP.blastRadius)),
    );
    if (damage <= 0) {
      continue;
    }
    other.hp -= damage;
    api.send(other, { t: 'hurt', d: damage, o: bomb.pos, hp: Math.max(0, other.hp), part: 'body' });
    if (other.hp <= 0) {
      api.killPlayer(room, planter || other, other, WEAPONS[C4], false);
    }
  }
}

export function onDeath(room, victim, killer, weapon) {
  victim.respawnAt = Infinity;
  victim.armor = 0;
  if (killer && killer !== victim && killer.team !== victim.team) {
    addMoney(killer, killMoney(weapon), 'kill');
  }
  dropOnDeath(room, victim);
  victim.planting = victim.defusing = 0;
  if (room.comp.bomb.carrier === victim.id) {
    dropBomb(room, victim, false);
  }
  checkElim(room);
}

export function onLeave(room, player) {
  if (room.comp.bomb.carrier === player.id) {
    dropBomb(room, player, false);
  }
}

function checkElim(room) {
  const competitive = room.comp;
  if (competitive.phase !== 'live') {
    return;
  }
  const terroristCount = teamPlayers(room, 0).length;
  const counterTerroristCount = teamPlayers(room, 1).length;
  if (counterTerroristCount && !alivePlayers(room, 1).length) {
    return endRound(room, 0, 'elim');
  }
  if (terroristCount && !alivePlayers(room, 0).length && competitive.bomb.state !== 'planted') {
    endRound(room, 1, 'elim');
  }
}

export const canSpawnNow = (room) => room.comp.phase === 'freeze' || room.comp.phase === 'wait';

export const frozen = (room, player) =>
  (isComp(room) && room.comp.phase === 'freeze') || !!player.planting || !!player.defusing;

export function tickComp(room, now) {
  const competitive = room.comp;
  if (room.winner >= 0) {
    return;
  }
  if (competitive.phase === 'wait') {
    return startRound(room);
  }
  if (competitive.phase === 'freeze') {
    if (now >= competitive.phaseEnd) {
      competitive.phase = 'live';
      competitive.liveAt = now;
      competitive.phaseEnd = now + COMP.roundMs;
      api.broadcast(room, { t: 'live' });
    }
    return;
  }
  const bomb = competitive.bomb;
  if (competitive.phase === 'post') {
    if (bomb.state === 'planted' && now >= bomb.explodeAt) {
      bomb.state = 'exploded';
      api.broadcast(room, { t: 'boom', p: bomb.pos });
    }
    if (now >= competitive.phaseEnd) {
      startRound(room);
    }
    return;
  }
  for (const player of room.players.values()) {
    if (player.planting) {
      const moved =
        !player.plantPos ||
        Math.hypot(player.pos[0] - player.plantPos[0], player.pos[2] - player.plantPos[1]) > 0.6;
      if (!player.alive || player.weapon !== C4 || bomb.carrier !== player.id || moved) {
        player.planting = 0;
      } else if (now - player.planting >= COMP.plantMs) {
        plant(room, player);
      }
    }
    if (player.defusing) {
      const far =
        !bomb.pos ||
        Math.hypot(player.pos[0] - bomb.pos[0], player.pos[2] - bomb.pos[2]) >
          COMP.defuseRange + 0.3;
      if (!player.alive || bomb.state !== 'planted' || far) {
        stopDefusing(room, player);
      } else if (now - player.defusing >= COMP.defuseMs) {
        bomb.state = 'defused';
        addMoney(player, ECON.defuse, 'defuse');
        api.broadcast(room, { t: 'defused', i: player.id, n: player.name });
        return endRound(room, 1, 'defuse');
      }
    }
  }
  if (bomb.state === 'dropped') {
    for (const player of room.players.values()) {
      if (!player.alive || player.team !== 0 || now - (player.dropAt || 0) < 1000) {
        continue;
      }
      if (
        Math.hypot(player.pos[0] - bomb.pos[0], player.pos[2] - bomb.pos[2]) < COMP.pickRange &&
        Math.abs(player.pos[1] - bomb.pos[1]) < 1.5
      ) {
        giveBomb(room, player);
        break;
      }
    }
  }
  if (bomb.state === 'planted' && now >= bomb.explodeAt) {
    return explode(room);
  }
  if (bomb.state !== 'planted' && now >= competitive.phaseEnd) {
    return endRound(room, 1, 'time');
  }
  checkElim(room);
}

export function compSnap(room, now) {
  const competitive = room.comp;
  const bomb = competitive.bomb;
  return {
    r: competitive.round,
    ph: competitive.phase,
    te: Math.max(0, Math.round(competitive.phaseEnd - now)),
    b: bomb.state,
    ...((bomb.carrier ?? null) !== null ? { bc: bomb.carrier } : null),
    ...(bomb.pos ? { bp: bomb.pos } : null),
    ...(bomb.state === 'planted'
      ? { ex: Math.max(0, Math.round(bomb.explodeAt - now)), bs: bomb.site }
      : null),
  };
}
