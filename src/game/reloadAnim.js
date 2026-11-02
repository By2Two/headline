// Shared by the first-person viewmodel and the third-person character rig.
// Progress runs 0..1 over the weapon's reload time:
// .08-.22 off-hand reaches, .22-.5 old mag pulled and dropped,
// .55-.8 new mag fetched and seated, .82-.96 slide/bolt cycled.
const ease = (value) => value * value * (3 - 2 * value);

export const seg = (progress, start, end) =>
  ease(Math.min(1, Math.max(0, (progress - start) / (end - start))));

export const pulse = (progress, start, end) =>
  Math.sin(Math.min(1, Math.max(0, (progress - start) / (end - start))) * Math.PI);

export const reachOf = (progress) => seg(progress, 0.08, 0.22) * (1 - seg(progress, 0.82, 0.95));

export function animateMagParts(gun, progress) {
  const pullDistance = gun.handTo ? 0.14 : 0.09;
  const dropDistance = 0.22;
  const out =
    progress < 0.55
      ? seg(progress, 0.22, 0.36) * pullDistance + seg(progress, 0.36, 0.5) * dropDistance
      : pullDistance +
        dropDistance -
        seg(progress, 0.55, 0.7) * dropDistance -
        seg(progress, 0.7, 0.8) * pullDistance;
  const away = progress > 0.5 && progress < 0.55;
  let direction = null;
  for (const mag of gun.mags ?? []) {
    mag.userData.home ??= mag.position.clone();
    direction = mag.userData.dir;
    mag.position.copy(mag.userData.home).addScaledVector(direction, out);
    mag.visible = !away;
  }
  const rack = pulse(progress, 0.86, 0.96);
  if (gun.boltHandle) {
    const lever = gun.boltHandle;
    lever.userData.home ??= lever.position.clone();
    lever.rotation.z = seg(progress, 0.82, 0.86) * (1 - seg(progress, 0.94, 0.98));
    lever.position.z = lever.userData.home.z + pulse(progress, 0.86, 0.94) * 0.06;
  }
  return { out, direction, rack };
}

export function resetMagParts(gun) {
  for (const mag of gun.mags ?? []) {
    if (mag.userData.home) {
      mag.position.copy(mag.userData.home);
    }
    mag.visible = true;
  }
  if (gun.boltHandle?.userData.home) {
    gun.boltHandle.rotation.z = 0;
    gun.boltHandle.position.copy(gun.boltHandle.userData.home);
  }
}
