import * as THREE from 'three';
import { RemotePlayer } from '../players.js';
import { decodeLook } from '../../../shared/look.js';
import { decodeGear, seatVisible, builtInOptic } from '../../../shared/warfare/config.js';
import { MW } from '../../../shared/warfare/weapons.js';
import { applyMilGear, attachOptic } from './gear.js';
import { attachGear, buildBinos, buildPaperMap, MIL_BUILDERS } from './items.js';

const FLAGS = { sprint: 1, prone: 2, downed: 4, map: 8, binos: 16, light: 32, using: 64, nvg: 128 };
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const SH_R = new THREE.Vector3(0.27, 0.48, 0);
const SH_L = new THREE.Vector3(-0.27, 0.48, 0);
const scratch = new THREE.Vector3();
function stretch(mesh, start, end, thickness) {
  scratch.subVectors(end, start);
  const length = scratch.length() || 1e-4;
  mesh.position.copy(start).addScaledVector(scratch, 0.5);
  mesh.scale.set(thickness, thickness, length + thickness * 0.4);
  mesh.quaternion.setFromUnitVectors(AXIS_Z, scratch.multiplyScalar(1 / length));
}
const CONE_MAT = new THREE.MeshBasicMaterial({
  color: 0xfff3c8,
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
const GLOW_MAT = new THREE.SpriteMaterial({
  color: 0xfff6d8,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export class MilRemotePlayer extends RemotePlayer {
  constructor(scene, id) {
    super(scene, id);
    this.lod = 0;
    this.lodN = (id * 7) & 63;
    this.animEvery = 1;
    this.animN = 0;
    this.animAcc = 0;
    const rigUpdate = this.rig.update.bind(this.rig);
    this.rig.update = (deltaTime, options) => {
      if (this.rig.dead) {
        this.deadT = (this.deadT || 0) + deltaTime;
        if (this.deadT > 4 && !this.fly) {
          return;
        }
      } else {
        this.deadT = 0;
      }
      if (this.animEvery > 1 && !this.rig.dead) {
        this.animAcc += deltaTime;
        if (++this.animN % this.animEvery) {
          return;
        }
        deltaTime = this.animAcc;
      }
      this.animAcc = 0;
      rigUpdate(deltaTime, options);
    };
    this.baseLook = decodeLook('');
    this.leanS = 0;
    this.proneS = 0;
    this.downS = 0;
    this.binos = buildBinos(false);
    this.binos.scale.setScalar(1.3);
    this.binos.visible = false;
    this.rig.torso.add(this.binos);
    this.map = buildPaperMap();
    this.map.visible = false;
    this.rig.torso.add(this.map);
    this.back = MIL_BUILDERS.rpg(false).group;
    this.back.visible = false;
    this.back.position.set(0.12, 0.32, 0.2);
    this.back.rotation.set(0, Math.PI / 2, 0.85 + Math.PI, 'ZYX');
    this.rig.torso.add(this.back);
    this.shovelBack = MIL_BUILDERS.shovel(false).group;
    this.shovelBack.visible = false;
    this.shovelBack.position.set(-0.1, 0.3, 0.2);
    this.shovelBack.rotation.set(0, Math.PI / 2, -0.7, 'ZYX');
    this.rig.torso.add(this.shovelBack);
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 16, 1, true), CONE_MAT);
    this.cone.geometry.translate(0, -4.5, 0);
    this.cone.rotation.x = -Math.PI / 2;
    this.glow = new THREE.Sprite(GLOW_MAT);
    this.glow.scale.setScalar(0.35);
    this.lightG = new THREE.Group();
    this.lightG.add(this.cone, this.glow);
    this.lightG.visible = false;
    this.rig.torso.add(this.lightG);
    this.lightG.position.set(0.1, 0.5, -0.5);
  }

  setLod(level) {
    if (level === this.lod && ++this.lodN & 63) {
      return;
    }
    this.lod = level;
    this.animEvery = level === 0 ? 1 : level === 1 ? 2 : 8;
    this.rig.root.visible = level < 2;
    this.rig.root.traverse((mesh) => {
      if (!mesh.isMesh) {
        return;
      }
      const userData = mesh.userData;
      if (userData.cs0 === undefined) {
        userData.cs0 = mesh.castShadow;
      }
      mesh.castShadow = level === 0 && userData.cs0;
      if (userData.small === undefined) {
        if (!mesh.geometry.boundingSphere) {
          mesh.geometry.computeBoundingSphere();
        }
        userData.small =
          mesh.geometry.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z) <
          0.07;
      }
      if (userData.small) {
        mesh.layers.set(level === 0 ? 0 : 1);
      }
    });
  }

  crowdPose() {
    const state = this.st;
    if (!state || this.rig.dead || !state.a) {
      return 2;
    }
    const flags = state.xm?.[4] || 0;
    if (flags & (FLAGS.prone | FLAGS.downed)) {
      return 2;
    }
    return state.c || state.xm?.[1] ? 1 : 0;
  }

  setLook(code) {
    if (code === this.lk) {
      return;
    }
    this.lk = code;
    this.baseLook = decodeLook(code);
    this.rig.milGearKey = null;
  }

  update(state, deltaTime, vehType = null, vehYaw = null) {
    const extra = state.xm || [0, 0, 0, '', 0, 0];
    const flags = extra[4] || 0;
    applyMilGear(this.rig, extra[3], this.baseLook);
    const gear = decodeGear(extra[3]);
    const inVeh = !!extra[1];
    const closed = inVeh && !seatVisible(vehType, extra[2] || 0);
    this.root.visible = !closed;
    const downed = !!(flags & FLAGS.downed) && !!state.a;
    const prone = !!(flags & FLAGS.prone) && !!state.a && !downed;
    const holdMap = !!(flags & FLAGS.map) && !downed;
    const binos = !!(flags & FLAGS.binos) && !downed;
    const using = !!(flags & FLAGS.using) && !downed;
    const busy = holdMap || binos || downed;
    const stepped = super.update(
      {
        ...state,
        c: inVeh || using ? 1 : state.c,
        ad: busy ? 0 : state.ad,
        pitch: prone ? Math.min(1.3, (state.pitch || 0) + 1.25) : state.pitch,
      },
      deltaTime,
    );
    const thickness = MW[state.w];
    const optic =
      thickness?.slot === 'primary' ? builtInOptic(thickness, gear.optic) || gear.optic : 'iron';
    const key = `${state.w}|${optic}|${gear.suppressor}|${gear.light}|${gear.grip}`;
    if (
      this.opticKey !== key &&
      this.rig.weapon &&
      thickness &&
      !thickness.melee &&
      !thickness.grenade &&
      !thickness.item
    ) {
      this.opticKey = key;
      const muzzleZ = this.rig.muzzle ? this.rig.muzzle.z : -0.6;
      attachOptic(this.rig.weapon, optic, {
        muzzleZ: muzzleZ,
        pistol: thickness.slot === 'secondary',
        builtIn: !!builtInOptic(thickness) || thickness.class === 'launcher',
      });
      if (thickness.slot === 'primary') {
        const tip = attachGear(
          this.rig.weapon,
          {
            muzzle: gear.suppressor ? 'suppressor' : 'none',
            rail: gear.light ? 'light' : 'none',
            grip: gear.grip,
          },
          this.rig.muzzle || new THREE.Vector3(0, 0.012, muzzleZ),
        );
        this.rig.muzzle = tip;
      }
    }
    this.back.visible = gear.launcher && thickness?.id !== 'rpg' && !this.rig.dead;
    this.shovelBack.visible =
      gear.cls === 'engineer' && thickness?.id !== 'shovel' && !this.rig.dead;
    this.leanS +=
      ((state.a && !prone && !downed ? extra[0] : 0) - this.leanS) * Math.min(1, deltaTime * 10);
    this.proneS += ((prone ? 1 : 0) - this.proneS) * Math.min(1, deltaTime * 6);
    this.downS += ((downed ? 1 : 0) - this.downS) * Math.min(1, deltaTime * 4);
    this.binosS =
      (this.binosS || 0) + ((binos ? 1 : 0) - (this.binosS || 0)) * Math.min(1, deltaTime * 4);
    const binocularsAmount = this.binosS;
    const showBinos = binocularsAmount > 0.03 && !downed;
    const rig = this.rig;
    if (!rig.dead) {
      rig.torso.rotation.z = -this.leanS * 0.55;
      rig.head.rotation.z += this.leanS * 0.3;
      const proneAmount = this.proneS;
      const downedAmount = this.downS;
      if (proneAmount > 0.01 || downedAmount > 0.01) {
        const blend = Math.min(1, proneAmount + downedAmount);
        rig.tilt.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.5 * blend);
        rig.tilt.position.set(0, 0, 0.85 * blend);
        rig.legs.forEach(({ thigh, knee }) => {
          thigh.rotation.x *= 1 - Math.max(proneAmount, downedAmount);
          knee.rotation.x *= 1 - Math.max(proneAmount, downedAmount);
        });
        rig.pelvis.position.y = 0.95;
        if (downedAmount > 0.5) {
          rig.setWeaponVisible(false);
        }
      } else {
        rig.tilt.quaternion.identity();
        rig.tilt.position.set(0, 0, 0);
      }
      this.map.visible = holdMap;
      this.binos.visible = showBinos;
      if (holdMap || showBinos || downed || using) {
        let rightHand;
        let leftHand;
        if (holdMap) {
          this.map.position.set(0, 0.32, -0.36);
          rightHand = new THREE.Vector3(0.2, 0.32, -0.34);
          leftHand = new THREE.Vector3(-0.2, 0.32, -0.34);
          rig.head.rotation.x = -0.6;
        } else if (showBinos) {
          const blend = binocularsAmount * binocularsAmount * (3 - 2 * binocularsAmount);
          this.binos.position.set(0.1 * (1 - blend), 0.36 + 0.38 * blend, -0.25 + 0.05 * blend);
          this.binos.rotation.set(-1.1 * (1 - blend) + rig.head.rotation.x * blend, 0, 0);
          const binocularsPosition = this.binos.position;
          rightHand = new THREE.Vector3(
            binocularsPosition.x + 0.075,
            binocularsPosition.y - 0.02,
            binocularsPosition.z + 0.01,
          );
          leftHand = new THREE.Vector3(
            binocularsPosition.x - 0.075,
            binocularsPosition.y - 0.02,
            binocularsPosition.z + 0.01,
          );
        } else if (downed) {
          rightHand = new THREE.Vector3(0.32, 0.12, 0.05);
          leftHand = new THREE.Vector3(-0.1, 0.3, -0.15);
        } else {
          rightHand = new THREE.Vector3(
            0.05,
            0.28 + Math.sin(performance.now() / 120) * 0.03,
            -0.25,
          );
          leftHand = new THREE.Vector3(-0.1, 0.26, -0.22);
        }
        if (rig.weapon && holdMap) {
          rig.weapon.position.set(0.05, 0.32, 0.2);
          rig.weapon.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, -0.9));
        } else if (rig.weapon && showBinos) {
          rig.weapon.position.set(0.07, 0.16, -0.19);
          rig.weapon.quaternion.setFromEuler(new THREE.Euler(-1.32, 0.2, 0.25, 'YXZ'));
        }
        const [firstUpperArm, firstForearm, secondUpperArm, secondForearm] = rig.arm;
        const rightElbow = SH_R.clone()
          .lerp(rightHand, 0.5)
          .add(new THREE.Vector3(0.1, -0.1, 0.08));
        const leftElbow = SH_L.clone()
          .lerp(leftHand, 0.5)
          .add(new THREE.Vector3(-0.1, -0.1, 0.05));
        stretch(firstUpperArm, SH_R, rightElbow, firstUpperArm.userData.w);
        stretch(firstForearm, rightElbow, rightHand, firstForearm.userData.w);
        stretch(secondUpperArm, SH_L, leftElbow, secondUpperArm.userData.w);
        stretch(secondForearm, leftElbow, leftHand, secondForearm.userData.w);
        rig.gloves[0].position.copy(rightHand);
        rig.gloves[1].position.copy(leftHand);
      }
    } else {
      this.map.visible = this.binos.visible = false;
    }
    if (inVeh && !rig.dead) {
      rig.legs.forEach(({ thigh, knee }) => {
        thigh.rotation.x = 1.45;
        knee.rotation.x = -1.45;
      });
      rig.pelvis.position.y = 1.08;
      rig.tilt.quaternion.identity();
      rig.tilt.position.set(0, 0, 0);
      rig.torso.rotation.x = Math.max(-0.4, Math.min(0.4, (state.pitch || 0) * 0.25));
      if ((vehYaw ?? null) !== null) {
        let yawDifference = (state.yaw || 0) - vehYaw;
        yawDifference = Math.atan2(Math.sin(yawDifference), Math.cos(yawDifference));
        rig.root.rotation.y = vehYaw + Math.max(-0.5, Math.min(0.5, yawDifference)) * 0.6;
        rig.head.rotation.y = Math.max(
          -1.2,
          Math.min(1.2, yawDifference - (rig.root.rotation.y - vehYaw)),
        );
      }
    }
    const light = !!(flags & FLAGS.light) && state.a && !downed;
    this.lightG.visible = light;
    if (light) {
      this.lightG.rotation.x = -(state.pitch || 0) * 0.7;
    }
    return inVeh || prone || downed ? false : stepped;
  }
}
