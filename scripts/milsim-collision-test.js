import assert from 'node:assert/strict';
import { MAIN_BASES, SECTORS, TERRAIN, heightAt, waterDepth } from '../shared/milsim/terrain.js';
import { MAPDATA, selectMilMap, createWorld, rayWorld } from '../shared/milsim/world.js';
import { createVehicle, stepCar } from '../shared/milsim/vehicle.js';
import { createMilMoveState, stepMil } from '../shared/milsim/movement.js';
const rest = { fwd: 0, right: 0, yaw: 0, jump: false, crouch: false, prone: false };
let spotsChecked = 0;
let bridgesChecked = 0;
for (const id of ['kestrel', 'ironpass', 'kestrel']) {
  selectMilMap(id);
  const world = createWorld();
  assert.equal(MAPDATA.uses.filter((entry) => entry.use === 'arsenal').length, 4);
  assert.equal(MAPDATA.vtents.length, 6);
  assert.equal(MAPDATA.supplyTents.length, SECTORS.length);
  for (const base of MAIN_BASES) {
    const positionX = base.x;
    const positionZ = base.z;
    const positionY = heightAt(positionX, positionZ);
    const soldier = createMilMoveState(positionX, positionY + 5, positionZ);
    soldier.onGround = false;
    for (let step = 0; step < 240; step++) {
      stepMil(soldier, rest, 1 / 60, world);
    }
    assert.ok(
      Math.abs(soldier.y - heightAt(soldier.x, soldier.z)) < 0.03,
      `${id}: infantry failed to land`,
    );
    const hit = rayWorld(world, [positionX, positionY + 4, positionZ], [0, -1, 0], 8);
    assert.ok(hit && Math.abs(hit.t - 4) < 0.03, `${id}: terrain ray collision`);
  }
  for (const tent of MAPDATA.vtents.filter((vtent) => vtent.kind !== 'heli')) {
    for (const [positionX, positionZ, yaw] of tent.spots) {
      assert.equal(waterDepth(positionX, positionZ), 0, `${id}: vehicle spawn is underwater`);
      const vehicle = createVehicle(
        1,
        tent.kind === 'heavy' ? 'ifv' : 'truck',
        tent.team,
        positionX,
        positionZ,
        yaw,
      );
      vehicle.y += 5;
      vehicle.onGround = false;
      for (let step = 0; step < 240; step++) {
        stepCar(vehicle, { thr: 0, steer: 0, brake: true }, 1 / 60, world, []);
      }
      const gap = vehicle.y - heightAt(vehicle.x, vehicle.z);
      assert.ok(
        vehicle.onGround && Math.abs(gap) < 0.4,
        `${id} ${tent.kind}: floating vehicle, gap ${gap}`,
      );
      spotsChecked++;
    }
  }
  for (const bridge of MAPDATA.bridges) {
    const [positionX, positionZ] = bridge.pts[Math.floor(bridge.pts.length / 2)];
    const expected = bridge.deck + 0.02;
    const state = createMilMoveState(positionX, expected + 4, positionZ);
    state.onGround = false;
    for (let step = 0; step < 240; step++) {
      stepMil(state, rest, 1 / 60, world);
    }
    assert.ok(
      Math.abs(state.y - expected) < 0.03,
      `${id}: infantry bridge support ${state.y - expected}`,
    );
    const vehicle = createVehicle(2, 'jeep', 0, positionX, positionZ, 0);
    vehicle.y = expected + 4;
    vehicle.onGround = false;
    for (let step = 0; step < 240; step++) {
      stepCar(vehicle, { thr: 0, steer: 0, brake: true }, 1 / 60, world, []);
    }
    assert.ok(
      Math.abs(vehicle.y - expected) < 0.12,
      `${id}: vehicle bridge support ${vehicle.y - expected}`,
    );
    bridgesChecked++;
  }
  for (let innerIndex = 0; innerIndex < 513; innerIndex += 16) {
    for (let index = 0; index < 513; index += 16) {
      assert.ok(
        Math.abs(
          heightAt(-1024 + index * 4, -1024 + innerIndex * 4) - TERRAIN.H[innerIndex * 513 + index],
        ) < 0.00001,
      );
    }
  }
}
console.log(
  `OK: ${spotsChecked} vehicle spawn tests, ${bridgesChecked} bridge supports, infantry falls, raycasts, arsenals, tents, exact terrain vertices`,
);
