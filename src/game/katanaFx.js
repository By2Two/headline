import * as THREE from 'three';
import { SKIN, SLEEVE, mat, box } from './guns.js';

const SCALE = 0.85;
const BLADE_Y = -0.055 * SCALE;
const TIP = 0.76 * SCALE;
const GUARD = 0.095 * SCALE;

export const KATANA_REST = new THREE.Vector3(0.18, -0.1, -0.5);

const vector3 = (positionX, positionY, positionZ) =>
  new THREE.Vector3(positionX, positionY, positionZ);
const ease = (positionX) => positionX * positionX * (3 - 2 * positionX);
const seg = (progress, start, end) =>
  ease(Math.min(1, Math.max(0, (progress - start) / (end - start))));

const facing = (direction, upVector = vector3(0, 1, 0)) =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(vector3(0, 0, 0), direction.clone().normalize(), upVector),
  );
const poseTip = (quaternion, tip) => ({
  q: quaternion,
  p: tip.clone().sub(vector3(0, BLADE_Y, -TIP).applyQuaternion(quaternion)),
});

const REST_Q = facing(vector3(-0.3, 0.75, -0.6));
export const katanaRestQuat = () => REST_Q.clone();
export const knifeRestQuat = () => facing(vector3(-0.25, 0.55, -0.8));
export const KNIFE_REST = new THREE.Vector3(0.2, -0.12, -0.45);
export const knifeArmDir = () => vector3(0.85, -0.45, 0.3).normalize();
export const katanaArmDir = () => vector3(0.8, -0.45, 0.4).normalize();
export const katanaArm2Dir = () => vector3(-0.45, -0.85, 0.3).normalize();

const SHEATH_DIR = vector3(-0.9, -0.25, -0.35).normalize();
const SHEATH_Q = facing(SHEATH_DIR);
const SHEATH_MOUTH = vector3(-0.42, -0.04, -0.6);
const SHEATH_REACH = TIP - GUARD - 0.02;

const WIPE_DIR = vector3(-0.5, 0.2, -0.84).normalize();
const WIPE_Q = facing(WIPE_DIR);
const WIPE_P = vector3(0.1, 0.02, -0.3);
const FLICK_Q = facing(vector3(-0.35, -0.75, -0.55));

const sheathPose = (ins) =>
  poseTip(SHEATH_Q, SHEATH_MOUTH.clone().addScaledVector(SHEATH_DIR, ins - 0.04));

const TIMINGS = {
  wipe: [0.08, 0.32],
  bringSaya: [0.32, 0.46],
  flick: [0.36, 0.45],
  insert: [0.55, 0.69],
  down: [0.75, 0.85],
};
const DOWN = vector3(0, -0.9, 0);
const lowered = (pose) => ({ q: pose.q, p: pose.p.clone().add(DOWN) });
const KEYS = [
  { u: 0, q: REST_Q, p: KATANA_REST },
  { u: 0.08, q: WIPE_Q, p: WIPE_P },
  { u: 0.36, q: WIPE_Q, p: WIPE_P },
  { u: 0.4, q: FLICK_Q, p: vector3(0.16, -0.06, -0.3) },
  { u: 0.45, q: WIPE_Q, p: WIPE_P },
  { u: 0.55, ...sheathPose(0) },
  { u: 0.69, ...sheathPose(SHEATH_REACH) },
  { u: 0.75, ...sheathPose(SHEATH_REACH) },
  { u: 0.85, ...lowered(sheathPose(SHEATH_REACH)) },
  { u: 0.86, ...lowered({ q: REST_Q, p: KATANA_REST }) },
  { u: 1, q: REST_Q, p: KATANA_REST },
];

const scratchQuaternion = new THREE.Quaternion();
const scratchVector = new THREE.Vector3();

function poseAt(progress, outQ, outP) {
  let index = 0;
  while (index < KEYS.length - 2 && progress > KEYS[index + 1].u) {
    index++;
  }
  const fromKey = KEYS[index];
  const toKey = KEYS[index + 1];
  const blend = ease(Math.min(1, Math.max(0, (progress - fromKey.u) / (toKey.u - fromKey.u))));
  outQ.copy(fromKey.q).slerp(toKey.q, blend);
  outP.copy(fromKey.p).lerp(toKey.p, blend);
}

const hand = (width = 0.058) => {
  const group = new THREE.Group();
  group.add(box(width, 0.085, 0.07, SKIN, 0, 0, 0));
  group.add(box(0.02, 0.05, 0.04, SKIN, width / 2 + 0.006, 0.0, -0.01));
  return group;
};

