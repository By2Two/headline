export const COMP = {
  freezeMs: 5000,
  roundMs: 115000,
  bombMs: 40000,
  plantMs: 3200,
  defuseMs: 10000,
  endMs: 5000,
  halfRounds: 12,
  winRounds: 13,
  blastRadius: 22,
  blastDmg: 500,
  defuseRange: 1.8,
  pickRange: 1.3,
};

export function compWinner(score) {
  for (const index of [0, 1]) {
    if (score[index] >= COMP.winRounds && score[index] - score[1 - index] >= 2) {
      return index;
    }
  }
  return -1;
}

export function siteAt(map, positionX, positionZ) {
  for (const [name, site] of Object.entries(map.sites || {})) {
    if (
      positionX >= site.x[0] &&
      positionX <= site.x[1] &&
      positionZ >= site.z[0] &&
      positionZ <= site.z[1]
    ) {
      return name;
    }
  }
  return null;
}

export function nearSite(map, positionX, positionZ, maxD = Infinity) {
  let best = null;
  for (const [name, site] of Object.entries(map.sites || {})) {
    const deltaX = Math.max(site.x[0] - positionX, 0, positionX - site.x[1]);
    const deltaZ = Math.max(site.z[0] - positionZ, 0, positionZ - site.z[1]);
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= maxD && (!best || distance < best.d)) {
      best = { name, d: distance };
    }
  }
  return best;
}

export const siteCenter = (map, name) => {
  const site = map.sites[name];
  return [(site.x[0] + site.x[1]) / 2, (site.z[0] + site.z[1]) / 2];
};
