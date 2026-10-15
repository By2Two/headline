import { useEffect, useRef } from 'react';
import { mapCanvas, toPx } from '../../game/warfare/mapImage.js';
import { TEAM_COLORS, SQUAD_COLORS } from '../../../shared/warfare/config.js';
import { SECTORS } from '../../../shared/warfare/terrain.js';

const mapSize = 208;
const RANGE = 150;

export default function WarMinimap({ mil, size = mapSize, range = RANGE }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !mil?.me) {
      return;
    }
    const context = canvas.getContext('2d');
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== size * pixelRatio) {
      canvas.width = canvas.height = size * pixelRatio;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size, size);
    const self = mil.me;
    const yaw = self.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const ppm = size / (2 * range);
    const half = size / 2;
    context.save();
    context.beginPath();
    context.arc(half, half, half, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = '#1c211e';
    context.fillRect(0, 0, size, size);
    const image = mapCanvas();
    context.save();
    context.translate(half, half);
    context.rotate(yaw);
    const pixelsPerMeter = ppm / 0.5;
    context.scale(pixelsPerMeter, pixelsPerMeter);
    context.translate(-toPx(self.x), -toPx(self.z));
    context.imageSmoothingEnabled = true;
    context.drawImage(image, 0, 0);
    context.restore();
    context.fillStyle = 'rgba(13,15,14,0.18)';
    context.fillRect(0, 0, size, size);
    const at = (positionX, positionZ) => {
      const deltaX = (positionX - self.x) * ppm;
      const deltaZ = (positionZ - self.z) * ppm;
      return [half + deltaX * cos - deltaZ * sin, half + deltaX * sin + deltaZ * cos];
    };
    const edge = (pointX, pointY, pad = 10) => {
      const deltaX = pointX - half;
      const deltaY = pointY - half;
      const distance = Math.hypot(deltaX, deltaY);
      const radius = half - pad;
      return distance > radius
        ? [half + (deltaX / distance) * radius, half + (deltaY / distance) * radius, true]
        : [pointX, pointY, false];
    };
    const team = mil.team;
    for (const sector of SECTORS) {
      const [pointX, pointY, clamped] = edge(...at(sector.x, sector.z), 13);
      const sectorState = mil.sectors.find((positionX) => positionX.id === sector.id);
      const own = sectorState?.owner;
      context.fillStyle = own < 0 ? '#7d8580' : TEAM_COLORS[own];
      context.beginPath();
      context.arc(pointX, pointY, clamped ? 8 : 11, 0, Math.PI * 2);
      context.fill();
      if (
        sectorState &&
        own !== sectorState.capTeam &&
        sectorState.capTeam >= 0 &&
        sectorState.cap > 0
      ) {
        context.strokeStyle = TEAM_COLORS[sectorState.capTeam];
        context.lineWidth = 3;
        context.beginPath();
        context.arc(
          pointX,
          pointY,
          (clamped ? 8 : 11) + 2,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * sectorState.cap,
        );
        context.stroke();
      }
      context.fillStyle = '#0d0f0e';
      context.font = `800 ${clamped ? 11 : 14}px 'Barlow Condensed', sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(sector.id, pointX, pointY + 1);
      if (sectorState?.contested) {
        context.strokeStyle = '#fff';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(pointX, pointY, (clamped ? 8 : 11) + 5, 0, Math.PI * 2);
        context.stroke();
      }
    }
    for (const vehicle of mil.vehicles || []) {
      const [pointX, pointY] = at(vehicle.x, vehicle.z);
      if (Math.hypot(pointX - half, pointY - half) > half - 4) {
        continue;
      }
      context.fillStyle = vehicle.crew ? TEAM_COLORS[team] : 'rgba(236,233,223,0.75)';
      context.fillRect(pointX - 5, pointY - 5, 10, 10);
      context.fillStyle = '#0d0f0e';
      context.font = "700 9px 'Barlow Condensed', sans-serif";
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        vehicle.heli ? 'H' : vehicle.type === 'tank' ? 'T' : 'V',
        pointX,
        pointY + 1,
      );
    }
    for (const ally of mil.allies || []) {
      const [pointX, pointY] = at(ally.x, ally.z);
      if (Math.hypot(pointX - half, pointY - half) > half - 3) {
        continue;
      }
      context.save();
      context.translate(pointX, pointY);
      context.rotate(yaw - ally.yaw);
      context.fillStyle = ally.sq === mil.squad?.sq ? SQUAD_COLORS[ally.sq] : TEAM_COLORS[team];
      context.globalAlpha = ally.down ? 0.5 : 1;
      context.beginPath();
      context.moveTo(0, -5);
      context.lineTo(4, 4);
      context.lineTo(-4, 4);
      context.closePath();
      context.fill();
      context.restore();
    }
    for (const marker of mil.markers || []) {
      const [pointX, pointY, clamped] = edge(...at(marker.x, marker.z), 8);
      context.fillStyle = marker.type === 'enemy' ? '#e5483f' : '#f3c22c';
      context.save();
      context.translate(pointX, pointY);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
      void clamped;
    }
    for (const spot of mil.spots || []) {
      const [pointX, pointY] = at(spot.x, spot.z);
      if (Math.hypot(pointX - half, pointY - half) > half - 3) {
        continue;
      }
      context.fillStyle = '#e5483f';
      context.save();
      context.translate(pointX, pointY);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(half, half - 8);
    context.lineTo(half + 6, half + 7);
    context.lineTo(half, half + 3);
    context.lineTo(half - 6, half + 7);
    context.closePath();
    context.fill();
    context.restore();
    const northX = half + Math.sin(yaw) * (half - 9);
    const northY = half - Math.cos(yaw) * (half - 9);
    context.fillStyle = '#f3c22c';
    context.font = "800 13px 'Barlow Condensed', sans-serif";
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('N', northX, northY);
  });
  return (
    <canvas
      ref={ref}
      className="wf-minimap"
      style={{ width: size, height: size }}
      width={size}
      height={size}
    />
  );
}