function sleeve(parent, direction, length = 0.8) {
  const sleeveDirection = direction.clone().normalize();
  const sleeveMesh = box(0.085, 0.085, length, SLEEVE, 0, 0, 0);
  sleeveMesh.quaternion.setFromUnitVectors(vector3(0, 0, 1), sleeveDirection);
  sleeveMesh.userData.half = sleeveDirection.multiplyScalar(length / 2);
  parent.add(sleeveMesh);
  return sleeveMesh;
}

export function buildKatanaFx() {
  const group = new THREE.Group();
  group.visible = false;

  const wipe = hand();
  group.add(wipe);
  const wipeSleeve = sleeve(group, vector3(-0.45, -0.5, 0.75));

  const saya = new THREE.Group();
  const lacquer = mat(0x15161a, 0.35, 0.3);
  const gold = mat(0xb08a3a, 0.4, 0.7);
  const cord = mat(0x6b1f1f, 0.8, 0);
  saya.add(box(0.05, 0.064, 0.74, lacquer, 0, 0, -0.37));
  saya.add(box(0.058, 0.072, 0.03, gold, 0, 0, -0.015));
  saya.add(box(0.058, 0.072, 0.025, gold, 0, 0, -0.72));
  saya.add(box(0.056, 0.07, 0.012, cord, 0, 0, -0.25));
  group.add(saya);

  const bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0f12 });
  const drops = [];
  for (let index = 0; index < 7; index++) {
    const sleeveDirection = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), bloodMat);
    sleeveDirection.visible = false;
    sleeveDirection.userData.v = vector3(
      0.3 + Math.random() * 0.5,
      -0.3 - Math.random() * 0.5,
      -0.1 - Math.random() * 0.4,
    );
    group.add(sleeveDirection);
    drops.push(sleeveDirection);
  }
  return { group, wipe, wipeSleeve, saya, drops };
}

export function inspectKatana(viewmodel, pose, progress) {
  const effects = viewmodel.katanaFx;
  const gunQuaternion = viewmodel.guns[viewmodel.cur].group.quaternion;
  poseAt(progress, scratchQuaternion, scratchVector);
  pose.position.copy(scratchVector);
  pose.quaternion.copy(scratchQuaternion).multiply(gunQuaternion.clone().invert());
  pose.updateMatrixWorld(true);
  const sword = viewmodel.guns[viewmodel.cur].group;
  effects.group.visible = true;

  const handOn = progress > TIMINGS.wipe[0] && progress < 0.86;
  effects.wipe.visible = effects.wipeSleeve.visible = effects.saya.visible = handOn;
  if (handOn) {
    const along = 0.12 + 0.6 * seg(progress, TIMINGS.wipe[0] + 0.06, TIMINGS.wipe[1]);
    const enter = 1 - seg(progress, TIMINGS.wipe[0], TIMINGS.wipe[0] + 0.06);
    sword.localToWorld(scratchVector.set(0, -0.055, -along));
    scratchVector.add(vector3(-0.3 * enter, 0, 0.03));
    const blend = seg(progress, TIMINGS.bringSaya[0], TIMINGS.bringSaya[1]);
    const lower = seg(progress, TIMINGS.down[0], TIMINGS.down[1]);
    const grip = SHEATH_MOUTH.clone()
      .add(vector3(0, -0.01, -0.14).applyQuaternion(SHEATH_Q))
      .addScaledVector(DOWN, lower);
    effects.wipe.position.copy(scratchVector).lerp(grip, blend);
    sword.getWorldQuaternion(effects.wipe.quaternion).slerp(SHEATH_Q, blend);
    effects.wipeSleeve.position.copy(effects.wipe.position).add(effects.wipeSleeve.userData.half);
    effects.saya.visible = blend > 0.02;
    effects.saya.quaternion.copy(SHEATH_Q);
    effects.saya.scale.setScalar(Math.max(0.001, blend));
    effects.saya.position
      .copy(effects.wipe.position)
      .sub(vector3(0, -0.01, -0.14).applyQuaternion(SHEATH_Q).multiplyScalar(blend));
  }

  const spray = (progress - 0.4) / 0.1;
  sword.localToWorld(scratchVector.set(0, -0.055, -0.76));
  for (const sleeveDirection of effects.drops) {
    sleeveDirection.visible = spray > 0 && spray < 1;
    if (sleeveDirection.visible) {
      sleeveDirection.position
        .copy(scratchVector)
        .addScaledVector(sleeveDirection.userData.v, spray * 0.5);
      sleeveDirection.scale.setScalar(1 - spray * 0.6);
    }
  }
}
