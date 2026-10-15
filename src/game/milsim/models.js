import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VEHICLES, SEATS } from '../../../shared/milsim/config.js';
import { placeStructureModel, setStructModelMaterials, structureModel } from './structModels.js';

const standardMaterial = (color, roughness = 0.75, metalness = 0.15) =>
  new THREE.MeshStandardMaterial({ color: color, roughness: roughness, metalness: metalness });
const PAINT = [standardMaterial(0x8a7a55, 0.8, 0.2), standardMaterial(0x4c5a3a, 0.8, 0.2)];
const DARK = standardMaterial(0x1e2022, 0.6, 0.3);
const TIRE = standardMaterial(0x151515, 0.95, 0);
const GLASS = new THREE.MeshStandardMaterial({
  color: 0x26343c,
  roughness: 0.08,
  metalness: 0.6,
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
});
const CRATE = standardMaterial(0x7d6a43, 0.9, 0);
const ROTOR = standardMaterial(0x1a1a1a, 0.6, 0.3);
const SEAT = standardMaterial(0x2c2a24, 0.95, 0);
const GAUGE = new THREE.MeshBasicMaterial({ color: 0x5f8a62 });

function addBox(
  group,
  width,
  height,
  depth,
  material,
  positionX,
  positionY,
  positionZ,
  rotationX = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(positionX, positionY, positionZ);
  mesh.rotation.x = rotationX;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function door(
  group,
  out,
  seat,
  side,
  positionX,
  positionY,
  startZ,
  length,
  height,
  material,
  glass,
) {
  const depth = new THREE.Group();
  depth.position.set(positionX, positionY, startZ);
  addBox(depth, 0.06, height, length, material, 0, 0, length / 2);
  if (glass) {
    addBox(depth, 0.04, height * 0.42, length * 0.7, GLASS, side * 0.01, height * 0.25, length / 2);
  }
  group.add(depth);
  out.doors.push({ seat, sx: side, g: depth, a: 0 });
}

const RIM = standardMaterial(0x8b8f88, 0.55, 0.35);
const wheelGeo = {};
function wheelParts(radius, width) {
  const cacheKey = `${radius}|${width}`;
  if (wheelGeo[cacheKey]) {
    return wheelGeo[cacheKey];
  }
  const tire = new THREE.CylinderGeometry(radius, radius, width, 18).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.02, 14).rotateZ(
    Math.PI / 2,
  );
  const parts = [
    new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, width + 0.06, 8).rotateZ(Math.PI / 2),
  ];
  for (let index = 0; index < 3; index++) {
    parts.push(
      new THREE.BoxGeometry(width + 0.04, radius * 1.08, radius * 0.11).rotateX(
        (index / 3) * Math.PI,
      ),
    );
  }
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    parts.push(
      new THREE.BoxGeometry(width * 0.94, radius * 0.07, radius * 0.15)
        .rotateX(angle)
        .translate(0, Math.cos(angle) * radius, Math.sin(angle) * radius),
    );
  }
  return (wheelGeo[cacheKey] = { tire, rim, detail: mergeGeometries(parts) });
}
function wheel(group, radius, width, positionX, positionY, positionZ) {
  const parts = wheelParts(radius, width);
  const pivot = new THREE.Group();
  pivot.position.set(positionX, positionY, positionZ);
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(parts.tire, TIRE);
  tire.castShadow = true;
  spin.add(tire, new THREE.Mesh(parts.rim, RIM), new THREE.Mesh(parts.detail, DARK));
  group.add(pivot);
  return { pivot, spin, z: positionZ, y: positionY, r: radius, off: 0 };
}

