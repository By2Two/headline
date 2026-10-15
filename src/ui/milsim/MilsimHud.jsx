import { useEffect, useRef, useState } from 'react';
import {
  COMPASS,
  TEAM_NAMES,
  TEAM_COLORS,
  MIL,
  VEHICLES,
  VEH_CATS,
  CLASSES,
  CLASS_IDS,
  SQUADS,
  SQUAD_COLORS,
  SQUAD_SIZE,
  RANKS,
  VEH_RANK,
} from '../../../shared/milsim/config.js';
import { MW } from '../../../shared/milsim/weapons.js';
import { MAPDATA } from '../../../shared/milsim/world.js';
import MilMap from './MilMap.jsx';
import Arsenal from './Arsenal.jsx';
import './milsim.css';

const pad = (value, digits = 3) => String(Math.round(value)).padStart(digits, '0');
const mmss = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const weaponName = (id) =>
  MW.find((weapon) => weapon.id === id)?.name ||
  {
    mortar: 'Mortar',
    vehicle: 'Vehicle',
    crash: 'Crash',
    fall: 'Fall',
    wire: 'Barbed wire',
    respawn: 'Respawn',
    bleed: 'Bled out',
    rpg: 'RPG-7',
  }[id] ||
  id;

function Compass({ bearing, clock }) {
  const width = 520;
  const span = 120;
  const ticks = [];
  const start = Math.floor((bearing - span / 2) / 5) * 5;
  for (let bearingDegrees = start; bearingDegrees <= bearing + span / 2; bearingDegrees += 5) {
    const degrees = ((bearingDegrees % 360) + 360) % 360;
    const positionX = ((bearingDegrees - bearing) / span) * width + width / 2;
    const card = degrees % 45 === 0;
    const big = degrees % 15 === 0;
    ticks.push(
      <g key={bearingDegrees} transform={`translate(${positionX} 0)`}>
        <line y1={card ? 4 : big ? 8 : 12} y2={20} className={card ? 'card' : ''} />
        {card ? (
          <text y={36} className="card">
            {COMPASS[degrees / 45]}
          </text>
        ) : big ? (
          <text y={34}>{degrees}</text>
        ) : null}
      </g>,
    );
  }
  return (
    <div className="mcompass">
      <svg width={width} height={40} viewBox={`0 0 ${width} 40`}>
        {ticks}
        <polygon
          points={`${width / 2 - 6},0 ${width / 2 + 6},0 ${width / 2},7`}
          className="needle"
        />
      </svg>
      <b>{pad(bearing)}°</b>
      {clock && <small className="mclock">{clock}</small>}
    </div>
  );
}

function Sectors({ mil }) {
  const totals = mil.total;
  return (
    <div className="msectors">
      <div className="msec-row">
        {mil.sectors.map((seconds) => {
          const color = seconds.owner >= 0 ? TEAM_COLORS[seconds.owner] : '#3a3f44';
          const capCol = seconds.capTeam >= 0 ? TEAM_COLORS[seconds.capTeam] : '#888';
          return (
            <div
              key={seconds.id}
              className={`msec ${seconds.contested ? 'contested' : ''} ${seconds.owner === mil.team ? 'mine' : seconds.owner >= 0 ? 'theirs' : ''} ${seconds.locked ? 'locked' : ''}`}
              title={`${seconds.name}${seconds.locked ? ' (locked)' : ''}`}
            >
              <b style={{ background: color }}>{seconds.id}</b>
              <i>
                <u
                  style={{
                    width: `${Math.round(seconds.cap * 100)}%`,
                    background: seconds.owner >= 0 ? color : capCol,
                  }}
                />
              </i>
            </div>
          );
        })}
      </div>
      {totals && (
        <div
          className={`mtotal ${totals.team === mil.team ? 'good' : 'bad'} ${totals.paused ? 'paused' : ''}`}
        >
          <small>
            {totals.team === mil.team
              ? 'Total control · Hold every sector'
              : 'Enemy total control · Retake a sector'}
          </small>
          <b>
            {totals.paused ? 'Paused · ' : ''}
            {mmss(totals.left)}
          </b>
        </div>
      )}
    </div>
  );
}

function Here({ mil }) {
  const here = mil.here;
  const area = mil.area;
  if (!here && !area) {
    return null;
  }
  return (
    <div className="mhere">
      {here && (
        <div className="mhere-sec">
          <small>OBJECTIVE {here.id}</small>
          <b>{here.name}</b>
          <span style={{ color: here.owner >= 0 ? TEAM_COLORS[here.owner] : '#cfcfcf' }}>
            {here.locked
              ? 'LOCKED · Capture the previous sector'
              : here.contested
                ? 'CONTESTED'
                : here.n?.[mil.team] > 0 && here.owner !== mil.team
                  ? here.owner >= 0
                    ? 'NEUTRALIZING'
                    : 'CAPTURING'
                  : here.owner === mil.team
                    ? here.cap < 1
                      ? 'FRIENDLY · UNDER ATTACK'
                      : 'FRIENDLY'
                    : here.owner >= 0
                      ? 'ENEMY'
                      : 'NEUTRAL'}
          </span>
          <div className="mbar">
            <i
              style={{
                width: `${Math.round(here.cap * 100)}%`,
                background:
                  here.owner >= 0
                    ? TEAM_COLORS[here.owner]
                    : here.capTeam >= 0
                      ? TEAM_COLORS[here.capTeam]
                      : '#999',
              }}
            />
          </div>
          <em>{Math.round(here.cap * 100)}%</em>
          <small>
            Friendly {here.n?.[mil.team] || 0} · Enemy{' '}
            {here.contested ? here.n?.[1 - mil.team] || 0 : '?'}
          </small>
        </div>
      )}
      {area && (
        <div className="mhere-sup">
          <small>{area.kind === 'main' ? area.name : 'Supply'}</small>
          <b className={area.kind !== 'main' && area.store < MIL.spawnCost ? 'warn' : ''}>
            {Math.round(area.store)} / {area.max}
          </b>
          <span className={area.kind === 'main' || area.store >= MIL.spawnCost ? 'ok' : 'warn'}>
            {area.kind === 'main'
              ? 'Spawn always active'
              : area.store >= MIL.spawnCost
                ? 'Spawn active'
                : 'Spawn inactive · no supply'}
          </span>
        </div>
      )}
    </div>
  );
}

