import { TERRAIN } from '../../shared/warfare/terrain.js';

let nodes = [];
const graphs = new WeakMap();
function build() {
  if (graphs.has(TERRAIN)) {
    nodes = graphs.get(TERRAIN);
    return;
  }
  nodes = [];
  graphs.set(TERRAIN, nodes);
  const add = (positionX, positionZ) => {
    nodes.push({ x: positionX, z: positionZ, adj: [] });
    return nodes.length - 1;
  };
  const link = (from, to) => {
    const distance = Math.hypot(nodes[from].x - nodes[to].x, nodes[from].z - nodes[to].z);
    if (!nodes[from].adj.some(([neighborIndex]) => neighborIndex === to)) {
      nodes[from].adj.push([to, distance]);
    }
    if (!nodes[to].adj.some(([neighborIndex]) => neighborIndex === from)) {
      nodes[to].adj.push([from, distance]);
    }
  };
  const roadOf = [];
  for (const road of TERRAIN.roads) {
    let previous = -1;
    for (let ptIndex = 0; ptIndex < road.pts.length; ptIndex += 3) {
      const [positionX, positionZ] = road.pts[ptIndex];
      const pointNode = add(positionX, positionZ);
      roadOf[pointNode] = road;
      if (previous >= 0) {
        link(previous, pointNode);
      }
      previous = pointNode;
    }
    const [lastX, lastZ] = road.pts[road.pts.length - 1];
    const currentPointNode = add(lastX, lastZ);
    roadOf[currentPointNode] = road;
    if (previous >= 0) {
      link(previous, currentPointNode);
    }
  }
  const ends = [];
  for (let pointNode = 0; pointNode < nodes.length; pointNode++) {
    if (nodes[pointNode].adj.length <= 1) {
      ends.push(pointNode);
    }
  }
  for (const end of ends) {
    let best = -1;
    let bestDistance = 70;
    for (let innerIndex = 0; innerIndex < nodes.length; innerIndex++) {
      if (roadOf[innerIndex] === roadOf[end]) {
        continue;
      }
      const distance = Math.hypot(
        nodes[end].x - nodes[innerIndex].x,
        nodes[end].z - nodes[innerIndex].z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = innerIndex;
      }
    }
    if (best >= 0) {
      link(end, best);
    }
  }
  for (let from = 0; from < nodes.length; from++) {
    for (let nodeIndex = from + 1; nodeIndex < nodes.length; nodeIndex++) {
      if (roadOf[from] === roadOf[nodeIndex]) {
        continue;
      }
      if (Math.hypot(nodes[from].x - nodes[nodeIndex].x, nodes[from].z - nodes[nodeIndex].z) < 16) {
        link(from, nodeIndex);
      }
    }
  }
}

export function nearestNode(positionX, positionZ) {
  build();
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < nodes.length; index++) {
    const distance = (nodes[index].x - positionX) ** 2 + (nodes[index].z - positionZ) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export function roadPath(startX, startZ, endX, endZ) {
  const startNode = nearestNode(startX, startZ);
  const goalNode = nearestNode(endX, endZ);
  const distance = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const done = new Uint8Array(nodes.length);
  distance[startNode] = 0;
  const open = [startNode];
  const heuristic = (index) =>
    Math.hypot(nodes[index].x - nodes[goalNode].x, nodes[index].z - nodes[goalNode].z);
  while (open.length) {
    let bestIndex = 0;
    for (let openIndex = 1; openIndex < open.length; openIndex++) {
      if (
        distance[open[openIndex]] + heuristic(open[openIndex]) <
        distance[open[bestIndex]] + heuristic(open[bestIndex])
      ) {
        bestIndex = openIndex;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === goalNode) {
      break;
    }
    if (done[current]) {
      continue;
    }
    done[current] = 1;
    for (const [adj, currentAdj] of nodes[current].adj) {
      if (distance[current] + currentAdj < distance[adj]) {
        distance[adj] = distance[current] + currentAdj;
        previous[adj] = current;
        open.push(adj);
      }
    }
  }
  const path = [];
  for (let index = goalNode; index >= 0; index = previous[index]) {
    path.push([nodes[index].x, nodes[index].z]);
    if (index === startNode) {
      break;
    }
  }
  path.reverse();
  path.push([endX, endZ]);
  return path;
}
