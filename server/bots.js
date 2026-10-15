import { PLAYER, MOVE, MAX_HP } from '../shared/constants.js';
import {
  WEAPONS,
  PRIMARIES,
  SECONDARIES,
  loadoutSlots,
  allowedFor,
  teamKey,
  C4,
} from '../shared/weapons.js';
import { COMP, siteAt } from '../shared/comp.js';
import { smokeBlocks } from '../shared/nade.js';
import { frozen } from './comp.js';
import { createMoveState, stepPlayer } from '../shared/movement.js';
import { raycastWorld } from '../shared/raycast.js';
import { HEADGEAR, OUTFITS, FACES, SKINS as SKIN_TONES, encodeLook } from '../shared/look.js';
import { findPath, walkable } from './nav.js';
import { SKINS } from '../shared/skins.js';

export const BOT_SKILLS = {
  easy: { react: 700, turn: 3.5, err: 0.06, head: 0.1, burst: 3, stopToShoot: false, ctrl: 5 },
  normal: { react: 380, turn: 7, err: 0.03, head: 0.3, burst: 5, stopToShoot: true, ctrl: 12 },
  hard: { react: 200, turn: 12, err: 0.012, head: 0.6, burst: 7, stopToShoot: true, ctrl: 24 },
};

const SCOPE_MS = { easy: 700, normal: 420, hard: 250 };

const NAMES = [
  'Ana',
  'Bruno',
  'Caio',
  'Duda',
  'Enzo',
  'Fefa',
  'Gabi',
  'Hugo',
  'Iris',
  'Joca',
  'Kaka',
  'Lia',
  'Malu',
  'Nina',
  'Otto',
  'Pipo',
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function clearLine(boxes, from, to) {
  const offset = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...offset);
  if (length < 0.01) {
    return true;
  }
  const hit = raycastWorld(
    from,
    [offset[0] / length, offset[1] / length, offset[2] / length],
    length,
    boxes,
  );
  return !hit || hit.t > length - 0.2;
}

export function randomLoadout(team) {
  const key = teamKey(team);
  return {
    primary: pick(PRIMARIES.filter((weapon) => allowedFor(weapon, key))).id,
    secondary: pick(SECONDARIES.filter((weapon) => allowedFor(weapon, key))).id,
    melee: 'knife',
    grenade: Math.random() < 0.5 ? 'he' : 'smoke',
  };
}

export function makeBot(id, number, skill) {
  const primary = pick(PRIMARIES.filter((weapon) => !weapon.disabled)).id;
  const look = {
    head: pick(HEADGEAR).id,
    outfit: pick(OUTFITS).id,
    face: pick(FACES).id,
    skin: pick(SKIN_TONES).id,
  };
  const skins = {};
  for (const weapon of WEAPONS) {
    if (!weapon.bomb && Math.random() < 0.6) {
      skins[weapon.id] = pick(SKINS.slice(1)).id;
    }
  }
  return {
    id,
    ws: null,
    isBot: true,
    room: null,
    name: `BOT ${NAMES[(number - 1) % NAMES.length]}`,
    team: 0,
    skill,
    pos: [0, 0, 0],
    yaw: 0,
    pitch: 0,
    crouch: false,
    aiming: false,
    hp: MAX_HP,
    alive: false,
    kills: 0,
    deaths: 0,
    weapon: 0,
    slots: loadoutSlots(null),
    loadout: { primary, secondary: 'glock', melee: 'knife' },
    lk: encodeLook(look),
    skins,
    ammo: [],
    nextFire: 0,
    readyAt: 0,
    reloading: false,
    reloadEnd: 0,
    history: [],
    spawnCount: 0,
    protectedUntil: 0,
    respawnAt: 0,
    ms: createMoveState(),
    lastSeq: 0,
    target: null,
    seenAt: 0,
    nextThink: 0,
    strafe: 1,
    strafeUntil: 0,
    goal: null,
    path: null,
    pathI: 0,
    pathAt: 0,
    lastSeen: null,
    burst: 0,
    pauseUntil: 0,
    aimOff: [0, 0],
    stuckPos: [0, 0],
    stuckAt: 0,
    jump: false,
  };
}