function StanceIcon({ stance }) {
  return (
    <svg viewBox="0 0 40 40" className={`mstance-ic ${stance}`}>
      {stance === 'prone' ? (
        <path d="M6 30a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm4-5h18l6 2v3l-6-1H10z" />
      ) : stance === 'crouch' ? (
        <path d="M20 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-3 2h6l1 9-2 1 3 9h-3l-3-7-3 7h-3l3-10z" />
      ) : (
        <path d="M20 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-4 2h8l1 13h-2l-1 16h-2.5L19 26l-.5 13H16l-1-16h-2z" />
      )}
    </svg>
  );
}

function Vitals({ hud, mil }) {
  const stamina = mil.stamina;
  return (
    <div className="mvitals">
      {mil.rank && (
        <div
          className="mrank"
          title={
            mil.rank.next
              ? `${mil.rank.xp} / ${mil.rank.next} points to ${RANKS[mil.rank.i + 1].name}`
              : `${mil.rank.xp} points`
          }
        >
          <b>{mil.rank.short}</b>
          <span>{mil.rank.name}</span>
          <i>
            <em style={{ width: `${Math.round(mil.rank.prog * 100)}%` }} />
          </i>
        </div>
      )}
      <div className="mstance">
        <StanceIcon stance={mil.stance} />
        <div>
          <b>
            {mil.stance === 'prone'
              ? 'Prone'
              : mil.stance === 'crouch'
                ? 'Crouched'
                : mil.sprint
                  ? 'Sprinting'
                  : 'Standing'}
          </b>
          <span>
            {mil.cls} · {mil.kg} kg{mil.lean ? ` · lean ${mil.lean > 0 ? 'R' : 'L'}` : ''}
            {mil.free ? ' · free look' : ''}
          </span>
        </div>
      </div>
      <div className={`mstam ${stamina < 0.25 ? 'low' : ''}`}>
        <i style={{ width: `${Math.round(stamina * 100)}%` }} />
      </div>
      {mil.breath < 0.98 && (
        <div className="mbreath">
          <i style={{ width: `${Math.round(mil.breath * 100)}%` }} />
        </div>
      )}
      <div className={`mhp ${hud.hp <= 30 ? 'low' : ''}`}>
        <i style={{ width: `${hud.hp}%` }} />
      </div>
      <div className="mtags">
        {mil.med?.bleed > 0 && (
          <span className="med bleed">
            BLEEDING{['', ' · LIGHT', ' · MODERATE', ' · HEAVY'][mil.med.bleed]}
          </span>
        )}
        {hud.hp < 25 ? (
          <span className="med crit">CRITICAL</span>
        ) : hud.hp < 60 ? (
          <span className="med">WOUNDED</span>
        ) : null}
        {mil.med?.arms > 0.15 && <span className="med">ARM</span>}
        {mil.med?.legs > 0.15 && <span className="med">LEG</span>}
        {mil.med?.dragging && <span>DRAGGING</span>}
        {mil.light && <span>LIGHT</span>}
        {mil.nvg && <span>NVG</span>}
      </div>
    </div>
  );
}

