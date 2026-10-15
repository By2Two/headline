function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pelletDirs(direction, seed, count, spread) {
  const random = mulberry32(seed);
  const upVector = Math.abs(direction[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  let rotationX = direction[1] * upVector[2] - direction[2] * upVector[1];
  let rotationY = direction[2] * upVector[0] - direction[0] * upVector[2];
  let rotationZ = direction[0] * upVector[1] - direction[1] * upVector[0];
  const distance = Math.hypot(rotationX, rotationY, rotationZ);
  rotationX /= distance;
  rotationY /= distance;
  rotationZ /= distance;
  const sideX = rotationY * direction[2] - rotationZ * direction[1];
  const sideY = rotationZ * direction[0] - rotationX * direction[2];
  const sideZ = rotationX * direction[1] - rotationY * direction[0];
  const out = [];
  const tan = Math.tan(spread);
  for (let index = 0; index < count; index++) {
    const radius = index === 0 ? 0 : (0.25 + 0.75 * Math.sqrt(random())) * tan;
    const state = random() * Math.PI * 2;
    const positionX =
      direction[0] + (rotationX * Math.cos(state) + sideX * Math.sin(state)) * radius;
    const positionY =
      direction[1] + (rotationY * Math.cos(state) + sideY * Math.sin(state)) * radius;
    const positionZ =
      direction[2] + (rotationZ * Math.cos(state) + sideZ * Math.sin(state)) * radius;
    const distance = Math.hypot(positionX, positionY, positionZ);
    out.push([positionX / distance, positionY / distance, positionZ / distance]);
  }
  return out;
}