function tPlan(room, bot, now) {
  const competitive = room.comp;
  const plan = competitive.plan;
  if (!plan) {
    return { site: competitive.target, go: 0, stage: null };
  }
  let site = plan.site;
  let goAt = plan.execAt;
  if (plan.type === 'fake') {
    if (bot.role === 'fake' && now < plan.rotateAt) {
      site = plan.fake;
    } else {
      goAt = plan.rotateAt;
    }
  }
  const stages = room.map.stage?.[site];
  return { site, go: goAt, stage: stages ? stages[(bot.stageIdx || 0) % stages.length] : null };
}

function planKeyOf(room, bot, now) {
  if (bot.team === 0) {
    const plan = tPlan(room, bot, now);
    return `${plan.site}|${now >= plan.go}`;
  }
  return `${!!(bot.peek && now < bot.peekUntil)}`;
}

function compGoal(room, bot, now = 0) {
  const competitive = room.comp;
  if (!competitive || competitive.phase === 'post') {
    return null;
  }
  const bomb = competitive.bomb;
  const near = (positionX, positionZ, spread) => [
    positionX + (Math.random() - 0.5) * spread,
    positionZ + (Math.random() - 0.5) * spread,
  ];
  const inSite = (name, pad = 1.5) => {
    const site = room.map.sites[name];
    return [
      site.x[0] + pad + Math.random() * (site.x[1] - site.x[0] - pad * 2),
      site.z[0] + pad + Math.random() * (site.z[1] - site.z[0] - pad * 2),
    ];
  };
  if (bot.team === 0) {
    const plan = tPlan(room, bot, now);
    if (bomb.state !== 'planted' && bomb.state !== 'dropped' && plan.stage && now < plan.go) {
      return near(plan.stage[0], plan.stage[1], 3);
    }
    if (bomb.carrier === bot.id) {
      return (bot.plantSpot ||= inSite(plan.site));
    }
    if (bomb.state === 'dropped') {
      const terrorists = [...room.players.values()].filter(
        (other) => other.alive && other.team === 0 && other.isBot,
      );
      const distanceToBomb = (player) =>
        Math.hypot(player.pos[0] - bomb.pos[0], player.pos[2] - bomb.pos[2]);
      if (
        terrorists.sort((left, right) => distanceToBomb(left) - distanceToBomb(right))[0] === bot
      ) {
        return [bomb.pos[0], bomb.pos[2]];
      }
    }
    if (bomb.state === 'planted') {
      return near(bomb.pos[0], bomb.pos[2], 12);
    }
    return inSite(plan.site, 0);
  }
  if (bomb.state === 'planted') {
    return [bomb.pos[0], bomb.pos[2]];
  }
  if (bot.peek && now < bot.peekUntil) {
    return near(bot.peek[0], bot.peek[1], 2);
  }
  bot.defendSite ||= bot.id % 2 ? 'A' : 'B';
  return inSite(bot.defendSite, 0);
}

const eyeOf = (player) => [
  player.pos[0],
  player.pos[1] + (player.crouch ? PLAYER.crouchEye : PLAYER.eye),
  player.pos[2],
];