export function buildVehicle(type, team) {
  const definition = VEHICLES[type];
  const group = new THREE.Group();
  const paint = PAINT[team] || PAINT[1];
  const wheels = [];
  const out = { group: group, wheels, rotor: null, tailRotor: null, cargo: null, type, doors: [] };
  if (type === 'truck' || type === 'transport') {
    const length = definition.len;
    const width = definition.wid;
    const cabStart = -length / 2 + 0.15;
    const cabEnd = -length / 2 + 2.25;
    const centerZ = (cabStart + cabEnd) / 2;
    const cabLength = cabEnd - cabStart;
    addBox(group, width * 0.9, 0.35, length * 0.95, DARK, 0, 0.85, 0);
    addBox(group, width * 0.94, 0.75, 1.0, paint, 0, 1.3, cabStart - 0.35);
    addBox(group, width * 0.9, 0.3, 0.12, DARK, 0, 1.05, cabStart - 0.9);
    for (const side of [-1, 1]) {
      addBox(group, 0.55, 0.08, 1.1, paint, side * (width / 2 - 0.1), 1.55, cabStart - 0.3);
    }
    addBox(group, width, 0.1, cabLength, DARK, 0, 1.1, centerZ);
    addBox(group, width, 0.1, cabLength, paint, 0, 2.5, centerZ);
    addBox(group, width, 1.4, 0.08, paint, 0, 1.8, cabEnd);
    addBox(group, width, 0.6, 0.1, paint, 0, 1.45, cabStart);
    addBox(group, width * 0.92, 0.7, 0.04, GLASS, 0, 2.1, cabStart + 0.02).rotation.x = -0.12;
    for (const side of [-1, 1]) {
      addBox(group, 0.1, 1.4, 0.1, paint, side * (width / 2 - 0.05), 1.8, cabStart);
      addBox(group, 0.06, 0.3, cabLength, paint, side * (width / 2 + 0.01), 1.2, centerZ);
    }
    const seatZ = SEATS[type][0][2];
    for (const [seat, side] of [
      [0, -1],
      [1, 1],
    ]) {
      door(
        group,
        out,
        seat,
        side,
        side * (width / 2 + 0.03),
        1.85,
        seatZ - 0.55,
        1.1,
        1.0,
        paint,
        true,
      );
      addBox(group, 0.55, 0.12, 0.5, SEAT, side * 0.6, 1.2, seatZ);
      addBox(group, 0.55, 0.6, 0.1, SEAT, side * 0.6, 1.5, seatZ + 0.3);
    }
    addBox(group, width * 0.9, 0.25, 0.3, DARK, 0, 1.75, cabStart + 0.2);
    for (const sideX of [-0.75, -0.5]) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 14), GAUGE);
      gauge.position.set(sideX, 1.8, cabStart + 0.36);
      group.add(gauge);
    }
    const wheelG = new THREE.Group();
    wheelG.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 22), DARK));
    for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.19, 0.012), DARK);
      mesh.position.set(Math.sin(angle) * 0.095, Math.cos(angle) * 0.095, 0);
      mesh.rotation.z = -angle;
      wheelG.add(mesh);
    }
    wheelG.position.set(-0.6, 1.85, cabStart + 0.55);
    wheelG.rotation.x = -0.9;
    group.add(wheelG);
    out.steerWheel = wheelG;
    const bedStart = cabEnd + 0.1;
    const bedLength = length / 2 - 0.05 - bedStart;
    const bedCenterZ = bedStart + bedLength / 2;
    addBox(group, width, 0.15, bedLength, paint, 0, 1.1, bedCenterZ);
    for (const side of [-1, 1]) {
      addBox(group, 0.08, 0.5, bedLength, paint, side * (width / 2 - 0.04), 1.43, bedCenterZ);
    }
    addBox(group, width, 0.6, 0.08, paint, 0, 1.45, bedStart);
    if (type === 'transport') {
      for (const side of [-1, 1]) {
        addBox(
          group,
          0.42,
          0.08,
          bedLength - 0.3,
          SEAT,
          side * (width / 2 - 0.3),
          1.55,
          bedCenterZ,
        );
        for (const positionZ of [bedStart + 0.4, bedCenterZ, length / 2 - 0.45]) {
          addBox(group, 0.06, 0.38, 0.06, DARK, side * (width / 2 - 0.3), 1.36, positionZ);
        }
      }
      for (const positionZ of [bedStart + 0.25, bedCenterZ, length / 2 - 0.2]) {
        for (const side of [-1, 1]) {
          addBox(group, 0.05, 1.05, 0.05, DARK, side * (width / 2 - 0.05), 2.2, positionZ);
        }
        addBox(group, width - 0.1, 0.05, 0.05, DARK, 0, 2.72, positionZ);
      }
      addBox(group, 0.05, 0.05, bedLength, DARK, 0, 2.72, bedCenterZ);
    } else {
      addBox(group, width, 0.5, 0.08, paint, 0, 1.43, length / 2 - 0.05);
      const cargo = new THREE.Group();
      for (let roughness = 0; roughness < 2; roughness++) {
        for (let color = 0; color < 3; color++) {
          for (let index = 0; index < 2; index++) {
            const metalness = addBox(cargo, 0.95, 0.7, 1.1, CRATE, 0, 0, 0);
            metalness.position.set(
              -0.55 + roughness * 1.1,
              1.55 + index * 0.72,
              -0.4 + color * 1.25,
            );
          }
        }
      }
      group.add(cargo);
      out.cargo = cargo;
    }
    const wheelZ = [-length / 2 + 1.2, length / 2 - 2.0, length / 2 - 0.8];
    for (const positionZ of wheelZ) {
      for (const side of [-1, 1]) {
        wheels.push(wheel(group, 0.55, 0.42, side * (width / 2 - 0.12), 0.55, positionZ));
      }
    }
  } else if (type === 'jeep' || type === 'mjeep') {
    const length = definition.len;
    const width = definition.wid;
    const tub0 = -length / 2 + 1.5;
    const tubL = length / 2 - 0.15 - tub0;
    const tubZ = tub0 + tubL / 2;
    addBox(group, width * 0.9, 0.3, length * 0.9, DARK, 0, 0.6, 0);
    addBox(group, width, 0.6, 1.5, paint, 0, 1.05, -length / 2 + 0.8);
    addBox(group, width * 0.95, 0.06, 1.4, paint, 0, 1.38, -length / 2 + 0.8);
    addBox(group, width * 0.96, 0.08, tubL, DARK, 0, 0.82, tubZ);
    const wheelRadius = 1.45;
    for (const side of [-1, 1]) {
      const sideOffset = side * (width / 2 - 0.03);
      addBox(
        group,
        0.06,
        0.5,
        length / 2 - 0.15 - wheelRadius,
        paint,
        sideOffset,
        1.05,
        (wheelRadius + length / 2 - 0.15) / 2,
      );
      addBox(
        group,
        0.1,
        0.06,
        length / 2 - 0.15 - wheelRadius,
        DARK,
        sideOffset,
        1.32,
        (wheelRadius + length / 2 - 0.15) / 2,
      );
      const armed = type === 'mjeep';
      door(
        group,
        out,
        side < 0 ? 0 : armed ? 2 : 1,
        side,
        sideOffset,
        1.05,
        tub0,
        0.33 - tub0,
        0.5,
        paint,
        false,
      );
      door(
        group,
        out,
        side < 0 ? (armed ? -1 : 2) : 3,
        side,
        sideOffset,
        1.05,
        0.37,
        wheelRadius - 0.37,
        0.5,
        paint,
        false,
      );
      addBox(group, 0.5, 0.08, 0.9, paint, side * (width / 2 + 0.05), 1.0, -length / 2 + 0.55);
      addBox(group, 0.35, 0.08, 0.9, paint, side * (width / 2 + 0.02), 1.0, length / 2 - 0.85);
    }
    addBox(group, width, 0.5, 0.06, paint, 0, 1.05, length / 2 - 0.15);
    addBox(group, width, 0.55, 0.06, paint, 0, 1.05, tub0);
    addBox(
      group,
      definition.wid * 0.9,
      0.55,
      0.05,
      GLASS,
      0,
      1.6,
      -definition.len / 2 + 1.55,
    ).rotation.x = -0.25;
    addBox(group, definition.wid * 0.92, 0.06, 0.06, DARK, 0, 1.88, -definition.len / 2 + 1.5);
    for (const side of [-1, 1]) {
      addBox(group, 0.06, 0.8, 0.06, DARK, side * (definition.wid / 2 - 0.1), 1.65, 0.6);
    }
    addBox(group, definition.wid - 0.1, 0.06, 0.06, DARK, 0, 2.05, 0.6);
    if (type === 'mjeep') {
      addBox(group, 0.12, 0.85, 0.12, DARK, 0, 1.3, 0.85);
      const turret = new THREE.Group();
      turret.position.set(0, 1.85, 0.85);
      const gunPivot = new THREE.Group();
      gunPivot.position.set(0, 0.12, 0);
      turret.add(gunPivot);
      addBox(gunPivot, 0.16, 0.18, 0.55, DARK, 0, 0, -0.1);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 8), DARK);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.85);
      gunPivot.add(barrel);
      addBox(gunPivot, 0.75, 0.42, 0.04, paint, 0, 0.12, -0.42);
      addBox(gunPivot, 0.04, 0.12, 0.18, DARK, 0, -0.05, 0.25);
      const tip = new THREE.Object3D();
      tip.position.set(0, 0.02, -1.42);
      gunPivot.add(tip);
      group.add(turret);
      out.turret = turret;
      out.gunPivot = gunPivot;
      out.gunTip = tip;
    }
    for (const [side, positionZ] of type === 'mjeep'
      ? [
          [-0.45, -0.25],
          [0.45, -0.25],
          [0.6, 1.25],
        ]
      : [
          [-0.45, -0.25],
          [0.45, -0.25],
          [-0.45, 0.9],
          [0.45, 0.9],
        ]) {
      addBox(group, 0.46, 0.12, 0.46, SEAT, side, 1.02, positionZ);
      addBox(group, 0.46, 0.5, 0.1, SEAT, side, 1.3, positionZ + 0.25);
    }
    addBox(group, definition.wid * 0.9, 0.28, 0.3, DARK, 0, 1.3, -definition.len / 2 + 1.38);
    for (const sideX of [-0.62, -0.38]) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), GAUGE);
      gauge.position.set(sideX, 1.36, -definition.len / 2 + 1.535);
      group.add(gauge);
    }
    const column = addBox(
      group,
      0.04,
      0.04,
      0.42,
      DARK,
      -0.45,
      1.27,
      -definition.len / 2 + 1.72,
      -0.75,
    );
    void column;
    const wheelG = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 22), DARK);
    wheelG.add(rim);
    for (const angle of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.012), DARK);
      mesh.position.set(Math.sin(angle) * 0.08, Math.cos(angle) * 0.08, 0);
      mesh.rotation.z = -angle;
      wheelG.add(mesh);
    }
    wheelG.position.set(-0.45, 1.42, -definition.len / 2 + 1.92);
    wheelG.rotation.x = -0.75;
    const steer = new THREE.Group();
    steer.add(wheelG);
    group.add(steer);
    out.steerWheel = wheelG;
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 12), TIRE);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.2, definition.len / 2 + 0.1);
    group.add(spare);
    for (const positionZ of [-definition.len / 2 + 0.85, definition.len / 2 - 0.85]) {
      for (const side of [-1, 1]) {
        wheels.push(wheel(group, 0.42, 0.34, side * (definition.wid / 2 - 0.05), 0.42, positionZ));
      }
    }
  } else if (type === 'ifv' || type === 'tank') {
    const length = definition.len;
    const width = definition.wid;
    const tank = type === 'tank';
    for (const side of [-1, 1]) {
      addBox(group, 0.62, 0.95, length * 0.97, TIRE, side * (width / 2 - 0.31), 0.58, 0);
      addBox(group, 0.7, 0.08, length, paint, side * (width / 2 - 0.31), 1.12, 0);
      const count = tank ? 7 : 6;
      for (let index = 0; index < count; index++) {
        wheels.push(
          wheel(
            group,
            0.36,
            0.5,
            side * (width / 2 - 0.31),
            0.42,
            -length / 2 + 0.8 + (index * (length - 1.6)) / (count - 1),
          ),
        );
      }
      wheels.push(wheel(group, 0.3, 0.5, side * (width / 2 - 0.31), 0.8, -length / 2 + 0.25));
      wheels.push(wheel(group, 0.3, 0.5, side * (width / 2 - 0.31), 0.8, length / 2 - 0.25));
    }
    if (tank) {
      addBox(group, width - 1.2, 0.9, length * 0.92, paint, 0, 0.95, 0.1);
      addBox(group, width - 0.1, 0.35, length * 0.8, paint, 0, 1.4, 0.35);
      addBox(group, width - 0.1, 0.5, 1.6, paint, 0, 1.25, -length / 2 + 0.75, 0.5);
      addBox(group, width - 0.2, 0.25, 0.8, DARK, 0, 1.6, length / 2 - 0.5);
      addBox(group, 0.5, 0.1, 0.55, DARK, -0.6, 1.62, -length / 2 + 1.5);
    } else {
      addBox(group, width - 1.0, 1.0, length * 0.92, paint, 0, 1.1, 0);
      addBox(group, width - 0.1, 0.5, length * 0.85, paint, 0, 1.75, 0.2);
      addBox(group, width - 0.1, 0.7, 1.4, paint, 0, 1.4, -length / 2 + 0.6, 0.65);
      addBox(group, 1.2, 0.9, 0.08, DARK, 0, 1.5, length / 2 + 0.02);
      for (const side of [-1, 1]) {
        for (const positionZ of [0.4, 1.3, 2.2]) {
          addBox(group, 0.04, 0.12, 0.12, DARK, side * (width / 2 - 0.04), 1.8, positionZ);
        }
      }
    }
    const turret = new THREE.Group();
    turret.position.set(0, tank ? 1.95 : 2.25, tank ? 0.2 : -0.3);
    if (tank) {
      addBox(turret, 2.5, 0.75, 3.0, paint, 0, 0, 0.2);
      addBox(turret, 2.3, 0.6, 0.9, paint, 0, -0.02, -1.45, -0.35);
      addBox(turret, 2.2, 0.55, 0.9, paint, 0, 0, 1.9);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.3, 12), paint);
      cup.position.set(0.6, 0.5, 0.4);
      turret.add(cup);
      addBox(turret, 0.1, 0.25, 0.3, DARK, -0.85, 0.5, -0.2);
    } else {
      addBox(turret, 1.7, 0.55, 1.9, paint, 0, 0, 0);
      addBox(turret, 1.5, 0.45, 0.6, paint, 0, -0.02, -1.15, -0.4);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.22, 10), paint);
      cup.position.set(0.55, 0.38, 0.5);
      turret.add(cup);
    }
    const gunPivot = new THREE.Group();
    gunPivot.position.set(0, 0.05, tank ? -1.6 : -1.1);
    turret.add(gunPivot);
    const glen = tank ? 4.4 : 2.6;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(tank ? 0.085 : 0.045, tank ? 0.1 : 0.05, glen, 10),
      DARK,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -glen / 2);
    gunPivot.add(barrel);
    if (tank) {
      const fume = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), DARK);
      fume.rotation.x = Math.PI / 2;
      fume.position.set(0, 0, -glen * 0.55);
      gunPivot.add(fume);
      addBox(gunPivot, 0.5, 0.45, 0.5, paint, 0, 0, 0.05);
    } else {
      addBox(gunPivot, 0.35, 0.3, 0.45, paint, 0, 0, 0.05);
    }
    const tip = new THREE.Object3D();
    tip.position.set(0, 0, -glen - 0.1);
    gunPivot.add(tip);
    group.add(turret);
    out.turret = turret;
    out.gunPivot = gunPivot;
    out.gunTip = tip;
  } else if (type === 'gunship') {
    const startZ = -3.75;
    const endZ = 0.15;
    const centerZ = (startZ + endZ) / 2;
    const cabLength = endZ - startZ;
    addBox(group, 1.3, 0.75, 6.2, paint, 0, 1.0, -0.9);
    for (const side of [-1, 1]) {
      addBox(group, 0.06, 0.48, cabLength, paint, side * 0.62, 1.6, centerZ);
    }
    addBox(group, 1.3, 1.5, 2.1, paint, 0, 1.55, 1.2);
    addBox(group, 1.2, 0.5, 2.6, paint, 0, 2.55, 1.0);
    addBox(group, 1.3, 0.55, 0.9, paint, 0, 1.1, -4.15);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10), paint);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 1.1, -5.1);
    group.add(nose);
    for (const side of [-1, 1]) {
      addBox(group, 0.03, 0.72, cabLength, GLASS, side * 0.6, 2.2, centerZ);
      addBox(group, 0.05, 0.05, cabLength, DARK, side * 0.6, 2.57, centerZ);
      addBox(group, 0.05, 0.05, cabLength, DARK, side * 0.61, 1.85, centerZ);
      for (const positionZ of [startZ + 0.05, -1.85, endZ - 0.05]) {
        addBox(group, 0.05, 0.74, 0.05, DARK, side * 0.6, 2.21, positionZ);
      }
    }
    addBox(group, 1.2, 0.03, cabLength, GLASS, 0, 2.58, centerZ);
    addBox(group, 1.25, 0.05, 0.05, DARK, 0, 2.58, -1.85);
    addBox(group, 1.15, 0.85, 0.03, GLASS, 0, 2.05, startZ - 0.12).rotation.x = 0.55;
    addBox(group, 1.2, 0.05, 0.05, DARK, 0, 2.42, startZ + 0.1);
    addBox(group, 1.15, 0.6, 0.04, GLASS, 0, 2.25, -1.85);
    addBox(group, 0.5, 0.1, 0.5, SEAT, 0, 1.25, -2.65);
    addBox(group, 0.5, 0.6, 0.1, SEAT, 0, 1.55, -2.38);
    addBox(group, 0.95, 0.28, 0.32, DARK, 0, 1.72, -3.4);
    addBox(group, 0.16, 0.2, 0.22, DARK, 0, 1.95, -3.25);
    for (const sideX of [-0.32, -0.18, 0.18, 0.32]) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 14), GAUGE);
      gauge.position.set(sideX, 1.8, -3.23);
      group.add(gauge);
    }
    addBox(group, 0.5, 0.1, 0.5, SEAT, 0, 1.55, -0.92);
    addBox(group, 0.5, 0.65, 0.1, SEAT, 0, 1.88, -0.64);
    addBox(group, 0.95, 0.2, 0.26, DARK, 0, 1.86, -1.62);
    for (let index = 0; index < 6; index++) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), GAUGE);
      gauge.position.set(-0.24 + (index % 3) * 0.24, 1.88 + (index > 2 ? -0.05 : 0.03), -1.48);
      group.add(gauge);
    }
    addBox(group, 0.04, 0.45, 0.04, DARK, 0, 1.5, -1.3).rotation.x = -0.2;
    for (const side of [-1, 1]) {
      addBox(group, 1.4, 0.08, 0.7, paint, side * 1.25, 1.75, 0.6);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 10), DARK);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 1.6, 1.5, 0.6);
      group.add(pod);
      addBox(group, 0.07, 0.07, 3.8, DARK, side * 0.9, 0.12, -1.0);
      for (const positionZ of [-2.2, 0.2]) {
        addBox(group, 0.05, 0.7, 0.05, DARK, side * 0.75, 0.5, positionZ);
      }
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.45, 6.0, 10), paint);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 2.0, 5.2);
    group.add(boom);
    addBox(group, 0.1, 1.4, 1.0, paint, 0, 2.7, 7.9);
    addBox(group, 1.6, 0.07, 0.5, paint, 0, 2.1, 7.2);
    addBox(group, 0.3, 0.45, 0.3, DARK, 0, 3.0, 0.7);
    const turret = new THREE.Group();
    turret.position.set(0, 0.7, -3.9);
    addBox(turret, 0.42, 0.3, 0.42, DARK, 0, 0, 0);
    const gunPivot = new THREE.Group();
    turret.add(gunPivot);
    for (let index = 0; index < 3; index++) {
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), DARK);
      blade.rotation.x = Math.PI / 2;
      blade.position.set(
        Math.cos((index * Math.PI * 2) / 3) * 0.04,
        Math.sin((index * Math.PI * 2) / 3) * 0.04 - 0.05,
        -0.55,
      );
      gunPivot.add(blade);
    }
    const tip = new THREE.Object3D();
    tip.position.set(0, -0.05, -1.05);
    gunPivot.add(tip);
    group.add(turret);
    out.turret = turret;
    out.gunPivot = gunPivot;
    out.gunTip = tip;
    const rotor = new THREE.Group();
    for (let index = 0; index < 4; index++) {
      const blade = addBox(rotor, 0.3, 0.04, 6.4, ROTOR, 0, 0, 3.2);
      blade.position.set(0, 0, 0);
      blade.geometry.translate(0, 0, 3.2);
      blade.rotation.y = (index * Math.PI) / 2;
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    rotor.position.set(0, 3.35, 0.7);
    group.add(rotor);
    const tail = new THREE.Group();
    for (let index = 0; index < 2; index++) {
      const blade = addBox(tail, 0.05, 1.4, 0.15, ROTOR, 0, 0, 0);
      blade.rotation.x = index * (Math.PI / 2);
    }
    tail.position.set(0.2, 2.8, 8.0);
    group.add(tail);
    out.rotor = rotor;
    out.disc = disc;
    out.tailRotor = tail;
  } else if (type === 'apc') {
    addBox(group, definition.wid, 1.2, definition.len, paint, 0, 1.2, 0);
    addBox(group, definition.wid * 0.85, 0.6, definition.len * 0.75, paint, 0, 2.05, 0.3);
    addBox(group, definition.wid, 0.9, 1.2, paint, 0, 1.1, -definition.len / 2 - 0.3, 0.6);
    const turret = new THREE.Group();
    addBox(turret, 1.2, 0.5, 1.3, paint, 0, 0, 0);
    const lid = addBox(turret, 0.6, 0.05, 0.6, DARK, 0, 0.42, 0.62);
    lid.rotation.x = -1.1;
    const gunPivot = new THREE.Group();
    gunPivot.position.set(0, 0.05, -0.6);
    turret.add(gunPivot);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 8), DARK);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 0, -0.8);
    gunPivot.add(gun);
    addBox(gunPivot, 0.22, 0.2, 0.4, DARK, 0, 0, -0.05);
    const tip = new THREE.Object3D();
    tip.position.set(0, 0, -1.65);
    gunPivot.add(tip);
    turret.position.set(0, 2.6, -0.5);
    group.add(turret);
    out.turret = turret;
    out.gunPivot = gunPivot;
    out.gunTip = tip;
    addBox(group, 0.5, 0.25, 0.05, GLASS, -0.6, 1.95, -definition.len / 2 + 0.55);
    for (let index = 0; index < 4; index++) {
      for (const side of [-1, 1]) {
        wheels.push(
          wheel(
            group,
            0.55,
            0.45,
            side * (definition.wid / 2 - 0.05),
            0.55,
            -definition.len / 2 + 0.9 + index * ((definition.len - 1.8) / 3),
          ),
        );
      }
    }
  } else if (type === 'heli') {
    addBox(group, 2.3, 0.5, 6.0, paint, 0, 0.45, -1.5);
    addBox(group, 2.3, 0.12, 4.7, paint, 0, 2.55, -1.3);
    addBox(group, 1.4, 0.55, 3.0, paint, 0, 2.88, -0.4);
    addBox(group, 2.3, 1.95, 0.12, paint, 0, 1.6, 1.0);
    addBox(group, 1.2, 1.3, 0.9, paint, 0, 1.9, 1.5);
    addBox(group, 2.2, 0.6, 1.0, paint, 0, 0.95, -4.15);
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      GLASS,
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 1.8, -3.9);
    group.add(nose);
    for (const side of [-1, 1]) {
      addBox(group, 0.08, 0.6, 1.25, paint, side * 1.15, 1.0, -3.35);
      addBox(group, 0.04, 1.0, 1.25, GLASS, side * 1.15, 1.85, -3.35);
      addBox(group, 0.12, 1.95, 0.14, paint, side * 1.12, 1.6, -2.72);
      addBox(group, 0.05, 1.75, 1.5, paint, side * 1.2, 1.6, 1.8);
      addBox(group, 0.06, 0.06, 4.0, DARK, side * 1.18, 2.45, -0.7);
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 6.5, 10), paint);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 2.2, 4.5);
    boom.castShadow = true;
    group.add(boom);
    addBox(group, 0.12, 1.5, 1.1, paint, 0, 2.9, 7.6);
    addBox(group, 1.8, 0.08, 0.6, paint, 0, 2.3, 7.0);
    for (const side of [-1, 1]) {
      addBox(group, 0.08, 0.08, 4.5, DARK, side * 1.15, 0.12, -1.0);
      for (const positionZ of [-2.4, 0.4]) {
        addBox(group, 0.06, 0.75, 0.06, DARK, side * 1.0, 0.5, positionZ);
      }
    }
    addBox(group, 0.3, 0.35, 0.3, DARK, 0, 3.2, -0.6);
    addBox(group, 2.0, 0.06, 6.2, DARK, 0, 0.72, -1.2);
    for (const side of [-0.55, 0.55]) {
      addBox(group, 0.5, 0.1, 0.5, SEAT, side, 0.95, -3.4);
      addBox(group, 0.5, 0.65, 0.1, SEAT, side, 1.3, -3.15);
      addBox(group, 0.05, 0.5, 0.05, DARK, side * 0.9, 1.1, -3.95);
    }
    addBox(group, 1.8, 0.32, 0.4, DARK, 0, 1.55, -4.35);
    for (let index = 0; index < 6; index++) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), GAUGE);
      gauge.position.set(
        -0.6 + (index % 3) * 0.16 + (index > 2 ? 0.75 : 0),
        1.6 + (index % 2) * 0.0,
        -4.14,
      );
      group.add(gauge);
    }
    for (const side of [-1, 1]) {
      addBox(group, 0.07, 1.3, 0.07, paint, side * 1.0, 2.05, -4.1).rotation.x = 0.45;
    }
    addBox(group, 2.0, 0.07, 0.07, paint, 0, 2.62, -3.85);
    for (const side of [-0.7, 0.7]) {
      for (const positionZ of [-1.6, -0.5, 0.6]) {
        addBox(group, 0.45, 0.1, 0.45, SEAT, side, 1.1, positionZ);
        addBox(group, 0.45, 0.55, 0.08, SEAT, side, 1.42, positionZ + 0.24);
      }
    }
    const rotor = new THREE.Group();
    for (let index = 0; index < 4; index++) {
      const blade = addBox(rotor, 0.32, 0.04, 7.2, ROTOR, 0, 0, 3.6);
      blade.position.set(0, 0, 0);
      blade.geometry.translate(0, 0, 3.6);
      blade.rotation.y = (index * Math.PI) / 2;
    }
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(7.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    rotor.position.set(0, 3.35, -0.6);
    group.add(rotor);
    const tail = new THREE.Group();
    for (let index = 0; index < 2; index++) {
      const blade = addBox(tail, 0.05, 1.5, 0.16, ROTOR, 0, 0, 0);
      blade.rotation.x = index * (Math.PI / 2);
    }
    tail.position.set(0.2, 3.0, 7.75);
    group.add(tail);
    out.rotor = rotor;
    out.disc = disc;
    out.tailRotor = tail;
  }
  return out;
}

