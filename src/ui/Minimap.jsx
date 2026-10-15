import { useEffect, useRef } from 'react';

const TEAM_COLOR = ['#e8a64a', '#5b9cf0'];
const SMALL = 210;
const SMALL_SCALE = 3.2;

function drawMapImage(map, size) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(map.hx * 2 * size);
  canvas.height = Math.ceil(map.hz * 2 * size);
  const context = canvas.getContext('2d');
  const toPixelX = (positionX) => (positionX + map.hx) * size;
  const toPixelZ = (positionZ) => (positionZ + map.hz) * size;
  context.fillStyle = '#c9b48a';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const boxes = [...map.boxes].sort((left, right) =>
    left.floor === right.floor ? left.max[1] - right.max[1] : left.floor ? -1 : 1,
  );
  for (const box of boxes) {
    if (box.mat === 'roof') {
      continue;
    }
    if (box.floor) {
      context.fillStyle = `hsl(38, 32%, ${68 + Math.min(box.max[1], 3) * 6}%)`;
    } else if (box.max[1] >= 2.4) {
      context.fillStyle = '#3b352e';
    } else if (box.mat === 'crate') {
      context.fillStyle = '#7a5a33';
    } else if (box.mat === 'car' || box.mat === 'tire') {
      context.fillStyle = '#2a2a2a';
    } else {
      context.fillStyle = '#8b7b62';
    }
    context.fillRect(
      toPixelX(box.min[0]),
      toPixelZ(box.min[2]),
      (box.max[0] - box.min[0]) * size,
      (box.max[2] - box.min[2]) * size,
    );
  }
  context.fillStyle = 'rgba(30, 30, 50, 0.22)';
  for (const box of map.boxes) {
    if (box.mat === 'roof') {
      context.fillRect(
        toPixelX(box.min[0]),
        toPixelZ(box.min[2]),
        (box.max[0] - box.min[0]) * size,
        (box.max[2] - box.min[2]) * size,
      );
    }
  }
  context.fillStyle = '#a0612b';
  for (const door of map.doors) {
    context.fillRect(
      toPixelX(door.min[0]),
      toPixelZ(door.min[2]),
      Math.max(2, (door.max[0] - door.min[0]) * size),
      Math.max(2, (door.max[2] - door.min[2]) * size),
    );
  }
  const area = (zone, fill, stroke, label, font) => {
    const positionX = toPixelX(zone.x[0]);
    const positionZ = toPixelZ(zone.z[0]);
    const width = (zone.x[1] - zone.x[0]) * size;
    const height = (zone.z[1] - zone.z[0]) * size;
    context.fillStyle = fill;
    context.fillRect(positionX, positionZ, width, height);
    context.strokeStyle = stroke;
    context.lineWidth = Math.max(1.5, size * 0.35);
    context.setLineDash([size * 1.2, size * 0.8]);
    context.strokeRect(positionX, positionZ, width, height);
    context.setLineDash([]);
    context.font = `900 ${font}px Impact, Arial Black, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = Math.max(2, size * 0.5);
    context.strokeStyle = 'rgba(0,0,0,0.65)';
    context.strokeText(label, positionX + width / 2, positionZ + height / 2);
    context.fillStyle = stroke;
    context.fillText(label, positionX + width / 2, positionZ + height / 2);
  };
  if (map.spawn?.T) {
    area(map.spawn.T, 'rgba(232,166,74,0.25)', '#f0b25a', 'SPAWN TR', size * 2.6);
  }
  if (map.spawn?.CT) {
    area(map.spawn.CT, 'rgba(91,156,240,0.25)', '#7db4ff', 'SPAWN CT', size * 2.6);
  }
  for (const [name, zone] of Object.entries(map.sites || {})) {
    area(zone, 'rgba(220,50,40,0.22)', '#ff5a4e', name, size * 7);
  }
  return canvas;
}

function drawPlayer(context, positionX, positionY, yaw, color, isLocal, radius) {
  context.save();
  context.translate(positionX, positionY);
  context.rotate(-yaw);
  context.fillStyle = color;
  context.strokeStyle = isLocal ? '#fff' : 'rgba(0,0,0,0.8)';
  context.lineWidth = isLocal ? 2 : 1.5;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(-radius * 0.6, -radius * 0.8);
  context.lineTo(0, -radius * 1.9);
  context.lineTo(radius * 0.6, -radius * 0.8);
  context.closePath();
  context.fill();
  context.restore();
}

export default function Minimap({ engine, big }) {
  const ref = useRef(null);
  const bigRef = useRef(big);
  bigRef.current = big;

  useEffect(() => {
    let animationFrame = 0;
    let image = null;
    let imgMap = null;
    let imgS = 0;
    const frame = () => {
      animationFrame = requestAnimationFrame(frame);
      const canvas = ref.current;
      const radar = engine.radar();
      if (!canvas || !radar) {
        return;
      }
      const map = engine.map;
      const isBig = bigRef.current;
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      let width = SMALL;
      let height = SMALL;
      let size = SMALL_SCALE;
      if (isBig) {
        const fit = Math.min(
          (window.innerWidth * 0.8) / (map.hx * 2),
          (window.innerHeight * 0.84) / (map.hz * 2),
        );
        size = fit;
        width = map.hx * 2 * size;
        height = map.hz * 2 * size;
      }
      if (
        canvas.width !== Math.round(width * pixelRatio) ||
        canvas.height !== Math.round(height * pixelRatio)
      ) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const wantS = 8;
      if (imgMap !== map || imgS !== wantS) {
        image = drawMapImage(map, wantS);
        imgMap = map;
        imgS = wantS;
      }
      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const offsetX = isBig ? 0 : width / 2 - (radar.me.x + map.hx) * size;
      const offsetZ = isBig ? 0 : height / 2 - (radar.me.z + map.hz) * size;
      const toScreenX = (positionX) => offsetX + (positionX + map.hx) * size;
      const toScreenZ = (positionZ) => offsetZ + (positionZ + map.hz) * size;
      context.fillStyle = '#2a2520';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.drawImage(image, offsetX, offsetZ, map.hx * 2 * size, map.hz * 2 * size);
      const playerRadius = isBig ? Math.max(5, size * 0.9) : 5;
      const bomb = radar.bomb;
      const bombBox = (positionX, positionY, toScreenZ) => {
        context.fillStyle = bomb.planted
          ? Math.floor(performance.now() / 300) % 2
            ? '#ff2a1a'
            : '#ffd1cc'
          : '#f0b25a';
        context.strokeStyle = '#000';
        context.lineWidth = 1.5;
        context.fillRect(
          positionX - toScreenZ / 2,
          positionY - toScreenZ * 0.35,
          toScreenZ,
          toScreenZ * 0.7,
        );
        context.strokeRect(
          positionX - toScreenZ / 2,
          positionY - toScreenZ * 0.35,
          toScreenZ,
          toScreenZ * 0.7,
        );
      };
      if (bomb && (bomb.x ?? null) !== null) {
        bombBox(toScreenX(bomb.x), toScreenZ(bomb.z), isBig ? 14 : 10);
      }
      for (const player of radar.players) {
        const color = player.mate ? TEAM_COLOR[player.team] || '#fff' : '#ff3b30';
        drawPlayer(
          context,
          toScreenX(player.x),
          toScreenZ(player.z),
          player.yaw,
          color,
          false,
          player.mate ? playerRadius : playerRadius * 1.05,
        );
        if (bomb && bomb.carrier === player.i) {
          bombBox(
            toScreenX(player.x) + playerRadius + 4,
            toScreenZ(player.z) - playerRadius - 2,
            8,
          );
        }
      }
      if (radar.me.alive) {
        drawPlayer(
          context,
          toScreenX(radar.me.x),
          toScreenZ(radar.me.z),
          radar.me.yaw,
          radar.me.color,
          true,
          playerRadius + 1,
        );
      }
      if (radar.me.alive && bomb && bomb.carrier === radar.myId) {
        bombBox(
          toScreenX(radar.me.x) + playerRadius + 5,
          toScreenZ(radar.me.z) - playerRadius - 3,
          8,
        );
      }
    };
    animationFrame = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationFrame);
  }, [engine]);

  return (
    <div className={big ? 'bigmap' : 'minimap'}>
      <canvas ref={ref} />
      {big && <p className="bigmap-hint">{engine.map.name}</p>}
    </div>
  );
}