function thinkComp(room, bot, now) {
  const competitive = room.comp;
  const bomb = competitive?.bomb;
  const urgent =
    bomb && (bomb.carrier === bot.id || bomb.state === 'dropped' || bomb.state === 'planted');
  const arrived = bot.goal && Math.hypot(bot.goal[0] - bot.pos[0], bot.goal[1] - bot.pos[2]) < 1.5;
  if (bot.lastSeen && !arrived && !urgent) {
    if (!bot.path) {
      setGoal(bot, bot.lastSeen, now);
    }
    return;
  }
  if (bot.memChase && arrived && !bot.memChase.searchUntil) {
    bot.memChase.searchUntil = now + 2500;
  }
  if (bot.memChase?.searchUntil && now < bot.memChase.searchUntil && !urgent) {
    bot.path = null;
    return;
  }
  if (bot.memChase?.searchUntil) {
    bot.memChase = null;
    bot.mem = null;
  }
  bot.lastSeen = null;
  const key = planKeyOf(room, bot, now);
  if (key !== bot.planKey) {
    bot.planKey = key;
    bot.holdUntil = 0;
    bot.path = null;
  }
  if (arrived && !urgent) {
    if (!bot.holdUntil) {
      bot.holdUntil = now + 3000 + Math.random() * 5000;
      bot.holdCrouch = Math.random() < 0.35;
    }
    if (now < bot.holdUntil) {
      bot.path = null;
      return;
    }
  }
  if (
    !bot.path ||
    arrived ||
    now - bot.pathAt > 3000 ||
    (urgent && bot.objKey !== bomb.state + bomb.carrier)
  ) {
    const goal = compGoal(room, bot, now);
    if (!goal) {
      return;
    }
    bot.holdUntil = 0;
    bot.holdCrouch = false;
    bot.objKey = bomb.state + bomb.carrier;
    if (urgent) {
      bot.via = null;
    }
    setGoal(bot, goal, now, !urgent && !bot.path);
  }
}