const scratchWorldPosition = new THREE.Vector3();
const TRAVEL = {
  jeep: 0.24,
  mjeep: 0.24,
  truck: 0.28,
  transport: 0.28,
  apc: 0.22,
  ifv: 0.12,
  tank: 0.1,
};
function suspension(vehicleModel, state, deltaTime, ground) {
  const travel = TRAVEL[vehicleModel.type] ?? 0.2;
  const group = vehicleModel.group;
  group.updateMatrix();
  const elements = group.matrix.elements;
  const upY = Math.max(0.3, elements[5]);
  const blend = Math.min(1, deltaTime * 18);
  for (const width of vehicleModel.wheels) {
    let travelled = 0;
    if (state.alive && !state.flipped) {
      scratchWorldPosition.set(width.pivot.position.x, width.y, width.z).applyMatrix4(group.matrix);
      const groundY = ground(
        scratchWorldPosition.x,
        scratchWorldPosition.z,
        scratchWorldPosition.y + 0.5,
      );
      travelled = Math.max(
        -travel,
        Math.min(travel, (groundY + width.r - scratchWorldPosition.y) / upY),
      );
    }
    width.off += (travelled - width.off) * blend;
    width.pivot.position.y = width.y + width.off;
  }
}

export function animateVehicle(vehicleModel, state, deltaTime, ground) {
  const definition = VEHICLES[vehicleModel.type];
  if (vehicleModel.wheels.length) {
    const roughness =
      vehicleModel.type === 'jeep' || vehicleModel.type === 'mjeep'
        ? 0.42
        : vehicleModel.type === 'tank' || vehicleModel.type === 'ifv'
          ? 0.36
          : 0.55;
    vehicleModel.spin =
      ((vehicleModel.spin || 0) + ((state.v || 0) / roughness) * deltaTime) % (Math.PI * 2);
    const angle = definition.tracks ? 0 : -(state.steer || 0);
    for (const width of vehicleModel.wheels) {
      width.spin.rotation.x = -vehicleModel.spin;
      if (width.z < -definition.len * 0.15) {
        width.pivot.rotation.y = angle;
      }
    }
    if (ground && vehicleModel.group.userData.lodNear !== false) {
      suspension(vehicleModel, state, deltaTime, ground);
    }
  }
  if (vehicleModel.steerWheel) {
    vehicleModel.steerWheel.rotation.z = -(state.steer || 0) * 3;
  }
  if (vehicleModel.turret) {
    vehicleModel.turret.rotation.y = state.tyaw || 0;
    vehicleModel.gunPivot.rotation.x = state.tp || 0;
  }
  for (const depth of vehicleModel.doors || []) {
    const open = ((state.doors || 0) >> depth.seat) & 1;
    depth.a += ((open ? 1.15 : 0) - depth.a) * Math.min(1, deltaTime * 8);
    depth.g.rotation.y = depth.sx * depth.a;
  }
  if (vehicleModel.rotor && !vehicleModel.wrecked) {
    const rotation = state.rotor || 0;
    vehicleModel.rotor.rotation.y += rotation * 28 * deltaTime;
    vehicleModel.tailRotor.rotation.x += rotation * 60 * deltaTime;
    vehicleModel.disc.material.opacity = Math.min(0.18, Math.max(0, rotation - 0.4) * 0.35);
    for (const blade of vehicleModel.rotor.children) {
      if (blade.geometry.type === 'BoxGeometry') {
        blade.visible = rotation < 0.75;
      }
    }
  }
  if (vehicleModel.cargo) {
    const count = Math.ceil(
      ((state.cargo || 0) / (definition.cargo || 1)) * vehicleModel.cargo.children.length,
    );
    vehicleModel.cargo.children.forEach((color, index) => {
      color.visible = index < count;
    });
  }
}

