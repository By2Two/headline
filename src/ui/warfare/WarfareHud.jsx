import { useEffect, useRef, useState } from 'react';
import {
  TEAM_NAMES,
  TEAM_COLORS,
  VEHICLES,
  SQUADS,
  SQUAD_COLORS,
  SQUAD_SIZE,
} from '../../../shared/warfare/config.js';
import { MW } from '../../../shared/warfare/weapons.js';
import MilMap from './MilMap.jsx';
import Deploy from './Deploy.jsx';
import WarMinimap from './WarMinimap.jsx';
import './warfare.css';

const pad = (value, digits = 3) => String(Math.round(value)).padStart(digits, '0');
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
    base: 'Restricted area',
    rpg: 'RPG-7',
  }[id] ||
  id;

function Tickets({ team, n: count, max, mine }) {
  const percent = Math.max(0, Math.min(100, (count / max) * 100));
  return (
    <div className={`wf-tk t${team} ${mine ? 'mine' : ''} ${percent < 20 ? 'low' : ''}`}>
      <small>{TEAM_NAMES[team]}</small>
      <strong>{Math.max(0, Math.round(count))}</strong>
      <i>
        <u style={{ width: `${percent}%` }} />
      </i>
    </div>
  );
}

function Flags({ mil }) {
  const team = mil.team;
  return (
    <div className="wf-flags">
      {mil.sectors.map((seconds) => {
        const state = seconds.owner < 0 ? 'n' : seconds.owner === team ? 'f' : 'e';
        const prog = seconds.owner === seconds.capTeam || seconds.capTeam < 0 ? 0 : seconds.cap;
        return (
          <div
            key={seconds.id}
            className={`wf-flag ${state} ${seconds.contested ? 'c' : ''} ${mil.here?.id === seconds.id ? 'here' : ''}`}
            title={seconds.name}
          >
            <b>{seconds.id}</b>
            <i>
              <u
                style={{
                  width: `${Math.round((seconds.owner >= 0 && prog === 0 ? seconds.cap : prog) * 100)}%`,
                  background:
                    TEAM_COLORS[
                      seconds.owner >= 0 && prog === 0
                        ? seconds.owner
                        : seconds.capTeam >= 0
                          ? seconds.capTeam
                          : 0
                    ],
                }}
              />
            </i>
          </div>
        );
      })}
    </div>
  );
}

function CaptureBar({ mil }) {
  const capture = mil.here;
  if (!capture) {
    return null;
  }
  const team = mil.team;
  const mine = capture.owner === team;
  const percent = Math.round(capture.cap * 100);
  let text;
  if (capture.contested) {
    text = 'CONTESTED';
  } else if (mine && capture.cap >= 1) {
    text = 'FLAG CONTROLLED';
  } else if (capture.capTeam === team) {
    text =
      capture.owner >= 0 && capture.owner !== team
        ? `NEUTRALIZING ${percent}%`
        : `CAPTURING ${percent}%`;
  } else if (capture.capTeam >= 0 && capture.capTeam !== team) {
    text = mine ? `LOSING ${percent}%` : `ENEMY CAPTURING ${percent}%`;
  } else {
    text = mine
      ? 'FLAG CONTROLLED'
      : capture.owner >= 0
        ? 'ENEMY FLAG · CAPTURE IT'
        : 'NEUTRAL · CAPTURE IT';
  }
  const color =
    capture.owner >= 0
      ? TEAM_COLORS[capture.owner]
      : capture.capTeam >= 0
        ? TEAM_COLORS[capture.capTeam]
        : '#8a918b';
  return (
    <div className={`wf-cap ${capture.contested ? 'c' : ''}`}>
      <b style={{ background: color }}>{capture.id}</b>
      <div>
        <span>
          {capture.name} · {text}
        </span>
        <i>
          <u
            style={{
              width: `${percent}%`,
              background:
                TEAM_COLORS[capture.capTeam >= 0 ? capture.capTeam : Math.max(0, capture.owner)],
            }}
          />
        </i>
      </div>
    </div>
  );
}