function think(room, bot, now, skill) {
  const eye = eyeOf(bot);
  let best = null;
  let bestD = Infinity;
  for (const other of room.players.values()) {
    if (other === bot || !other.alive || (room.game !== 'gungame' && other.team === bot.team)) {
      continue;
    }
    const head = [
      other.pos[0],
      other.pos[1] + (other.crouch ? PLAYER.crouchHeight : PLAYER.height) - 0.15,
      other.pos[2],
    ];
    const distance = Math.hypot(head[0] - eye[0], head[2] - eye[2]);
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    const shotMe = other === bot.alertBy && now - bot.alertAt < 4000;
    const inFov =
      other === bot.target ||
      shotMe ||
      distance < 1.5 ||
      (forwardX * (head[0] - eye[0]) + forwardZ * (head[2] - eye[2])) / (distance || 1) > -0.1;
    if (!inFov) {
      continue;
    }
    if (
      distance < bestD &&
      distance < 60 &&
      clearLine(room.solids, eye, head) &&
      !smokeBlocks(room.smokes || [], eye, head)
    ) {
      best = other;
      bestD = distance;
    }
  }
  if (best !== bot.target) {
    bot.target = best;
    bot.seenAt = now;
    bot.crouchFight = Math.random() < ({ easy: 0.15, normal: 0.4, hard: 0.6 }[bot.skill] ?? 0.4);
    bot.aimHead = Math.random() < skill.head;
    bot.aimOff = [(Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15];
  }
  if (bot.target) {
    bot.lastSeen = [bot.target.pos[0], bot.target.pos[2]];
    const targetMilliseconds = bot.target.ms;
    bot.mem = {
      pos: [bot.target.pos[0], bot.target.pos[1], bot.target.pos[2]],
      vel: targetMilliseconds ? [targetMilliseconds.vx, targetMilliseconds.vz] : [0, 0],
      t: now,
    };
    bot.memChase = null;
    bot.path = null;
    return;
  }
  if (bot.mem && !bot.memChase && now - bot.mem.t < 1500) {
    const [velocityX, velocityZ] = bot.mem.vel;
    const distance = Math.hypot(velocityX, velocityZ);
    const lookAhead = distance > 0.5 ? Math.min(2.5, distance * 0.45) / distance : 0;
    const predictedX = bot.mem.pos[0] + velocityX * lookAhead;
    const predictedZ = bot.mem.pos[2] + velocityZ * lookAhead;
    const hold = { easy: 1600, normal: 1100, hard: 700 }[bot.skill] || 1100;
    bot.memChase = {
      pos: [predictedX, bot.mem.pos[1], predictedZ],
      seen: [bot.mem.pos[0], bot.mem.pos[1], bot.mem.pos[2]],
      holdUntil: now + hold * (0.6 + Math.random() * 0.8),
      until: now + 12000,
    };
    bot.lastSeen = [predictedX, predictedZ];
    bot.path = null;
  }
  if (bot.memChase && now > bot.memChase.until) {
    bot.memChase = null;
    bot.mem = null;
  }
  if (now - (bot.heardAt || 0) > 1500) {
    let heard = null;
    let bestDistance = Infinity;
    for (const other of room.players.values()) {
      if (other === bot || !other.alive || (room.game !== 'gungame' && other.team === bot.team)) {
        continue;
      }
      const distance = Math.hypot(other.pos[0] - bot.pos[0], other.pos[2] - bot.pos[2]);
      const running =
        other.ms?.onGround &&
        !other.crouch &&
        Math.hypot(other.ms.vx, other.ms.vz) > MOVE.walk + 0.3;
      const shot = now - (other.lastShotAt || 0) < 400;
      const range = Math.max(running ? 15 : 0, shot ? (other.lastShotQuiet ? 12 : 40) : 0);
      if (distance < range && distance < bestDistance) {
        heard = other;
        bestDistance = distance;
      }
    }
    if (heard) {
      bot.heardAt = now;
      bot.lookAt = [heard.pos[0], heard.pos[2]];
      bot.lookAtT = now;
      if (!bot.lastSeen) {
        bot.lastSeen = bot.lookAt;
        bot.path = null;
      }
    }
  }
  if (bot.alertAt && now - bot.alertAt < 2500 && bot.alertPos && (bot.lookAtT || 0) < bot.alertAt) {
    bot.lastSeen = bot.alertPos;
    bot.lookAt = bot.alertPos;
    bot.lookAtT = now;
    bot.path = null;
  }
  if (room.game === 'comp') {
    return thinkComp(room, bot, now);
  }
  const arrived = bot.goal && Math.hypot(bot.goal[0] - bot.pos[0], bot.goal[1] - bot.pos[2]) < 1.5;
  if (bot.path && !arrived && now - bot.pathAt > 4000 && !bot.lastSeen) {
    setGoal(bot, bot.goal, now, false);
    return;
  }
  if (!bot.path || arrived || now - bot.pathAt > 4000) {
    let goal;
    if (bot.lastSeen && !arrived) {
      goal = bot.lastSeen;
    } else if (bot.memChase && !bot.memChase.searchUntil) {
      bot.memChase.searchUntil = now + 2500;
      bot.lastSeen = null;
      return;
    } else if (bot.memChase?.searchUntil && now < bot.memChase.searchUntil) {
      return;
    } else {
      bot.lastSeen = null;
      const enemies = [...room.players.values()].filter(
        (other) =>
          other.alive && other !== bot && (room.game === 'gungame' || other.team !== bot.team),
      );
      goal =
        enemies.length && Math.random() < 0.55
          ? (({ pos: position }) => [
              position[0] + (Math.random() - 0.5) * 6,
              position[2] + (Math.random() - 0.5) * 6,
            ])(pick(enemies))
          : pick(room.map.openPoints);
    }
    setGoal(bot, goal, now);
  }
}

const LANES = [-0.73, -0.2, 0.2, 0.73];

function pickLane(lanes, position, goal) {
  const distance = (from, to) => Math.hypot(from[0] - to[0], from[1] - to[1]);
  const from = [position[0], position[2]];
  const ok = lanes.filter(
    (lane) =>
      distance(from, lane) + distance(lane, goal) < distance(from, goal) * 1.6 &&
      distance(from, lane) > 4,
  );
  return ok.length ? pick(ok) : null;
}

function setGoal(bot, goal, now, newTrip = true) {
  const map = bot.room.map;
  bot.goal = goal;
  if (newTrip) {
    bot.via =
      Math.hypot(goal[0] - bot.pos[0], goal[1] - bot.pos[2]) > 15 && Math.random() < 0.85
        ? map.lanes
          ? pickLane(map.lanes, bot.pos, goal)
          : [
              pick(LANES) * map.hx + (Math.random() - 0.5) * 6,
              (bot.pos[2] + goal[1]) / 2 + (Math.random() - 0.5) * 10,
            ]
        : null;
  }
  if (bot.via && Math.hypot(bot.via[0] - bot.pos[0], bot.via[1] - bot.pos[2]) < 3) {
    bot.via = null;
  }
  let path = null;
  if (bot.via) {
    const via = bot.via;
    const pathToVia = findPath(map, bot.pos[0], bot.pos[2], via[0], via[1]);
    const pathFromVia = pathToVia && findPath(map, via[0], via[1], goal[0], goal[1]);
    if (pathToVia && pathFromVia) {
      path = pathToVia.concat(pathFromVia);
    }
  }
  bot.path = path || findPath(map, bot.pos[0], bot.pos[2], goal[0], goal[1]) || [goal];
  bot.pathI = 0;
  bot.pathAt = now;
}

function nextNode(bot) {
  const path = bot.path;
  if (!path || bot.pathI >= path.length) {
    return null;
  }
  while (
    bot.pathI < path.length - 1 &&
    Math.hypot(path[bot.pathI][0] - bot.pos[0], path[bot.pathI][1] - bot.pos[2]) < 0.6
  ) {
    bot.pathI++;
  }
  for (let index = Math.min(path.length - 1, bot.pathI + 6); index > bot.pathI; index--) {
    if (walkable(bot.room.map, bot.pos[0], bot.pos[2], path[index][0], path[index][1])) {
      bot.pathI = index;
      break;
    }
  }
  return path[bot.pathI];
}

export function updateBot(room, bot, now, deltaTime, api) {
  const skill = BOT_SKILLS[bot.skill] || BOT_SKILLS.normal;
  if (bot.alertAt && bot.alertAt > (bot.alertSeen || 0)) {
    bot.alertSeen = bot.alertAt;
    bot.nextThink = 0;
    if (bot.defusing && COMP.defuseMs - (now - bot.defusing) > 1500) {
      api.defuse(room, bot, false);
    }
    if (bot.planting && COMP.plantMs - (now - bot.planting) > 800) {
      api.plant(room, bot, false);
    }
  }
  if (now >= bot.nextThink) {
    bot.nextThink = now + 200;
    think(room, bot, now, skill);
  }
  const weapon = WEAPONS[bot.weapon];
  const ammo = bot.ammo[bot.weapon];
  if (!weapon.melee && ammo.mag === 0 && !bot.reloading) {
    api.reload(bot, now);
  }

  let wantYaw = bot.yaw;
  let wantPitch = 0;
  let moveX = 0;
  let moveZ = 0;
  const tgt = bot.target && bot.target.alive && bot.room === bot.target.room ? bot.target : null;
  let shooting = false;

  if (tgt) {
    const eye = eyeOf(bot);
    const height = tgt.crouch ? PLAYER.crouchHeight : PLAYER.height;
    const aimY = tgt.pos[1] + (bot.aimHead ? height - 0.15 : height * 0.6);
    const deltaX = tgt.pos[0] - eye[0];
    const deltaY = aimY - eye[1];
    const deltaZ = tgt.pos[2] - eye[2];
    const flat = Math.hypot(deltaX, deltaZ);
    bot.tgtDist = flat;
    bot.aimOff[0] *= Math.exp(-deltaTime * 3);
    bot.aimOff[1] *= Math.exp(-deltaTime * 3);
    wantYaw = Math.atan2(-deltaX, -deltaZ) + bot.aimOff[0];
    wantPitch = Math.atan2(deltaY, flat) + bot.aimOff[1];

    if (now > bot.strafeUntil) {
      bot.strafe = -bot.strafe;
      bot.strafeUntil = now + 500 + Math.random() * 900;
    }
    const forwardX = deltaX / (flat || 1);
    const forwardZ = deltaZ / (flat || 1);
    const toward = weapon.melee ? 1 : flat > 14 ? 1 : flat < 5 ? -0.6 : 0;
    if (
      !walkable(
        room.map,
        bot.pos[0],
        bot.pos[2],
        bot.pos[0] - forwardZ * bot.strafe * 1.2,
        bot.pos[2] + forwardX * bot.strafe * 1.2,
      )
    ) {
      bot.strafe = -bot.strafe;
    }
    moveX = forwardX * toward + -forwardZ * bot.strafe;
    moveZ = forwardZ * toward + forwardX * bot.strafe;

    const aimErr = Math.abs(wrap(wantYaw - bot.yaw)) + Math.abs(wantPitch - bot.pitch);
    const reacted = now - bot.seenAt > skill.react;
    if (weapon.scope) {
      if (reacted && aimErr < 0.3) {
        moveX = moveZ = 0;
        if (!bot.scopeAt) {
          bot.scopeAt = now;
        }
      } else {
        bot.scopeAt = 0;
      }
      const settled =
        bot.scopeAt &&
        now - bot.scopeAt > SCOPE_MS[bot.skill] &&
        Math.hypot(bot.ms.vx, bot.ms.vz) < 0.5;
      if (settled && aimErr < 0.012 + skill.err * 0.3 && now >= bot.pauseUntil) {
        shooting = true;
      }
    } else if (reacted && aimErr < 0.1 && now >= bot.pauseUntil && (!weapon.melee || flat < 1.8)) {
      shooting = true;
      if (skill.stopToShoot || (bot.crouchFight && flat > 7)) {
        moveX = moveZ = 0;
      }
    }
  } else {
    bot.scopeAt = 0;
    const node = nextNode(bot);
    if (node) {
      const deltaX = node[0] - bot.pos[0];
      const deltaZ = node[1] - bot.pos[2];
      const distance = Math.hypot(deltaX, deltaZ) || 1;
      moveX = deltaX / distance;
      moveZ = deltaZ / distance;
      wantYaw = Math.atan2(-deltaX, -deltaZ);
    }
    const moving = !!node;
    if (!moving && !bot.idleYaw) {
      bot.idleYaw = bot.yaw;
    }
    if (moving) {
      bot.idleYaw = 0;
    }
    const baseYaw = moving ? wantYaw : bot.idleYaw;
    if (now >= (bot.scanNext || 0)) {
      const eye = eyeOf(bot);
      let best = null;
      let bestScore = -1;
      for (const off of [-1.7, -1.1, -0.6, 0.6, 1.1, 1.7, moving ? 0 : Math.PI]) {
        const yaw = baseYaw + off;
        const direction = [-Math.sin(yaw), 0, -Math.cos(yaw)];
        const hit = raycastWorld(eye, direction, 30, room.solids);
        const distance = hit ? hit.t : 30;
        if (distance < 3) {
          continue;
        }
        const score =
          Math.min(distance, 25) +
          Math.random() * 6 -
          (Math.abs(wrap(yaw - (bot.scanYaw ?? 99))) < 0.4 ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = yaw;
        }
      }
      bot.scanYaw = best;
      bot.scanUntil = now + 450 + Math.random() * 450;
      bot.scanNext = bot.scanUntil + (moving ? 700 : 300) + Math.random() * 1100;
    }
    if ((bot.scanYaw ?? null) !== null && now < bot.scanUntil) {
      wantYaw = bot.scanYaw;
      if (moving) {
        moveX *= 0.75;
        moveZ *= 0.75;
      }
    } else if (!moving) {
      wantYaw = bot.idleYaw;
    }
    const chaseMemory = bot.memChase;
    if (chaseMemory && !chaseMemory.searchUntil) {
      const eyeB = eyeOf(bot);
      const aimAt = (player) => {
        wantYaw = Math.atan2(-(player[0] - bot.pos[0]), -(player[2] - bot.pos[2]));
        wantPitch = Math.atan2(
          player[1] + 1.5 - eyeB[1],
          Math.hypot(player[0] - bot.pos[0], player[2] - bot.pos[2]),
        );
      };
      if (now < chaseMemory.holdUntil) {
        aimAt(chaseMemory.seen);
        moveX = moveZ = 0;
      } else {
        const player = clearLine(room.solids, eyeB, [
          chaseMemory.pos[0],
          chaseMemory.pos[1] + 1.5,
          chaseMemory.pos[2],
        ])
          ? chaseMemory.pos
          : null;
        if (player) {
          aimAt(player);
        }
        moveX *= 0.7;
        moveZ *= 0.7;
      }
    }
    if (bot.lookAt && now - bot.lookAtT < 1200) {
      wantYaw = Math.atan2(-(bot.lookAt[0] - bot.pos[0]), -(bot.lookAt[1] - bot.pos[2]));
      moveX *= 0.3;
      moveZ *= 0.3;
    }
  }

  if (!tgt && bot.path && room.map.doors?.length) {
    const node = bot.path[bot.pathI];
    const intact = room.map.doors.filter((door) => !room.broken.has(door.door));
    if (node && intact.length) {
      const origin = [bot.pos[0], bot.pos[1] + 1.1, bot.pos[2]];
      const deltaX = node[0] - origin[0];
      const deltaZ = node[1] - origin[2];
      const distance = Math.hypot(deltaX, deltaZ) || 1;
      const hit = raycastWorld(
        origin,
        [deltaX / distance, 0, deltaZ / distance],
        Math.min(distance + 1.5, 4),
        intact,
      );
      const stuck = hit && hit.t < 1.2 && Math.hypot(bot.ms.vx, bot.ms.vz) < 0.6;
      if (stuck) {
        bot.doorStuckSince ||= now;
      } else if (!bot.doorShooting) {
        bot.doorStuckSince = 0;
      }
      bot.doorShooting = !!hit && !!bot.doorStuckSince && now - bot.doorStuckSince > 500;
      if (bot.doorShooting) {
        const eye = eyeOf(bot);
        const player = hit.point;
        wantYaw = Math.atan2(-(player[0] - bot.pos[0]), -(player[2] - bot.pos[2]));
        wantPitch = Math.atan2(
          player[1] - eye[1],
          Math.hypot(player[0] - bot.pos[0], player[2] - bot.pos[2]),
        );
        moveX = moveZ = 0;
        const error = Math.abs(wrap(wantYaw - bot.yaw)) + Math.abs(wantPitch - bot.pitch);
        if (error < 0.08 && now >= bot.pauseUntil) {
          shooting = true;
        }
      }
    }
  }

  if (room.game === 'comp' && room.comp?.phase === 'live') {
    const bomb = room.comp.bomb;
    if (tgt && bot.weapon === C4) {
      bot.weapon = bot.slots[0];
    }
    if (tgt && bot.planting) {
      api.plant(room, bot, false);
    }
    if (tgt && bot.defusing) {
      api.defuse(room, bot, false);
    }
    if (
      !tgt &&
      bomb.carrier === bot.id &&
      siteAt(room.map, bot.pos[0], bot.pos[2]) &&
      bot.ms.onGround
    ) {
      if (bot.weapon !== C4) {
        bot.weapon = C4;
      }
      if (!bot.planting) {
        api.plant(room, bot, true);
      }
    }
    if (
      !tgt &&
      bot.team === 1 &&
      bomb.state === 'planted' &&
      !bot.defusing &&
      Math.hypot(bomb.pos[0] - bot.pos[0], bomb.pos[2] - bot.pos[2]) < COMP.defuseRange - 0.3
    ) {
      api.defuse(room, bot, true);
    }
  }
  if (frozen(room, bot)) {
    moveX = moveZ = 0;
    shooting = false;
    bot.scopeAt = 0;
  }

  const maxTurn = skill.turn * deltaTime;
  bot.yaw = wrap(bot.yaw + Math.max(-maxTurn, Math.min(maxTurn, wrap(wantYaw - bot.yaw))));
  bot.pitch += Math.max(-maxTurn, Math.min(maxTurn, wantPitch - bot.pitch));

  if (now - bot.stuckAt > 1500) {
    const moved = Math.hypot(bot.pos[0] - bot.stuckPos[0], bot.pos[2] - bot.stuckPos[1]);
    if (moved < 0.6 && (moveX || moveZ)) {
      if (bot.goal) {
        setGoal(bot, bot.goal, now, false);
      }
      bot.jump = true;
      for (const direction of room.map.doors) {
        const centerX = (direction.min[0] + direction.max[0]) / 2;
        const centerZ = (direction.min[2] + direction.max[2]) / 2;
        if (
          !room.broken.has(direction.door) &&
          Math.hypot(centerX - bot.pos[0], centerZ - bot.pos[2]) < 3
        ) {
          api.hitDoor(room, direction.door, 120);
        }
      }
      bot.strafe = -bot.strafe;
    }
    bot.stuckPos = [bot.pos[0], bot.pos[2]];
    bot.stuckAt = now;
  }

  const sin = Math.sin(bot.yaw);
  const cos = Math.cos(bot.yaw);
  const currentDistance = Math.hypot(moveX, moveZ);
  const currentMoveX = currentDistance > 1 ? moveX / currentDistance : moveX;
  const currentMoveZ = currentDistance > 1 ? moveZ / currentDistance : moveZ;
  const input = {
    fwd: -sin * currentMoveX - cos * currentMoveZ,
    right: cos * currentMoveX - sin * currentMoveZ,
    jump: false,
    jumpPress: bot.jump,
    walk: false,
    crouch:
      !!bot.planting ||
      !!bot.defusing ||
      (shooting && bot.crouchFight && (bot.tgtDist || 0) > 7) ||
      (!!bot.holdCrouch && !tgt && !moveX && !moveZ),
    yaw: bot.yaw,
    speedMult: weapon.moveMult * (weapon.scope && bot.scopeAt ? weapon.scopedMove : 1),
  };
  bot.jump = false;
  const steps = Math.max(1, Math.round(deltaTime * 60));
  const solids = api.solidsFor ? api.solidsFor(room, bot) : room.solids;
  for (let index = 0; index < steps; index++) {
    stepPlayer(bot.ms, input, deltaTime / steps, solids);
    input.jumpPress = false;
  }
  bot.pos = [bot.ms.x, bot.ms.y, bot.ms.z];
  bot.crouch = bot.ms.crouch;
  bot.aiming = weapon.scope ? !!bot.scopeAt : shooting;

  if (weapon.spinUp) {
    if (shooting && !bot.spinAt) {
      bot.spinAt = now;
    } else if (!shooting && now >= bot.pauseUntil) {
      bot.spinAt = 0;
    }
  }
  bot.recoil ||= [0, 0];
  if (now - (bot.lastShot || 0) > weapon.recoilReset * 1000) {
    bot.spray = 0;
  }
  {
    const competitive = (((skill.ctrl ?? 12) * Math.PI) / 180) * deltaTime;
    const message = Math.hypot(bot.recoil[0], bot.recoil[1]);
    const falloff = message > competitive ? (message - competitive) / message : 0;
    bot.recoil[0] *= falloff;
    bot.recoil[1] *= falloff;
  }
  if (shooting) {
    const speed = Math.hypot(bot.ms.vx, bot.ms.vz);
    const moving = speed > MOVE.run * weapon.moveMult * 0.34;
    const base = weapon.scope && bot.scopeAt ? weapon.scopedBase : weapon.spread.base;
    const spread =
      (skill.err * (weapon.scope ? 0.3 : 1) +
        base +
        (moving ? weapon.spread.move : 0) +
        (bot.ms.onGround ? 0 : weapon.spread.air)) *
      (bot.ms.crouch && bot.ms.onGround ? weapon.spread.crouchMult : 1);
    const angle = Math.random() * Math.PI * 2;
    const spreadRadius = Math.sqrt(Math.random()) * spread;
    const yaw = bot.yaw + bot.recoil[1] + Math.cos(angle) * spreadRadius;
    const pitch = bot.pitch + bot.recoil[0] + Math.sin(angle) * spreadRadius;
    const direction = [
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ];
    if (api.shoot(room, bot, { w: bot.weapon, o: eyeOf(bot), d: direction, rt: now, sc: 1 }, now)) {
      const pat = weapon.pattern[Math.min(bot.spray || 0, weapon.pattern.length - 1)];
      bot.recoil[0] += (pat[0] * Math.PI) / 180;
      bot.recoil[1] += ((pat[1] + (Math.random() - 0.5) * 0.1) * Math.PI) / 180;
      bot.spray = (bot.spray || 0) + 1;
      bot.lastShot = now;
      bot.burst++;
      if (!weapon.auto || bot.burst >= skill.burst) {
        bot.burst = 0;
        bot.pauseUntil =
          now + (weapon.auto ? 250 + Math.random() * 250 : 150 + Math.random() * 300);
      }
    }
  } else if (now >= bot.pauseUntil) {
    bot.burst = 0;
  }
}