function Ammo({ hud, mil }) {
  const weapon = mil.weapon;
  if (mil.veh) {
    return null;
  }
  return (
    <div className="mammo">
      <small>{weapon.name}</small>
      {!weapon.melee && !weapon.grenade && !weapon.item && (
        <>
          <div className="mammo-count">
            <b className={weapon.mag === 0 ? 'empty' : ''}>{weapon.mag}</b>
            <span>
              / {weapon.magSize} {weapon.ammo}
            </span>
          </div>
          <div className="mammo-mags" title="Spare magazines">
            {weapon.spare.map(([count, size, ammo], index) => (
              <i
                key={index}
                className={count === size ? 'full' : 'part'}
                title={`${count}/${size} ${ammo}`}
              >
                <u style={{ height: `${Math.round((count / size) * 100)}%` }} />
                <em>{ammo}</em>
              </i>
            ))}
            {!weapon.spare.length && <em className="warn">no spare mags</em>}
          </div>
          <div className="mammo-tags">
            <span>{weapon.mode}</span>
            {weapon.zero && <span>ZERO {weapon.zero} m</span>}
            <span>{weapon.optic}</span>
            {weapon.zoom && <span>{weapon.zoom}x</span>}
            <span className={mil.wstate === 'LOW' ? 'dim' : ''}>{mil.wstate}</span>
            {mil.rested && <span>RESTED</span>}
          </div>
        </>
      )}
      {(weapon.grenade || weapon.item) && (
        <div className="mammo-count">
          <b>{weapon.count}</b>
          <span>{weapon.item ? 'hold fire to use' : 'left: throw · right: lob'}</span>
        </div>
      )}
      {hud.reloading && (
        <div className="reload">
          <i style={{ width: `${Math.round(hud.reloadP * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function QuickBar({ mil }) {
  return (
    <div className="mquick">
      {mil.quick.map((squad, index) =>
        squad ? (
          <div key={index} className={squad.on ? 'on' : ''}>
            <kbd>{squad.k}</kbd>
            <span>{squad.name}</span>
            {(squad.count ?? null) !== null && <em>{squad.count}</em>}
          </div>
        ) : null,
      )}
    </div>
  );
}

function VehHud({ v: vehicle }) {
  return (
    <div className="mveh">
      <small>
        {vehicle.name} ·{' '}
        {vehicle.role
          ? vehicle.role[0].toUpperCase() + vehicle.role.slice(1)
          : `Seat ${vehicle.seat + 1}`}{' '}
        · {vehicle.tp ? '3rd person' : '1st person'}
      </small>
      <div className="mveh-main">
        <b>{vehicle.speed}</b>
        <span>km/h</span>
        {vehicle.kind === 'car' && vehicle.driver && (
          <strong className={vehicle.gear < 0 ? 'rev' : ''}>
            {vehicle.gear < 0 ? 'R' : vehicle.gear}
          </strong>
        )}
        {vehicle.boost && vehicle.kind === 'car' && vehicle.driver && (
          <em className="boost">FULL</em>
        )}
      </div>
      <div className="mbar hp">
        <i style={{ width: `${Math.round((vehicle.hp / vehicle.maxHp) * 100)}%` }} />
      </div>
      {vehicle.comp && (
        <div className="mveh-comp">
          {(vehicle.kind === 'heli'
            ? [
                ['ENGINE', 'engine'],
                ['ROTOR', 'rotor'],
                ['TAIL', 'tail'],
              ]
            : [
                ['ENGINE', 'engine'],
                [vehicle.tracks ? 'TRACKS' : 'WHEELS', 'wheels'],
              ]
          ).map(([label, key]) => {
            const positionX = vehicle.comp[key] ?? 1;
            return (
              <span key={key} className={positionX <= 0 ? 'crit' : positionX < 0.5 ? 'warn' : ''}>
                {label}
              </span>
            );
          })}
          <span
            className={
              vehicle.hp / vehicle.maxHp < 0.25
                ? 'crit'
                : vehicle.hp / vehicle.maxHp < 0.6
                  ? 'warn'
                  : ''
            }
          >
            HULL
          </span>
          {vehicle.flipped && <span className="crit">ROLLED OVER</span>}
        </div>
      )}
      {vehicle.kind === 'heli' && (
        <div className="mveh-heli">
          <span>
            ALT <b>{vehicle.alt} m</b>
          </span>
          <span>
            V/S{' '}
            <b>
              {vehicle.vs > 0 ? '+' : ''}
              {vehicle.vs}
            </b>
          </span>
          <span>
            COLL <b>{vehicle.coll}%</b>
          </span>
          <span>
            ROTOR <b>{vehicle.rotor}%</b>
          </span>
        </div>
      )}
      {(vehicle.cargo ?? null) !== null && (
        <div className="mveh-cargo">
          <small>
            Supply carried{' '}
            {vehicle.loading === 1 ? '· loading…' : vehicle.loading === 2 ? '· unloading…' : ''}
          </small>
          <b>
            {vehicle.cargo} / {vehicle.cargoMax}
          </b>
          <div className="mbar">
            <i
              style={{
                width: `${Math.round((vehicle.cargo / vehicle.cargoMax) * 100)}%`,
                background: '#c9a24a',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function KeyHints({ keys }) {
  return (
    <ul className="mkeys">
      {keys.map(([combo, label]) => (
        <li key={label}>
          <span>
            {combo.map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
          </span>
          <em>{label}</em>
        </li>
      ))}
    </ul>
  );
}

function BuildPanel({ b: build }) {
  return (
    <div className="mbuild">
      <h4>Build</h4>
      <p className={build.area ? '' : 'warn'}>
        {build.area
          ? `${build.area.name} · supply ${Math.round(build.area.store)}`
          : 'Outside a friendly sector or FOB'}
      </p>
      <ul className="mbuild-list">
        {build.list.map((seconds, index) => (
          <li key={seconds.id} className={index === build.idx ? 'on' : ''}>
            {index < 9 ? <kbd>{index + 1}</kbd> : <span />}
            <span>{seconds.name}</span>
            <em>{seconds.cost}</em>
          </li>
        ))}
      </ul>
      <p className="mbuild-desc">{build.list[build.idx].desc}</p>
      {!build.ok && build.why && <p className="warn">{build.why}</p>}
      <KeyHints
        keys={[
          [['LMB'], 'Place'],
          [['Wheel'], 'Choose'],
          [['R'], 'Rotate'],
          [['Shift', 'R'], 'Rotate back'],
          [['Del'], 'Dismantle'],
          [['G'], 'Exit'],
        ]}
      />
    </div>
  );
}

function MortarPanel({ m: mortar }) {
  const sol = mortar.sol;
  const azOk = sol && Math.abs(((mortar.az - sol.bearing + 540) % 360) - 180) < 0.6;
  const elOk = sol && (sol.el ?? null) !== null && Math.abs(mortar.el - sol.el) < 0.3;
  return (
    <div className="mmortar">
      <h4>Mortar</h4>
      <div className="mm-grid">
        <span>Azimuth</span>
        <b>
          {mortar.az.toFixed(1)}° · {mortar.mils} mil
        </b>
        <span>Elevation</span>
        <b>{mortar.el.toFixed(1)}°</b>
        <span>Range (flat)</span>
        <b>{mortar.range} m</b>
        <span>Flight time</span>
        <b>{mortar.time} s</b>
      </div>
      {sol ? (
        <div className={`mm-sol ${azOk && elOk ? 'ok' : ''}`}>
          <b>
            Target ({sol.kind === 'mortar' ? 'mortar marker' : 'enemy marker'}): {sol.d} m · Bearing{' '}
            {sol.bearing}°{sol.dh ? ` · ${sol.dh > 0 ? '+' : ''}${sol.dh} m height` : ''}
          </b>
          {(sol.el ?? null) !== null ? (
            <span>
              Set <em className={azOk ? 'ok' : ''}>azimuth {sol.bearing}°</em> and{' '}
              <em className={elOk ? 'ok' : ''}>elevation {sol.el}°</em>
              {azOk && elOk ? ' · On target, fire!' : ''}
            </span>
          ) : (
            <span>Out of range from here ({sol.d} m).</span>
          )}
        </div>
      ) : (
        <p className="hint">
          Mark a target on the map (M) with the mortar or enemy marker. Then match the azimuth and
          elevation shown here and fire.
        </p>
      )}
      <p className="hint">
        Too far: raise the elevation. Too short: lower it. Off to the side: adjust the azimuth.
      </p>
      <div className="mm-table">
        {mortar.table.map(([element, range]) => (
          <span key={element}>
            {element}° <b>{range} m</b>
          </span>
        ))}
      </div>
      <KeyHints
        keys={[
          [['A', 'D'], 'Azimuth'],
          [['W', 'S'], 'Elevation'],
          [['Shift'], 'Fine'],
          [['LMB'], 'Fire'],
          [['E'], 'Leave'],
        ]}
      />
    </div>
  );
}

function Binos({ bearing, range }) {
  const marks = [];
  for (let offset = -5; offset <= 5; offset++) {
    marks.push(
      <line
        key={offset}
        x1={offset * 40}
        x2={offset * 40}
        y1={offset % 5 === 0 ? -14 : -7}
        y2={offset % 5 === 0 ? 14 : 7}
      />,
    );
  }
  return (
    <div className="mbinos">
      <svg viewBox="-260 -160 520 320" className="mbinos-ret">
        <line x1={-220} x2={220} y1={0} y2={0} />
        {marks}
        <line x1={0} x2={0} y1={-60} y2={60} />
        <text x={0} y={-80}>
          {pad(bearing)}°
        </text>
        {(range ?? null) !== null && (
          <text x={0} y={90} className="range">
            {range} m
          </text>
        )}
        <text x={0} y={120} className="small">
          1 mark = 10 mil
        </text>
      </svg>
    </div>
  );
}

function Scope({ kind }) {
  return (
    <div className={`mscope ${kind}`}>
      <svg viewBox="-100 -100 200 200">
        {kind === 'scope12' ? (
          <>
            <line x1={-100} x2={-38} y1={0} y2={0} className="thick" />
            <line x1={38} x2={100} y1={0} y2={0} className="thick" />
            <line x1={0} x2={0} y1={38} y2={100} className="thick" />
            <line x1={0} x2={0} y1={-100} y2={-38} className="thick" />
            <line x1={-38} x2={38} y1={0} y2={0} className="fine" />
            <line x1={0} x2={0} y1={-38} y2={38} className="fine" />
            {[-3, -2, -1, 1, 2, 3].map((offset) => (
              <line
                key={offset}
                x1={offset * 11}
                x2={offset * 11}
                y1={-2.2}
                y2={2.2}
                className="fine"
              />
            ))}
            {[-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map((offset) => (
              <line
                key={`h${offset}`}
                x1={offset * 11}
                x2={offset * 11}
                y1={-1}
                y2={1}
                className="fine"
              />
            ))}
            {[1, 2, 3].map((offset) => (
              <line
                key={`v${offset}`}
                x1={-2.2}
                x2={2.2}
                y1={offset * 11}
                y2={offset * 11}
                className="fine"
              />
            ))}
            {[-1, -2, -3].map((offset) => (
              <line
                key={`u${offset}`}
                x1={-2.2}
                x2={2.2}
                y1={offset * 11}
                y2={offset * 11}
                className="fine"
              />
            ))}
            <circle cx={0} cy={0} r={0.7} className="center" />
          </>
        ) : kind === 'acog' ? (
          <>
            <polygon points="0,0 -6,10 6,10" className="chev" />
            {[1, 2, 3, 4, 5].map((offset) => (
              <line
                key={offset}
                x1={-4 + offset * 0.3}
                x2={4 - offset * 0.3}
                y1={10 + offset * 9}
                y2={10 + offset * 9}
              />
            ))}
            <line x1={0} x2={0} y1={12} y2={70} />
          </>
        ) : (
          <>
            <line x1={-100} x2={-6} y1={0} y2={0} />
            <line x1={6} x2={100} y1={0} y2={0} />
            <line x1={0} x2={0} y1={-100} y2={-6} />
            <line x1={0} x2={0} y1={6} y2={100} />
            {[-4, -3, -2, -1, 1, 2, 3, 4].map((offset) => (
              <circle key={offset} cx={offset * 15} cy={0} r={1.4} />
            ))}
            {[1, 2, 3, 4].map((offset) => (
              <circle key={`v${offset}`} cx={0} cy={offset * 15} r={1.4} />
            ))}
            <circle cx={0} cy={0} r={1.6} className="center" />
          </>
        )}
      </svg>
    </div>
  );
}

function Chat({ hud, engine }) {
  const [text, setText] = useState('');
  const input = useRef(null);
  useEffect(() => {
    if (hud.chatOpen) {
      input.current?.focus();
    } else {
      setText('');
    }
  }, [hud.chatOpen]);
  return (
    <div className={`chat mchat ${hud.chatOpen ? 'open' : ''}`}>
      <ul aria-live="polite">
        {hud.chat.map((chat) => (
          <li key={chat.id} className={chat.mine ? 'mine' : ''}>
            <b className={`t${chat.tm}`}>{chat.n}</b>: {chat.m}
          </li>
        ))}
      </ul>
      {hud.chatOpen && (
        <input
          ref={input}
          type="text"
          maxLength={120}
          value={text}
          placeholder="Say something… (Enter to send, Esc to cancel)"
          aria-label="Chat message"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              engine.sendChat(text);
            } else if (event.key === 'Escape') {
              engine.closeChat();
            }
          }}
          onBlur={() => engine.closeChat()}
        />
      )}
    </div>
  );
}

function Board({ hud }) {
  const teams = [0, 1].map((team) =>
    hud.players
      .filter((player) => player.team === team)
      .sort((left, right) => right.kills - left.kills),
  );
  return (
    <div className="mboard">
      {teams.map((list, team) => (
        <div key={team}>
          <h3 style={{ color: TEAM_COLORS[team] }}>
            {TEAM_NAMES[team]} <small>{list.length} soldiers</small>
          </h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>K</th>
                <th>D</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr
                  key={item.id}
                  className={`${item.id === hud.myId ? 'me' : ''} ${item.alive ? '' : 'dead'}`}
                >
                  <td>{item.name}</td>
                  <td>{item.kills}</td>
                  <td>{item.deaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function TentModal({ engine, mil, tent }) {
  const tentInfo = MAPDATA.vtents[tent];
  if (!tentInfo) {
    return null;
  }
  const cat = VEH_CATS[tentInfo.kind];
  const cooldown = mil.cooldowns?.[tentInfo.kind] || 0;
  return (
    <div
      className="arsenal"
      onClick={(event) => event.target === event.currentTarget && engine.closeUi()}
    >
      <div className="mtent">
        <header>
          <div>
            <h2>{cat.name}</h2>
            <p className="hint">
              Main base supply: <b>{Math.round(mil.main)}</b> · Destroyed vehicles return after a
              while
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => engine.closeUi()}>
            Close <kbd>Esc</kbd>
          </button>
        </header>
        <div className="mtent-list">
          {cat.types.map((vehicleType) => {
            const vehicle = VEHICLES[vehicleType];
            const fleet = mil.fleet?.[vehicleType] || [1, 0, 1];
            const need = VEH_RANK[vehicleType] || 0;
            const locked = (mil.rank?.i ?? 0) < need;
            const can = !locked && cooldown <= 0 && mil.main >= vehicle.cost && fleet[0] > 0;
            return (
              <button
                key={vehicleType}
                type="button"
                disabled={!can}
                onClick={() => engine.spawnVehicle(tent, vehicleType)}
              >
                <b>{vehicle.name}</b>
                <span>
                  {vehicle.seats} seats ·{' '}
                  {vehicle.kind === 'heli' ? 'Aircraft' : `${Math.round(vehicle.vmax * 3.6)} km/h`}
                  {vehicle.cargo ? ` · Carries ${vehicle.cargo} supply` : ''}
                  {vehicle.armor < 0.1 ? ' · Armored' : ''}
                </span>
                <em>
                  {locked
                    ? `Unlocks at ${RANKS[need].name}`
                    : fleet[0] <= 0
                      ? fleet[1]
                        ? `Next in ${fleet[1]}s`
                        : 'All in use'
                      : cooldown > 0
                        ? `Wait ${cooldown}s`
                        : `${vehicle.cost} supply · ${fleet[0]}/${fleet[2]} left`}
                </em>
              </button>
            );
          })}
        </div>
        <p className="hint">The vehicle appears next to the tent.</p>
      </div>
    </div>
  );
}

function SpawnScreen({ hud, engine, mil, openArsenal }) {
  const [picked, setPicked] = useState('main');
  const spawns = mil.spawns || [];
  useEffect(() => {
    if (!spawns.find((seconds) => seconds.id === picked && seconds.ok)) {
      setPicked(spawns.find((seconds) => seconds.ok)?.id || 'main');
    }
  }, [spawns.map((seconds) => `${seconds.id}${seconds.ok}`).join()]);
  const can = mil.respawnIn <= 0 && hud.win < 0;
  const kit = mil.nextKit;
  return (
    <div className="mspawn">
      <div className="mspawn-map">
        <MilMap mil={mil} spawns={spawns} picked={picked} onPick={setPicked} compact />
      </div>
      <aside>
        <h2>Deploy</h2>
        <p className="hint">
          Spawn at the main base, or at a friendly sector or FOB with supply and no enemies nearby.
        </p>
        <ul className="mspawn-list">
          {spawns.map((seconds) => (
            <li key={seconds.id}>
              <button
                type="button"
                className={`${picked === seconds.id ? 'on' : ''}`}
                disabled={!seconds.ok}
                onClick={() => setPicked(seconds.id)}
              >
                <b>{seconds.name}</b>
                <span>
                  {seconds.ok
                    ? seconds.store < 0
                      ? 'Always available'
                      : `Supply ${seconds.store}`
                    : seconds.why}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {mil.squad && (
          <div className="mspawn-sq" role="radiogroup" aria-label="Squad">
            {mil.squad.squads.map((seconds, index) => (
              <button
                key={seconds.name}
                type="button"
                role="radio"
                aria-checked={index === mil.squad.sq}
                className={index === mil.squad.sq ? 'on' : ''}
                style={{ borderBottomColor: SQUAD_COLORS[index] }}
                onClick={() => engine.joinSquad(index)}
              >
                {seconds.name}
                <small>
                  {seconds.n}/{SQUAD_SIZE}
                </small>
              </button>
            ))}
          </div>
        )}
        <div className="mspawn-cls" role="radiogroup" aria-label="Class">
          {CLASS_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kit.cls === id}
              className={kit.cls === id ? 'on' : ''}
              onClick={() => engine.setClass(id)}
            >
              {CLASSES[id].name}
            </button>
          ))}
        </div>
        <div className="mspawn-kit">
          <small>Kit</small>
          <b>
            {kit.cls ? kit.cls[0].toUpperCase() + kit.cls.slice(1) : ''} ·{' '}
            {MW.find((weapon) => weapon.id === kit.primary?.id)?.name} · {kit.mags?.length || 0}{' '}
            mags
          </b>
          <button type="button" className="secondary" onClick={openArsenal}>
            Change kit
          </button>
        </div>
        <button
          type="button"
          className="primary"
          disabled={!can}
          onClick={() => engine.deploy(picked)}
        >
          {hud.win >= 0 ? 'Battle over' : can ? 'Deploy' : `Deploy in ${mil.respawnIn}s`}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => engine.store.set({ milPause: true })}
        >
          Menu
        </button>
      </aside>
    </div>
  );
}

function InvPanel({ engine, mil }) {
  const inv = mil.inv;
  if (!inv) {
    return null;
  }
  const kit = mil.kit;
  const ITEM_NAMES = {
    he: 'HE grenade',
    smoke: 'Smoke grenade',
    bandage: 'Bandage',
    medkit: 'Medical kit',
    rocket: 'HEAT rocket',
    shovel: 'Entrenching tool',
    binos: 'Binoculars',
    map: 'Map',
    light: 'Flashlight',
    nvg: 'Night vision',
  };
  return (
    <div
      className="arsenal"
      onClick={(event) => event.target === event.currentTarget && engine.closeUi()}
    >
      <div className="mtent minv">
        <header>
          <div>
            <h2>Inventory · {mil.cls}</h2>
            <p className="hint">
              {mil.kg} kg · Helmet {kit.helmet} · Vest {kit.vest} · Pack {kit.pack}
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => engine.closeUi()}>
            Close <kbd>I</kbd>
          </button>
        </header>
        <h3>In your weapons</h3>
        <div className="minv-row">
          {inv.loaded.map(([name, count, size, ammo, slot], index) => (
            <span key={index} className="minv-cell">
              <b>{name}</b>
              {count}/{size} {ammo}
              {slot > 0 && !mil.veh && (
                <button
                  type="button"
                  className="mdrop"
                  title="Drop"
                  onClick={() => engine.dropItem('w', slot)}
                >
                  Drop
                </button>
              )}
            </span>
          ))}
        </div>
        <h3>Spare magazines ({inv.mags.length})</h3>
        <div className="minv-row">
          {inv.mags.map(([caliber, count, size, ammo], index) => (
            <span key={index} className="minv-cell mag">
              <b>{caliber}</b>
              {count}/{size} {ammo}
              {!mil.veh && (
                <button
                  type="button"
                  className="mdrop"
                  title="Drop"
                  onClick={() => engine.dropItem('mag', index)}
                >
                  Drop
                </button>
              )}
            </span>
          ))}
          {!inv.mags.length && <span className="hint">None</span>}
        </div>
        <h3>Items</h3>
        <div className="minv-row">
          {Object.entries(inv.items)
            .filter(([, count]) => count > 0)
            .map(([id, count]) => (
              <span key={id} className="minv-cell">
                <b>{ITEM_NAMES[id] || id}</b>× {count}
                {!mil.veh && (
                  <button
                    type="button"
                    className="mdrop"
                    title="Drop one"
                    onClick={() => engine.dropItem('it', id)}
                  >
                    Drop
                  </button>
                )}
              </span>
            ))}
        </div>
        <p className="hint">Dropped items stay on the ground. Press E to pick them up.</p>
      </div>
    </div>
  );
}

function LootPanel({ engine, mil }) {
  const loot = mil.loot;
  const inv = mil.inv;
  if (!loot || !inv) {
    return null;
  }
  const ITEM_NAMES = {
    he: 'HE grenade',
    smoke: 'Smoke grenade',
    bandage: 'Bandage',
    medkit: 'Medical kit',
    rocket: 'HEAT rocket',
    shovel: 'Entrenching tool',
    binos: 'Binoculars',
    map: 'Map',
    light: 'Flashlight',
    nvg: 'Night vision',
  };
  const SLOT = ['Primary', 'Sidearm', 'Launcher'];
  const items = Object.entries(loot.items).filter(([, count]) => count > 0);
  return (
    <div
      className="arsenal"
      onClick={(event) => event.target === event.currentTarget && engine.closeUi()}
    >
      <div className="mtent minv mloot">
        <header>
          <div>
            <h2>Searching {loot.name}</h2>
            <p className="hint">
              Click an item to take it. Weapons swap with yours. Carrying {mil.kg} kg.
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => engine.closeUi()}>
            Close <kbd>Esc</kbd>
          </button>
        </header>
        <div className="mloot-cols">
          <section>
            <h3>You</h3>
            <div className="minv-row">
              {inv.loaded.map(([name, count, size, ammo], index) => (
                <span key={index} className="minv-cell">
                  <b>{name}</b>
                  {count}/{size} {ammo}
                </span>
              ))}
            </div>
            <h3>Magazines ({inv.mags.length})</h3>
            <div className="minv-row">
              {inv.mags.map(([caliber, count, size, ammo], index) => (
                <span key={index} className="minv-cell mag">
                  <b>{caliber}</b>
                  {count}/{size} {ammo}
                </span>
              ))}
              {!inv.mags.length && <span className="hint">None</span>}
            </div>
            <h3>Items</h3>
            <div className="minv-row">
              {Object.entries(inv.items)
                .filter(([, count]) => count > 0)
                .map(([id, count]) => (
                  <span key={id} className="minv-cell">
                    <b>{ITEM_NAMES[id] || id}</b>× {count}
                  </span>
                ))}
            </div>
          </section>
          <section>
            <h3>{loot.name}</h3>
            <div className="minv-row">
              {loot.w.map(([slot, name, count, size, ammo]) => {
                const mine = slot === 0 ? loot.mine.prim : slot === 1 ? loot.mine.sec : null;
                const blocked = slot === 2 && loot.mine.launcher;
                return (
                  <button
                    key={slot}
                    type="button"
                    className="minv-cell take"
                    disabled={blocked}
                    onClick={() => engine.takeLoot('w', slot)}
                  >
                    <small>{SLOT[slot]}</small>
                    <b>{name}</b>
                    {size ? `${count}/${size} ${ammo}` : ''}
                    <em>
                      {blocked ? 'You already have one' : mine ? `Swap for your ${mine}` : 'Take'}
                    </em>
                  </button>
                );
              })}
              {!loot.w.length && <span className="hint">No weapons</span>}
            </div>
            <h3>Magazines ({loot.mags.length})</h3>
            <div className="minv-row">
              {loot.mags.map(([caliber, count, size, ammo], index) => (
                <button
                  key={index}
                  type="button"
                  className="minv-cell mag take"
                  onClick={() => engine.takeLoot('mag', index)}
                >
                  <b>{caliber}</b>
                  {count}/{size} {ammo}
                </button>
              ))}
              {!loot.mags.length && <span className="hint">None</span>}
            </div>
            <h3>Items</h3>
            <div className="minv-row">
              {items.map(([id, count]) => (
                <button
                  key={id}
                  type="button"
                  className="minv-cell take"
                  onClick={() => engine.takeLoot('it', id)}
                >
                  <b>{ITEM_NAMES[id] || id}</b>× {count}
                </button>
              ))}
              {!items.length && <span className="hint">Nothing</span>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function VoiceHud({ mil }) {
  const voice = mil.voice;
  if (!voice) {
    return null;
  }
  const chName = { l: 'LOCAL', s: 'SQUAD', c: 'COMMAND' };
  return (
    <div className="mvoice">
      {voice.tx && (
        <div className={`mvoice-tx ch-${voice.tx}`}>
          <i style={{ transform: `scaleX(${Math.min(1, 0.15 + voice.level * 6)})` }} />
          <b>● {chName[voice.tx]}</b>
          <span>you are talking</span>
        </div>
      )}
      {voice.list.map((seconds, index) => (
        <div key={index} className={`mvoice-rx ch-${seconds.ch}`}>
          <b>
            {seconds.ch === 'l' ? 'LOCAL' : seconds.ch === 's' ? `RADIO ${seconds.sq}` : 'COMMAND'}
          </b>
          <span>{seconds.n || 'voice nearby'}</span>
        </div>
      ))}
    </div>
  );
}

function SquadPanel({ engine, mil }) {
  const squad = mil.squad;
  const voice = mil.voice;
  if (!squad) {
    return null;
  }
  const mine = squad.squads[squad.sq];
  return (
    <div
      className="arsenal"
      onClick={(event) => event.target === event.currentTarget && engine.closeUi()}
    >
      <div className="mtent msquad">
        <header>
          <div>
            <h2>
              Squad {SQUADS[squad.sq]}
              {squad.lead ? ' · Leader' : ''}
            </h2>
            <p className="hint">
              Leaders place orders on the map and use the command radio. Up to {SQUAD_SIZE} per
              squad.
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => engine.closeUi()}>
            Close <kbd>O</kbd>
          </button>
        </header>
        <div className="msquad-cols">
          <section>
            <h3>Squads</h3>
            {squad.squads.map((seconds, index) => (
              <button
                key={seconds.name}
                type="button"
                className={`msquad-row ${index === squad.sq ? 'on' : ''}`}
                disabled={index === squad.sq}
                onClick={() => engine.joinSquad(index)}
                style={{ borderLeftColor: SQUAD_COLORS[index] }}
              >
                <b>{seconds.name}</b>
                <span>
                  {seconds.n}/{SQUAD_SIZE}
                  {seconds.lead ? ` · Leader ${seconds.lead}` : ' · No leader'}
                </span>
                <em>{index === squad.sq ? 'Your squad' : 'Join'}</em>
              </button>
            ))}
          </section>
          <section>
            <h3>{SQUADS[squad.sq]} members</h3>
            {(mine?.members || []).map(([name, bot, lead, alive, id]) => (
              <div key={id} className="msquad-mem">
                <span>
                  {lead ? '★ ' : ''}
                  {name}
                  {bot ? ' (bot)' : ''}
                  {!alive ? ' · Dead' : ''}
                </span>
                {!bot && id !== engine.myId && (
                  <button
                    type="button"
                    className={voice?.muted?.includes(id) ? 'muted' : ''}
                    onClick={() => engine.voice.toggleMute(id)}
                  >
                    {voice?.muted?.includes(id) ? 'Muted' : 'Mute'}
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => engine.setLead(!squad.lead)}>
              {squad.lead ? 'Step down as leader' : 'Take the lead'}
            </button>
            <h3>Voice</h3>
            <label className="msquad-vol">
              <span>Local voice</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                defaultValue={voice?.vol?.local ?? 1}
                onChange={(event) => engine.voice.setVolume('local', Number(event.target.value))}
              />
            </label>
            <label className="msquad-vol">
              <span>Radio</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                defaultValue={voice?.vol?.radio ?? 1}
                onChange={(event) => engine.voice.setVolume('radio', Number(event.target.value))}
              />
            </label>
            <p className="hint">
              Hold <kbd>Caps Lock</kbd> Local voice · <kbd>J</kbd> Squad radio · <kbd>K</kbd>{' '}
              Command radio
              {voice?.denied ? '. Microphone blocked, allow it in the browser.' : ''}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Downed({ engine, mil }) {
  return (
    <div className="mdown">
      <b>INCAPACITATED</b>
      <span className={mil.downed.stable ? 'ok' : 'warn'}>
        {mil.downed.stable ? 'Stable' : 'Bleeding out'}
      </span>
      <span>
        {mil.downed.left}s left ·{' '}
        {mil.downed.inVeh
          ? 'A teammate must pull you out of the vehicle'
          : 'Any teammate can revive you'}
      </span>
      <button
        type="button"
        className="secondary"
        disabled={mil.downed.giveUpIn > 0}
        onClick={() => engine.giveUp()}
      >
        {mil.downed.giveUpIn > 0 ? `Give up in ${mil.downed.giveUpIn}s` : 'Give up and respawn'}
      </button>
    </div>
  );
}

function WinScreen({ hud, mil }) {
  const won = hud.win === mil.team;
  const rows = mil.stats || [];
  return (
    <div className={`winscreen ${won ? 'won' : 'lost'}`}>
      <b>{won ? 'VICTORY' : 'DEFEAT'}</b>
      <span style={{ color: TEAM_COLORS[hud.win] }}>
        {TEAM_NAMES[hud.win]} held every sector for 3 minutes
      </span>
      {rows.length > 0 && (
        <div className="mstats-scroll">
          <table className="mstats">
            <thead>
              <tr>
                <th>Player</th>
                <th>Score</th>
                <th>Kills</th>
                <th>Deaths</th>
                <th>Revives</th>
                <th>Heals</th>
                <th>Captures</th>
                <th>Supply</th>
                <th>Built</th>
                <th>Vehicles</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((range, index) => (
                <tr key={index} style={{ color: TEAM_COLORS[range.tm] }}>
                  <td>{range.n}</td>
                  <td>
                    <b>{range.score}</b>
                  </td>
                  <td>{range.k}</td>
                  <td>{range.d}</td>
                  <td>{range.rev}</td>
                  <td>{range.heal}</td>
                  <td>{range.cap}</td>
                  <td>{range.sup}</td>
                  <td>{range.built}</td>
                  <td>{range.veh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <small>New battle in {hud.nextMatchIn}s</small>
    </div>
  );
}

export default function MilsimHud({ hud, engine }) {
  const mil = hud.mil;
  const [arsenalSrc, setArsenalSrc] = useState(null);
  if (!mil) {
    return <div className="hud" />;
  }
  const interfaceState = hud.milUi;
  const dead = !hud.alive;
  const kills = hud.killfeed.filter((key) => key.mine || key.died);
  return (
    <div className={`hud mhud ${mil.nvg ? 'nvg' : ''}`}>
      {mil.suppress > 0.02 && (
        <div className="msuppress" style={{ opacity: Math.min(0.75, mil.suppress * 0.8) }} />
      )}
      {mil.prep > 0 && (
        <div className="mprep">
          <b>PREPARATION · {mil.prep}s</b>
          <span>Choose your kit and plan. The gates open soon.</span>
        </div>
      )}
      {mil.gunner && <div className="mgunsight" />}
      {mil.binos && <Binos bearing={mil.bearing} range={mil.range} />}
      {mil.scope && <Scope kind={mil.scope} />}
      {mil.nvg && <div className="mnvg" />}
      {hud.damage.map((bearingDegrees) => (
        <div
          key={bearingDegrees.id}
          className="dmg"
          style={{ transform: `rotate(${bearingDegrees.angle}deg)` }}
        >
          <i />
        </div>
      ))}
      {hud.hp <= 30 && hud.alive && !mil.downed && <div className="lowhp" />}
      {mil.downed && <div className="mdown-tint" />}

      <Compass bearing={mil.bearing} clock={mil.clock} />
      <Sectors mil={mil} />
      <ul className="mtoasts">
        {mil.toasts.map((toast) => (
          <li key={toast.id} className={toast.kind}>
            {toast.text}
          </li>
        ))}
      </ul>
      {!dead && !mil.downed && <Here mil={mil} />}

      <ul className="killfeed mkill">
        {kills.map((key) => (
          <li key={key.id} className={key.mine ? 'mine' : 'died'}>
            {key.died ? `Killed by ${key.kn}` : `You killed ${key.vn}`} <em>{weaponName(key.w)}</em>
          </li>
        ))}
      </ul>
      <div className="stats">
        {hud.ping}ms · {hud.fps} fps · {mil.me.grid}
      </div>
      <Chat hud={hud} engine={engine} />

      {!dead && !mil.downed && (
        <>
          <Vitals hud={hud} mil={mil} />
          <Ammo hud={hud} mil={mil} />
          {!mil.veh && <QuickBar mil={mil} />}
          {mil.veh && <VehHud v={mil.veh} />}
          {mil.build && <BuildPanel b={mil.build} />}
          {mil.mortar && <MortarPanel m={mil.mortar} />}
          {mil.interact && !interfaceState && !mil.mapOpen && (
            <div className={`mprompt ${mil.veh ? 'up' : ''}`}>{mil.interact}</div>
          )}
          {(mil.using || (mil.holding?.p ?? null) !== null) && (
            <div className="mprogress">
              <span>
                {mil.using
                  ? `Using ${mil.using.name}`
                  : mil.holding.kind === 'construct'
                    ? `Building ${mil.holding.name} · ${Math.round(mil.holding.p * 100)}%`
                    : mil.holding.kind === 'repair'
                      ? 'Repairing…'
                      : mil.holding.kind === 'bandage'
                        ? 'Bandaging…'
                        : 'Reviving…'}
              </span>
              <div className="mbar">
                <i
                  style={{
                    width: `${Math.round((mil.using ? mil.using.p : mil.holding.p) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
      {mil.downed && !dead && <Downed engine={engine} mil={mil} />}
      {hud.win >= 0 && <WinScreen hud={hud} mil={mil} />}
      {hud.board && <Board hud={hud} />}
      {mil.mapOpen && !dead && (
        <div className="mmapwrap">
          <MilMap
            mil={mil}
            onMark={(key, positionX, positionZ) => engine.placeMarker(key, positionX, positionZ)}
          />
          <p className="mmap-hint">
            <kbd>M</kbd> Close · Drag to move · Wheel to zoom · Grid {mil.me.grid} · Altitude{' '}
            {mil.me.alt} m
          </p>
        </div>
      )}
      {dead && !mil.dying && !hud.milPause && !arsenalSrc && hud.win < 0 && (
        <SpawnScreen
          hud={hud}
          engine={engine}
          mil={mil}
          openArsenal={() => setArsenalSrc('spawn')}
        />
      )}
      {interfaceState?.kind === 'vtent' && (
        <TentModal engine={engine} mil={mil} tent={interfaceState.tent} />
      )}
      {interfaceState?.kind === 'inv' && <InvPanel engine={engine} mil={mil} />}
      {interfaceState?.kind === 'loot' && <LootPanel engine={engine} mil={mil} />}
      {interfaceState?.kind === 'squad' && <SquadPanel engine={engine} mil={mil} />}
      <VoiceHud mil={mil} />
      {(interfaceState?.kind === 'arsenal' || arsenalSrc) && (
        <Arsenal
          look={engine.look}
          onEquip={(key) => {
            if (arsenalSrc) {
              engine.setNextKit(key);
              setArsenalSrc(null);
            } else {
              engine.equipKit(key);
            }
          }}
          onResupply={() => engine.resupply()}
          mil={mil}
          src={arsenalSrc || interfaceState.src}
          onClose={() => (arsenalSrc ? setArsenalSrc(null) : engine.closeUi())}
        />
      )}
      {hud.debug && <div className="debug-tag">hitboxes visible (F2)</div>}
    </div>
  );
}