function Crosshair({ mil, hit }) {
  const [flash, setFlash] = useState(null);
  const lastHit = useRef(0);
  useEffect(() => {
    if (!hit || hit.n === lastHit.current) {
      return;
    }
    lastHit.current = hit.n;
    setFlash({ ...hit });
    const id = setTimeout(() => setFlash(null), hit.kill ? 420 : 170);
    return () => clearTimeout(id);
  }, [hit?.n]);
  const crosshair = mil.cross;
  const hide =
    mil.scope || mil.binos || mil.veh || crosshair.ads > 0.35 || mil.weapon.melee || mil.sprint;
  const range = Math.max(
    4,
    (Math.tan(crosshair.sp) / Math.tan((crosshair.fov * Math.PI) / 360)) * (window.innerHeight / 2),
  );
  const gap = Math.min(range, 160);
  return (
    <>
      {!hide && (
        <div className="wf-cross" style={{ '--g': `${gap}px` }}>
          <i className="u" />
          <i className="d" />
          <i className="l" />
          <i className="r" />
          <em />
        </div>
      )}
      {flash && (
        <div className={`wf-hitm ${flash.kill ? 'kill' : ''} ${flash.head ? 'head' : ''}`}>
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
    </>
  );
}

function SquadList({ mil }) {
  const squad = mil.squad;
  if (!squad) {
    return null;
  }
  const mine = squad.squads[squad.sq];
  return (
    <ul className="wf-squad" style={{ '--sq': SQUAD_COLORS[squad.sq] }}>
      <li className="head">
        <b>{SQUADS[squad.sq]}</b>
        <small>
          {mine?.n ?? 0}/{SQUAD_SIZE}
        </small>
      </li>
      {(mine?.members || []).map(([name, bot, lead, alive, id]) => (
        <li key={id} className={alive ? '' : 'dead'}>
          <i />
          <span>
            {lead ? '★ ' : ''}
            {name.replace(/^BOT /, '')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Vitals({ hud, mil }) {
  const health = Math.max(0, Math.min(100, hud.hp));
  return (
    <div className="wf-vit">
      <div className={`wf-hp ${health <= 30 ? 'low' : ''}`}>
        <b>{health}</b>
        <i>
          <u style={{ width: `${health}%` }} />
        </i>
      </div>
      <div className="wf-cls">
        <b>{mil.cls}</b>
        <span>{mil.score} PTS</span>
      </div>
    </div>
  );
}

function AmmoBox({ hud, mil }) {
  const weapon = mil.weapon;
  const reserve = (weapon.spare || []).reduce((accumulator, item) => accumulator + item[0], 0);
  const showAmmo = !weapon.melee && !weapon.grenade && !weapon.item;
  return (
    <div
      className={`wf-ammo ${showAmmo && weapon.mag <= Math.max(3, weapon.magSize * 0.2) ? 'low' : ''}`}
    >
      <small>
        {weapon.name}
        {showAmmo && ` · ${weapon.mode}`}
      </small>
      {showAmmo ? (
        <div className="wf-num">
          <b>{weapon.mag}</b>
          <span>/ {reserve}</span>
        </div>
      ) : (
        <div className="wf-num">
          <b>{weapon.count ?? '—'}</b>
        </div>
      )}
      {hud.reloading && (
        <i className="wf-reload">
          <u style={{ width: `${Math.round(hud.reloadP * 100)}%` }} />
        </i>
      )}
      <ul className="wf-quick">
        {mil.quick.map((squad, index) =>
          squad ? (
            <li key={index} className={squad.on ? 'on' : ''}>
              <kbd>{squad.k}</kbd>
              <span>{squad.name}</span>
              {(squad.count ?? null) !== null && <em>{squad.count}</em>}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

function KillFeed({ hud }) {
  return (
    <ul className="wf-kills">
      {hud.killfeed.slice(-6).map((key) => (
        <li key={key.id} className={key.mine ? 'mine' : key.died ? 'died' : ''}>
          <b className={`t${key.kt}`}>{key.kn}</b>
          <em>{weaponName(key.w)}</em>
          {key.h && <i className="hs">HS</i>}
          <b className={`t${key.vt}`}>{key.vn}</b>
        </li>
      ))}
    </ul>
  );
}

function Spots({ mil }) {
  return (
    <>
      {mil.spots
        .filter((seconds) => seconds.sx !== null && seconds.sx > 0 && seconds.sy > 0)
        .map((seconds) => (
          <div
            key={`${seconds.k}${seconds.id}`}
            className="wf-spot"
            style={{ left: seconds.sx, top: seconds.sy }}
          >
            <i />
            <small>{seconds.dist} m</small>
          </div>
        ))}
    </>
  );
}

function Downed({ engine, mil }) {
  return (
    <div className="wf-down">
      <b>DOWNED</b>
      <span>
        {mil.downed.inVeh ? 'A teammate must pull you out' : 'Waiting for a medic'} ·{' '}
        <strong>{mil.downed.left}s</strong>
      </span>
      <button
        type="button"
        className="secondary"
        disabled={mil.downed.giveUpIn > 0}
        onClick={() => engine.giveUp()}
      >
        {mil.downed.giveUpIn > 0 ? `Respawn in ${mil.downed.giveUpIn}s` : 'Respawn'}
      </button>
    </div>
  );
}

function WinScreen({ hud, mil }) {
  const won = hud.win === mil.team;
  const rows = mil.stats || [];
  return (
    <div className={`winscreen wf-win ${won ? 'won' : 'lost'}`}>
      <b>{won ? 'VICTORY' : 'DEFEAT'}</b>
      <span style={{ color: TEAM_COLORS[hud.win] }}>
        {TEAM_NAMES[hud.win]} wins · {TEAM_NAMES[1 - hud.win]} ran out of tickets
      </span>
      {rows.length > 0 && (
        <div className="mstats-scroll">
          <table className="mstats">
            <thead>
              <tr>
                <th>Player</th>
                <th>Score</th>
                <th>Kills</th>
                <th>Assists</th>
                <th>Deaths</th>
                <th>Revives</th>
                <th>Heals</th>
                <th>Captures</th>
                <th>Defends</th>
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
                  <td>{range.ast}</td>
                  <td>{range.d}</td>
                  <td>{range.rev}</td>
                  <td>{range.heal}</td>
                  <td>{range.cap}</td>
                  <td>{range.def}</td>
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

function Board({ hud, mil }) {
  const teams = [0, 1].map((team) =>
    hud.players
      .filter((player) => player.team === team)
      .sort((left, right) => right.score - left.score),
  );
  return (
    <div className="mboard wf-board">
      <div className="wf-board-tk">
        {[0, 1].map((team) => (
          <div key={team} className={`wf-tk t${team}`} style={{ background: TEAM_COLORS[team] }}>
            <small>{TEAM_NAMES[team]}</small>
            <b>{Math.round(mil.tickets[team])}</b>
            <span>tickets</span>
          </div>
        ))}
      </div>
      <div className="wf-board-cols">
        {teams.map((list, team) => (
          <div key={team}>
            <h3 style={{ background: TEAM_COLORS[team] }}>
              {TEAM_NAMES[team]} <small>{list.length} soldiers</small>
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Score</th>
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
                    <td>{item.score}</td>
                    <td>{item.kills}</td>
                    <td>{item.deaths}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
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
        {hud.chat.map((crosshair) => (
          <li key={crosshair.id} className={crosshair.mine ? 'mine' : ''}>
            <b className={`t${crosshair.tm}`}>{crosshair.n}</b>: {crosshair.m}
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

export default function WarfareHud({ hud, engine }) {
  const mil = hud.mil;
  if (!mil) {
    return <div className="hud" />;
  }
  const interfaceState = hud.milUi;
  const dead = !hud.alive;
  const live = !dead && !mil.downed;
  return (
    <div className={`hud mhud wfhud ${mil.nvg ? 'nvg' : ''}`}>
      {mil.suppress > 0.02 && (
        <div className="msuppress" style={{ opacity: Math.min(0.75, mil.suppress * 0.8) }} />
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

      <div
        className="wf-top"
        style={{ '--me': TEAM_COLORS[mil.team], '--en': TEAM_COLORS[1 - mil.team] }}
      >
        <Tickets team={mil.team} n={mil.tickets[mil.team]} max={mil.maxTickets} mine />
        <Flags mil={mil} />
        <Tickets team={1 - mil.team} n={mil.tickets[1 - mil.team]} max={mil.maxTickets} />
      </div>
      <ul className="mtoasts wf-toasts">
        {mil.toasts.map((toast) => (
          <li key={toast.id} className={toast.kind}>
            {toast.text}
          </li>
        ))}
      </ul>
      <KillFeed hud={hud} />
      <div className="stats">
        {hud.ping}ms · {hud.fps} fps · {mil.me.grid}
      </div>
      <Chat hud={hud} engine={engine} />

      {live && (
        <>
          <Crosshair mil={mil} hit={hud.hit} />
          <Spots mil={mil} />
          <CaptureBar mil={mil} />
          <div className="wf-corner">
            <SquadList mil={mil} />
            <WarMinimap mil={mil} />
          </div>
          <Vitals hud={hud} mil={mil} />
          <AmmoBox hud={hud} mil={mil} />
          {mil.veh && <VehHud v={mil.veh} />}
          {mil.interact && !interfaceState && !mil.mapOpen && (
            <div className={`mprompt ${mil.veh ? 'up' : ''}`}>{mil.interact}</div>
          )}
          {(mil.using || (mil.holding?.p ?? null) !== null) && (
            <div className="mprogress">
              <span>
                {mil.using
                  ? `Using ${mil.using.name}`
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
      {hud.board && <Board hud={hud} mil={mil} />}
      {mil.mapOpen && !dead && (
        <div className="mmapwrap">
          <MilMap
            mil={mil}
            onMark={(key, positionX, positionZ) => engine.placeMarker(key, positionX, positionZ)}
          />
          <p className="mmap-hint">
            <kbd>M</kbd> Close · Drag to move · Wheel to zoom · Grid {mil.me.grid}
          </p>
        </div>
      )}
      {dead && !mil.dying && !hud.milPause && hud.win < 0 && (
        <Deploy hud={hud} engine={engine} mil={mil} />
      )}
      {interfaceState?.kind === 'squad' && <SquadPanel engine={engine} mil={mil} />}
      <VoiceHud mil={mil} />
      {hud.debug && <div className="debug-tag">hitboxes visible (F2)</div>}
    </div>
  );
}

void VEHICLES;
void pad;
