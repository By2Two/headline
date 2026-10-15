import { useEffect, useMemo, useRef, useState } from 'react';
import { mapCanvas, toPx, MAP_PX } from '../../game/milsim/mapImage.js';
import {
  CAPTURE_CHAIN,
  SECTORS,
  MAIN_BASES,
  SUPPLY_POINTS,
  HALF,
  gridRef,
} from '../../../shared/milsim/terrain.js';
import { TEAM_COLORS, bearingOf, SQUAD_COLORS } from '../../../shared/milsim/config.js';

const fromPx = (pixels) => (pixels / MAP_PX) * HALF * 2 - HALF;

const MARK = {
  move: ['#58c26a', '>'],
  attack: ['#ff7a3a', 'A'],
  defend: ['#4a9be8', 'D'],
  observe: ['#9fe0e8', 'O'],
  enemy: ['#e8463a', '!'],
  vehicle: ['#c48cff', 'V'],
  fob: ['#8fd05a', 'F'],
  supply: ['#d8b25a', 'S'],
  mortar: ['#ff4ad0', 'M'],
};

export default function MilMap({
  mil,
  spawns = null,
  picked = null,
  onPick = null,
  compact = false,
  onMark = null,
}) {
  const [url, setUrl] = useState(null);
  const [markType, setMarkType] = useState('enemy');
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const drag = useRef(null);
  const clampView = (pixels) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) {
      return pixels;
    }
    const size = (Math.min(rect.width, rect.height) / MAP_PX) * pixels.k * MAP_PX;
    const centeredOffset = (lim, position) =>
      size <= lim ? (lim - size) / 2 : Math.min(0, Math.max(lim - size, position));
    return {
      k: pixels.k,
      x: centeredOffset(rect.width, pixels.x),
      y: centeredOffset(rect.height, pixels.y),
    };
  };
  useEffect(() => {
    const id = setTimeout(() => setUrl(mapCanvas().toDataURL('image/png')), 10);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!mil?.me || !box.current) {
      return;
    }
    const rect = box.current.getBoundingClientRect();
    const zoom = compact ? 0.8 : 1.4;
    const scale = (Math.min(rect.width, rect.height) / MAP_PX) * zoom;
    setView(
      clampView({
        k: zoom,
        x: rect.width / 2 - toPx(mil.me.x) * scale,
        y: rect.height / 2 - toPx(mil.me.z) * scale,
      }),
    );
  }, [url]);

  const scale = () => {
    const rect = box.current?.getBoundingClientRect();
    return rect ? (Math.min(rect.width, rect.height) / MAP_PX) * view.k : 1;
  };
  const onWheel = (event) => {
    const rect = box.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const newZoom = Math.max(0.6, Math.min(8, view.k * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const factor = newZoom / view.k;
    setView(
      clampView({
        k: newZoom,
        x: mouseX - (mouseX - view.x) * factor,
        y: mouseY - (mouseY - view.y) * factor,
      }),
    );
  };
  const onDown = (event) => {
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (event) => {
    const rect = box.current.getBoundingClientRect();
    const currentScale = scale();
    const worldX = fromPx((event.clientX - rect.left - view.x) / currentScale);
    const worldZ = fromPx((event.clientY - rect.top - view.y) / currentScale);
    setHover({ x: worldX, z: worldZ, sx: event.clientX - rect.left, sy: event.clientY - rect.top });
    if (!drag.current) {
      return;
    }
    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 3) {
      drag.current.moved = true;
    }
    const currentDrag = drag.current;
    setView((pixels) =>
      clampView({ ...pixels, x: currentDrag.vx + deltaX, y: currentDrag.vy + deltaY }),
    );
  };
  const onUp = () => {
    drag.current = null;
  };

  const team = mil?.team ?? 0;
  const activeScale = scale();
  const toScreen = (positionX, positionZ) => [
    toPx(positionX) * activeScale + view.x,
    toPx(positionZ) * activeScale + view.y,
  ];
  const toScreenRadius = (meters) => (meters / (HALF * 2)) * MAP_PX * activeScale;
  const info = useMemo(() => {
    if (!hover || !mil?.me) {
      return null;
    }
    const deltaX = hover.x - mil.me.x;
    const deltaZ = hover.z - mil.me.z;
    return {
      grid: gridRef(hover.x, hover.z),
      dist: Math.round(Math.hypot(deltaX, deltaZ)),
      brg: Math.round(bearingOf(Math.atan2(-deltaX, -deltaZ))),
    };
  }, [hover, mil?.me?.x, mil?.me?.z]);

  return (
    <div
      ref={box}
      className={`milmap ${compact ? 'compact' : ''}`}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => {
        onUp();
        setHover(null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!onMark || !box.current) {
          return;
        }
        const rect = box.current.getBoundingClientRect();
        const currentScale = scale();
        onMark(
          markType,
          fromPx((event.clientX - rect.left - view.x) / currentScale),
          fromPx((event.clientY - rect.top - view.y) / currentScale),
        );
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${activeScale})` }}
        />
      ) : (
        <div className="milmap-loading">Drawing map…</div>
      )}
      <svg className="milmap-over">
        {CAPTURE_CHAIN?.slice(1).map((id, index) => {
          const entry = SECTORS.find((scale) => scale.id === CAPTURE_CHAIN[index]);
          const base = SECTORS.find((scale) => scale.id === id);
          const [startX, startY] = toScreen(entry.x, entry.z);
          const [endX, endY] = toScreen(base.x, base.z);
          return (
            <line
              key={id}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="#f4df9e"
              strokeOpacity="0.65"
              strokeWidth="3"
              strokeDasharray="7 5"
            />
          );
        })}
        {MAIN_BASES.map((base) => {
          const [positionX, positionY] = toScreen(base.x, base.z);
          return (
            <g key={base.team}>
              <rect
                x={positionX - 9}
                y={positionY - 9}
                width={18}
                height={18}
                fill={TEAM_COLORS[base.team]}
                stroke="#111"
                strokeWidth="2"
              />
              <text x={positionX} y={positionY + 24} className="ml-lbl">
                {base.team === team ? 'MAIN BASE' : 'ENEMY BASE'}
              </text>
            </g>
          );
        })}
        {SECTORS.map((sector, index) => {
          const sectorState = mil?.sectors?.[index] || { owner: -1 };
          const [positionX, positionY] = toScreen(sector.x, sector.z);
          const color = sectorState.owner >= 0 ? TEAM_COLORS[sectorState.owner] : '#d8d8d8';
          return (
            <g key={sector.id} className={sectorState.contested ? 'blink' : ''}>
              <circle
                cx={positionX}
                cy={positionY}
                r={toScreenRadius(sector.r)}
                fill={color}
                fillOpacity="0.18"
                stroke={color}
                strokeWidth="2"
                strokeDasharray={sectorState.owner < 0 ? '5 4' : ''}
              />
              <circle
                cx={positionX}
                cy={positionY}
                r={12}
                fill={color}
                stroke="#111"
                strokeWidth="2"
              />
              <text x={positionX} y={positionY + 5} className="ml-sec">
                {sector.id}
              </text>
              <text x={positionX} y={positionY + 28} className="ml-lbl">
                {sector.name}
                {sectorState.locked ? ' · locked' : ''}
              </text>
            </g>
          );
        })}
        {SUPPLY_POINTS.map((supplyPoint) => {
          const [positionX, positionY] = toScreen(supplyPoint.x, supplyPoint.z);
          return (
            <g key={supplyPoint.id}>
              <rect
                x={positionX - 7}
                y={positionY - 7}
                width={14}
                height={14}
                fill="#c9a24a"
                stroke="#2a2010"
                strokeWidth="2"
                transform={`rotate(45 ${positionX} ${positionY})`}
              />
              <text x={positionX} y={positionY + 22} className="ml-lbl small">
                {supplyPoint.name}{' '}
                {(mil?.points?.[supplyPoint.id] ?? null) !== null
                  ? `· ${mil.points[supplyPoint.id]}`
                  : ''}
              </text>
            </g>
          );
        })}
        {(mil?.fobs || []).map((fob) => {
          const [positionX, positionY] = toScreen(fob[2], fob[3]);
          return (
            <g key={fob[0]}>
              <polygon
                points={`${positionX},${positionY - 10} ${positionX + 9},${positionY + 7} ${positionX - 9},${positionY + 7}`}
                fill={TEAM_COLORS[team]}
                stroke="#111"
                strokeWidth="2"
              />
              <text x={positionX} y={positionY + 22} className="ml-lbl small">
                FOB {fob[1]} · {fob[4]}
              </text>
            </g>
          );
        })}
        {spawns &&
          spawns.map((supplyPoint) => {
            const [positionX, positionY] = toScreen(supplyPoint.x, supplyPoint.z);
            const on = picked === supplyPoint.id;
            return (
              <g
                key={supplyPoint.id}
                className={`ml-spawn ${supplyPoint.ok ? '' : 'off'} ${on ? 'on' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!drag.current?.moved && supplyPoint.ok) {
                    onPick?.(supplyPoint.id);
                  }
                }}
              >
                <circle cx={positionX} cy={positionY} r={on ? 19 : 16} />
                <text x={positionX} y={positionY - 24} className="ml-lbl">
                  {supplyPoint.ok ? 'SPAWN' : supplyPoint.why}
                </text>
              </g>
            );
          })}
        {(mil?.allies || []).map((entry) => {
          const [positionX, positionY] = toScreen(entry.x, entry.z);
          const degrees = (bearingOf(entry.yaw) * 1) | 0;
          return (
            <g key={entry.i} transform={`translate(${positionX} ${positionY})`} className="ml-ally">
              {entry.down ? (
                <circle r={5} fill="#ff4a3a" stroke="#111" strokeWidth="1.5" />
              ) : (
                <polygon
                  points={entry.sq === mil.squad?.sq ? '0,-9 7,7 0,3 -7,7' : '0,-6 4,4 0,2 -4,4'}
                  transform={`rotate(${degrees})`}
                  fill={entry.sq === mil.squad?.sq ? SQUAD_COLORS[entry.sq] : TEAM_COLORS[team]}
                  stroke="#111"
                  strokeWidth="1.5"
                />
              )}
              {view.k > 1.6 && (
                <text y={-10} className="ml-lbl small">
                  {entry.n}
                  {entry.down ? ' (down)' : ''}
                </text>
              )}
            </g>
          );
        })}
        {(mil?.markers || []).map(([zoom, markerX, markerZ, markedBy, sqn], index) => {
          const [positionX, positionY] = toScreen(markerX, markerZ);
          const [color, symbol] = MARK[zoom] || MARK.move;
          return (
            <g key={index} transform={`translate(${positionX} ${positionY})`} className="ml-mark">
              <polygon points="0,-12 9,0 0,12 -9,0" fill={color} stroke="#111" strokeWidth="1.5" />
              <text y={4} className="ml-mark-t">
                {symbol}
              </text>
              {view.k > 1.3 && (
                <text y={24} className="ml-lbl small">
                  {zoom}
                  {sqn ? ` (${sqn})` : ''} · {markedBy}
                </text>
              )}
            </g>
          );
        })}
        {mil?.me &&
          (() => {
            const [positionX, positionY] = toScreen(mil.me.x, mil.me.z);
            const entry = (bearingOf(mil.me.yaw) * Math.PI) / 180;
            return (
              <g
                transform={`translate(${positionX} ${positionY}) rotate(${(entry * 180) / Math.PI})`}
              >
                <polygon points="0,-11 7,8 0,4 -7,8" fill="#ffe46a" stroke="#111" strokeWidth="2" />
              </g>
            );
          })()}
      </svg>
      {hover && info && (
        <div className="milmap-tip" style={{ left: hover.sx + 14, top: hover.sy + 14 }}>
          <b>{info.grid}</b>
          <span>
            {info.dist} m · {String(info.brg).padStart(3, '0')}°
          </span>
        </div>
      )}
      {onMark && (
        <div className="milmap-marks" onPointerDown={(event) => event.stopPropagation()}>
          {Object.keys(MARK).map((zoom) => (
            <button
              key={zoom}
              type="button"
              className={markType === zoom ? 'on' : ''}
              style={{ borderColor: MARK[zoom][0] }}
              onClick={() => setMarkType(zoom)}
            >
              {zoom}
            </button>
          ))}
          <button type="button" onClick={() => onMark('clear')}>
            clear mine
          </button>
          <span className="mm-note">
            {mil?.squad?.lead
              ? 'Orders go to your squad, intel to the team'
              : 'Only your squad leader gives orders. You can mark enemies.'}
          </span>
        </div>
      )}
      {!compact && (
        <div className="milmap-legend">
          <span>
            <i className="lg-sec" /> Sector
          </span>
          <span>
            <i className="lg-sp" /> Supply point
          </span>
          <span>
            <i className="lg-fob" /> FOB
          </span>
          <span>
            <i className="lg-me" /> You
          </span>
          <em>
            Wheel: zoom · Drag: move · Grid: 100 m{onMark ? ' · Right click: place marker' : ''}
          </em>
        </div>
      )}
    </div>
  );
}
