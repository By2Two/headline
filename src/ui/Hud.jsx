import Minimap from './Minimap.jsx';
import BuyMenu from './BuyMenu.jsx';
import { useEffect, useRef, useState } from 'react';
import Crosshair from './Crosshair.jsx';

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
    <div className={`chat ${hud.chatOpen ? 'open' : ''}`}>
      <ul aria-live="polite">
        {hud.chat.map((competitive) => (
          <li key={competitive.id} className={competitive.mine ? 'mine' : ''}>
            <b className={`t${competitive.tm}`}>{competitive.n}</b>: {competitive.m}
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
import { WEAPONS, GUNGAME, GG_KILLS } from '../../shared/weapons.js';

const weaponName = (id) => WEAPONS.find((weapon) => weapon.id === id)?.name || id;

const HeadshotIcon = () => (
  <svg className="kf-icon hs" viewBox="0 0 20 20" role="img" aria-label="headshot">
    <title>Headshot</title>
    <circle cx="10" cy="8" r="5" />
    <rect x="7" y="12" width="6" height="5" rx="1" />
    <path d="M10 0v4M10 12v0M0 8h4M16 8h4" className="cross" />
  </svg>
);
const NoScopeIcon = () => (
  <svg className="kf-icon ns" viewBox="0 0 20 20" role="img" aria-label="no scope">
    <title>No scope</title>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 4v12M4 10h12" className="cross" />
    <path d="M3 17L17 3" className="slash" />
  </svg>
);

function Scoreboard({ players, myId, room, game }) {
  if (game === 'gungame') {
    const list = [...players].sort(
      (left, right) => (right.level ?? 0) - (left.level ?? 0) || right.kills - left.kills,
    );
    return (
      <div className="board ffa">
        <div className="team">
          <header>
            <b>Gun Game</b>
            <span>knife kill wins</span>
          </header>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Weapon</th>
                <th>K</th>
                <th>D</th>
              </tr>
            </thead>
            <tbody>
              {list.map((progress) => (
                <tr
                  key={progress.id}
                  className={`${progress.id === myId ? 'me' : ''} ${progress.alive ? '' : 'dead'}`}
                >
                  <td>{progress.name}</td>
                  <td>
                    {WEAPONS.find((weapon) => weapon.id === GUNGAME[progress.level ?? 0])?.name}
                  </td>
                  <td>{progress.kills}</td>
                  <td>{progress.deaths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  const cols = [
    { label: 'T', team: 0 },
    { label: 'CT', team: 1 },
  ];
  return (
    <div className="board">
      {room?.code && (
        <p className="board-room">
          Room <b>{room.code}</b>
        </p>
      )}
      {cols.map((competitive) => {
        const list = players
          .filter((progress) => progress.team === competitive.team)
          .sort((left, right) => right.kills - left.kills || left.deaths - right.deaths);
        const total = list.reduce((accumulator, item) => accumulator + item.kills, 0);
        return (
          <div key={competitive.team} className={`team team${competitive.team}`}>
            <header>
              <b>{competitive.label}</b>
              <span>{total} kills</span>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>K</th>
                  <th>D</th>
                </tr>
              </thead>
              <tbody>
                {list.map((progress) => (
                  <tr
                    key={progress.id}
                    className={`${progress.id === myId ? 'me' : ''} ${progress.alive ? '' : 'dead'}`}
                  >
                    <td>
                      {progress.name}
                      {room && progress.id === room.host && <small className="tag">host</small>}
                    </td>
                    <td>{progress.kills}</td>
                    <td>{progress.deaths}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

const TEAM_NAMES = ['Terrorists', 'Counter-Terrorists'];

function TeamScore({ hud }) {
  const [terroristScore, counterTerroristScore] = hud.score;
  const percent = (value) => `${Math.min(100, (value / hud.goal) * 100)}%`;
  return (
    <div
      className="topscore"
      aria-label={`Score: T ${terroristScore}, CT ${counterTerroristScore}, first to ${hud.goal}`}
    >
      <div className={`ts t0 ${hud.team === 0 ? 'mine' : ''}`}>
        <span className="bar">
          <i style={{ width: percent(terroristScore) }} />
        </span>
        <b>{terroristScore}</b>
        <small>T</small>
      </div>
      <em>{hud.goal}</em>
      <div className={`ts t1 ${hud.team === 1 ? 'mine' : ''}`}>
        <small>CT</small>
        <b>{counterTerroristScore}</b>
        <span className="bar">
          <i style={{ width: percent(counterTerroristScore) }} />
        </span>
      </div>
    </div>
  );
}

const mmss = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const END_WHY = {
  elim: 'Enemy team eliminated',
  bomb: 'The bomb exploded',
  defuse: 'The bomb was defused',
  time: 'Time ran out',
};

function CompTop({ hud }) {
  const competitive = hud.comp;
  const [terroristScore, counterTerroristScore] = hud.score;
  const planted = (competitive.bombLeft ?? null) !== null;
  return (
    <div
      className="topscore comp-top"
      aria-label={`Round ${competitive.round}. T ${terroristScore}, CT ${counterTerroristScore}`}
    >
      <div className={`ts t0 ${hud.team === 0 ? 'mine' : ''}`}>
        <b>{terroristScore}</b>
        <small>T</small>
      </div>
      <div
        className={`comp-clock ${planted ? 'bomb' : competitive.ph === 'freeze' ? 'freeze' : ''}`}
      >
        {planted ? (
          <>
            <i className="c4-icon" />
            <b>{competitive.bombLeft.toFixed(2)}</b>
          </>
        ) : (
          <b>{competitive.ph === 'post' ? '0:00' : mmss(Math.ceil(competitive.timeLeft))}</b>
        )}
        <small>
          {planted
            ? `Bomb · site ${competitive.site}`
            : competitive.ph === 'freeze'
              ? 'Freeze time'
              : `Round ${competitive.round}`}
        </small>
      </div>
      <div className={`ts t1 ${hud.team === 1 ? 'mine' : ''}`}>
        <small>CT</small>
        <b>{counterTerroristScore}</b>
      </div>
    </div>
  );
}

function CompBanner({ hud }) {
  const banner = hud.comp.banner;
  if (!banner) {
    return null;
  }
  if (banner.kind === 'end') {
    const won = banner.w === hud.team;
    return (
      <div className={`comp-banner ${won ? 'won' : 'lost'}`}>
        <b className={`t${banner.w}`}>{TEAM_NAMES[banner.w]} win</b>
        <span>{END_WHY[banner.why]}</span>
      </div>
    );
  }
  if (banner.kind === 'half') {
    return (
      <div className="comp-banner">
        <b>Halftime</b>
        <span>Switching sides</span>
      </div>
    );
  }
  if (banner.kind === 'planted') {
    return (
      <div className="comp-banner planted">
        <b>Bomb planted</b>
        <span>Site {banner.site}</span>
      </div>
    );
  }
  return (
    <div className="comp-banner small">
      <b>Round {banner.r}</b>
      <span>{hud.team === 0 ? 'Plant the bomb on A or B' : 'Defend the bomb sites'}</span>
    </div>
  );
}

function CompAction({ hud }) {
  const competitive = hud.comp;
  const progress = competitive.plantP || competitive.defuseP;
  if (progress > 0) {
    return (
      <div className="comp-progress">
        <span>{competitive.plantP ? 'Planting the bomb…' : 'Defusing…'}</span>
        <div>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    );
  }
  if (competitive.canDefuse) {
    return (
      <div className="comp-hint">
        Hold <kbd>E</kbd> to defuse
      </div>
    );
  }
  if (hud.weaponId === 'c4' && competitive.ph === 'live') {
    return <div className="comp-hint">Hold fire inside bomb site A or B to plant</div>;
  }
  return null;
}

function GunGameBar({ hud }) {
  const { level, kills } = hud.gg;
  const name = (index) => WEAPONS.find((weapon) => weapon.id === GUNGAME[index])?.name;
  const last = level >= GUNGAME.length - 1;
  const knifed = hud.gg.down && Date.now() - hud.gg.down < 3000;
  return (
    <div className="ggbar" aria-label={`Gun Game level ${level + 1} of ${GUNGAME.length}`}>
      <small>
        Level {level + 1}/{GUNGAME.length}
      </small>
      <b>{name(level)}</b>
      {knifed && <span className="gg-knifed">Knifed! −1</span>}
      {last ? (
        <span className="gg-final">Knife kill wins!</span>
      ) : (
        <>
          <div className="gg-pips">
            {Array.from({ length: GG_KILLS }, (_, index) => (
              <i key={index} className={index < kills ? 'on' : ''} />
            ))}
          </div>
          <span>Next: {name(level + 1)}</span>
        </>
      )}
      <div className="gg-ladder">
        {GUNGAME.map((id, index) => (
          <i
            key={id}
            className={index < level ? 'done' : index === level ? 'now' : ''}
            title={name(index)}
          />
        ))}
      </div>
    </div>
  );
}

function GunGameLeader({ hud }) {
  const top = [...hud.players].sort(
    (left, right) => (right.level ?? 0) - (left.level ?? 0) || right.kills - left.kills,
  )[0];
  if (!top) {
    return null;
  }
  return (
    <div className="topscore gg-leader">
      <div className="ts">
        <small>Leader</small>
        <b>{top.name}</b>
        <em>
          {(top.level ?? 0) + 1}/{GUNGAME.length}
        </em>
      </div>
    </div>
  );
}

function WinScreen({ hud }) {
  if (hud.game === 'gungame') {
    const isWinner = hud.winId === hud.myId;
    return (
      <div className={`winscreen ${isWinner ? 'won' : 'lost'}`}>
        <b>{isWinner ? 'Victory' : 'Defeat'}</b>
        <span>{hud.winName} won the Gun Game</span>
        {isWinner && <span className="case-reward">+1 Headline Case</span>}
        <small>New match in {hud.nextMatchIn}s</small>
      </div>
    );
  }
  const won = hud.win === hud.team;
  return (
    <div className={`winscreen ${won ? 'won' : 'lost'}`}>
      <b>{won ? 'Victory' : 'Defeat'}</b>
      <span className={`t${hud.win}`}>{TEAM_NAMES[hud.win]} win</span>
      <em>
        {hud.score[0]} – {hud.score[1]}
      </em>
      {won && <span className="case-reward">+1 Headline Case</span>}
      <small>New match in {hud.nextMatchIn}s</small>
    </div>
  );
}

export default function Hud({ hud, engine, cross }) {
  const showMap = hud.win < 0 && !hud.board;
  const low = hud.hp <= 30;
  return (
    <div className="hud">
      {(hud.scope > 0 && hud.alive) || (!hud.alive && hud.spectating?.scoped) ? (
        (hud.alive ? hud.scopeType : hud.spectating.scopeType) === 'dot' ? (
          <div className="dotscope">
            <i />
          </div>
        ) : (
          <div className="scope" />
        )
      ) : (
        hud.win < 0 && <Crosshair cross={cross} engine={engine} />
      )}

      {hud.hit && (
        <div
          key={hud.hit.n}
          className={`hitmarker ${hud.hit.head ? 'head' : ''} ${hud.hit.kill ? 'kill' : ''}`}
        />
      )}

      {hud.damage.map((damage) => (
        <div key={damage.id} className="dmg" style={{ transform: `rotate(${damage.angle}deg)` }}>
          <i />
        </div>
      ))}
      {low && hud.alive && <div className="lowhp" />}

      {hud.game === 'gungame' ? (
        <GunGameLeader hud={hud} />
      ) : hud.comp ? (
        <CompTop hud={hud} />
      ) : (
        <TeamScore hud={hud} />
      )}
      {hud.comp && hud.win < 0 && <CompBanner hud={hud} />}
      {hud.comp && hud.alive && hud.win < 0 && <CompAction hud={hud} />}
      {hud.game === 'gungame' && hud.win < 0 && <GunGameBar hud={hud} />}
      {hud.win >= 0 && <WinScreen hud={hud} />}

      {showMap && <Minimap engine={engine} big={!!hud.bigMap} />}

      <div className="stats">
        {hud.ping}ms · {hud.fps} fps
      </div>

      <Chat hud={hud} engine={engine} />

      <ul className="killfeed">
        {hud.killfeed.map((killfeed) => (
          <li key={killfeed.id} className={killfeed.mine ? 'mine' : killfeed.died ? 'died' : ''}>
            <span className={`t${killfeed.kt}`}>{killfeed.kn}</span>
            <em>{weaponName(killfeed.w)}</em>
            {killfeed.ns && <NoScopeIcon />}
            {killfeed.h && <HeadshotIcon />}
            <span className={`t${killfeed.vt}`}>{killfeed.vn}</span>
          </li>
        ))}
      </ul>

      {hud.comp && (
        <div className="money">
          <b>${(hud.money || 0).toLocaleString('en-US')}</b>
          {hud.canBuy && !hud.buyOpen && (
            <span>
              <kbd>B</kbd> buy
            </span>
          )}
          <ul>
            {hud.moneyFx.map((positionX) => (
              <li key={positionX.id} className={positionX.d < 0 ? 'neg' : ''}>
                {positionX.d > 0 ? '+' : '−'}${Math.abs(positionX.d)}
                {positionX.why && positionX.why !== 'buy' && <small>{positionX.why}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hud.alive && hud.pickName && !hud.comp?.canDefuse && (
        <div className="comp-hint pick-hint">
          <kbd>E</kbd> Pick up {hud.pickName}
        </div>
      )}
      {hud.buyOpen && <BuyMenu hud={hud} engine={engine} />}

      <div className={`vitals ${low ? 'low' : ''}`}>
        <b>{hud.hp}</b>
        <span>health</span>
        {hud.armor > 0 && (
          <em className="armor" title="Kevlar vest">
            <i aria-hidden="true" />
            {hud.armor}
          </em>
        )}
      </div>

      <div className="ammo">
        <small>{hud.weapon}</small>
        {!hud.melee && (
          <div>
            <b className={hud.mag === 0 ? 'empty' : ''}>{hud.mag}</b>
            <span>/ {hud.reserve}</span>
          </div>
        )}
        {hud.comp?.hasBomb && hud.weaponId !== 'c4' && (
          <span className="bomb-tag">
            <i className="c4-icon" /> C4 <kbd>5</kbd> · drop <kbd>G</kbd>
          </span>
        )}
        {hud.reloading && (
          <div className="reload">
            <i style={{ width: `${Math.round(hud.reloadP * 100)}%` }} />
          </div>
        )}
      </div>

      {!hud.alive && hud.spectating && hud.win < 0 && (
        <div className="spectate">
          <small>Spectating</small>
          <b className={`t${hud.spectating.team}`}>{hud.spectating.name}</b>
          <span>{hud.spectating.hp} HP</span>
          {hud.spectating.more && (
            <em>
              <kbd>Right click</kbd> next player
            </em>
          )}
        </div>
      )}
      {!hud.alive && !hud.spectating && hud.win < 0 && (
        <div className="dead-msg">
          <b>You died</b>
          <span>{hud.comp ? 'Wait for the next round' : `Respawning in ${hud.respawnIn}s`}</span>
          {!hud.comp && <small>Press Esc to change weapons</small>}
        </div>
      )}

      {hud.board && (
        <Scoreboard players={hud.players} myId={hud.myId} room={hud.room} game={hud.game} />
      )}
      {hud.debug && <div className="debug-tag">hitboxes visible (H)</div>}
    </div>
  );
}