const WRECK = standardMaterial(0x1c1a18, 1, 0);
export function wreckVehicle(vehicleModel) {
  vehicleModel.group.traverse((object) => {
    if (object.isMesh) {
      object.material = WRECK;
    }
  });
  vehicleModel.wrecked = true;
  if (vehicleModel.rotor) {
    vehicleModel.rotor.rotation.z = 0.3;
    for (const blade of vehicleModel.rotor.children) {
      blade.visible = true;
    }
    if (vehicleModel.disc) {
      vehicleModel.disc.visible = false;
    }
  }
}

export function setStructMaterials(metalness) {
  setStructModelMaterials(metalness);
}

export function buildStructure(type, positionX, positionY, positionZ, rotation, team) {
  const group = placeStructureModel(
    structureModel(type),
    positionX,
    positionY,
    positionZ,
    rotation,
  );
  group.userData.team = team;
  return group;
}

const GHOST_OK = new THREE.MeshBasicMaterial({
  color: 0x6fdc7a,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
const GHOST_BAD = new THREE.MeshBasicMaterial({
  color: 0xe0563f,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
export function buildGhost(type, rotation = 0) {
  const group = structureModel(type);
  const meshes = [];
  group.traverse((object) => {
    if (object.isMesh) {
      object.material = GHOST_OK;
      object.castShadow = false;
      object.receiveShadow = false;
      meshes.push(object);
    }
  });
  group.rotation.y = rotation * (Math.PI / 2);
  group.userData.meshes = meshes;
  return group;
}
export function setGhostOk(group, ok) {
  for (const mesh of group.userData.meshes) {
    mesh.material = ok ? GHOST_OK : GHOST_BAD;
  }
}
