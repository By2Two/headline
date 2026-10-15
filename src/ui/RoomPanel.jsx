import { useState } from 'react';
import { SkillPicker, MapPicker } from './Menu.jsx';
import { getMap } from '../../shared/map.js';
import { MIL } from '../../shared/milsim/config.js';
import { MIL as WMIL } from '../../shared/warfare/config.js';

export function inviteLink(code, server, publicUrl) {
  if (publicUrl) {
    return `${publicUrl}/?room=${code}`;
  }
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  if (server) {
    url.searchParams.set('server', server);
  }
  return url.toString();
}

function copyText(text) {
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  };
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallback(),
    );
  }
  return Promise.resolve(fallback());
}

export function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        copyText(text).then((ok) => {
          if (ok) {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }
        });
      }}
    >
      {done ? 'Copied!' : label}
    </button>
  );
}

export default function RoomPanel({ hud, engine, server }) {
  const room = hud.room;
  if (!room) {
    return null;
  }
  const isHost = room.host === hud.myId;
  const currentCommand = (command) => engine.roomCommand(command);
  const bots = hud.players.filter((player) => player.bot).length;
  const war = room.game === 'warfare';
  const mil = room.game === 'milsim' || war;
  const maxBots = war ? WMIL.maxBots : mil ? MIL.maxBots : 10;
  const maxPlayers = war ? WMIL.maxPlayers : mil ? MIL.maxPlayers : 16;
  const row = (player) => (
    <li key={player.id}>
      <span className={`t${player.team}`}>{player.name}</span>
      {player.id === room.host && <small className="tag">host</small>}
      {player.id === hud.myId && <small className="tag">you</small>}
      {isHost && player.id !== hud.myId && (
        <button
          type="button"
          className="link"
          onClick={() => currentCommand({ t: 'kick', id: player.id })}
        >
          {player.bot ? 'Remove' : 'Kick'}
        </button>
      )}
    </li>
  );
  return (
    <div className="room-panel">
      {room.code ? (
        <div className="room-code">
          <div>
            <small>Room code</small>
            <b>{room.code}</b>
          </div>
          <div className="room-actions">
            <CopyButton text={room.code} label="Copy code" />
            <CopyButton text={inviteLink(room.code, server, room.url)} label="Copy invite link" />
          </div>
        </div>
      ) : (
        <p className="hint">Solo match against bots.</p>
      )}
      {room.code &&
        !room.url &&
        !server &&
        /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) && (
          <p className="lo-status">
            This invite only works on your PC/network. To play with friends over the internet, close
            the game and start it with <code>npm run host</code>: it opens a public link
            automatically.
          </p>
        )}
      {room.code && (
        <p className="hint">
          {isHost
            ? 'You are the host. If you leave, the room closes for everyone.'
            : 'If the host leaves, the room closes.'}
        </p>
      )}

      {room.game !== 'milsim' && room.game !== 'warfare' && (
        <section className="room-map">
          <h3>Map{!isHost && `: ${getMap(room.map).name}`}</h3>
          {isHost && (
            <MapPicker
              value={room.map}
              game={room.game}
              onChange={(map) => currentCommand({ t: 'map', map })}
            />
          )}
          {isHost && <p className="hint">Changing the map starts a new match.</p>}
        </section>
      )}

      {isHost && (
        <section className="room-bots">
          <h3>Bots ({bots})</h3>
          <div className="play-row">
            <button
              type="button"
              className="secondary"
              disabled={bots === 0}
              onClick={() => currentCommand({ t: 'bot', op: 'remove' })}
            >
              Remove bot
            </button>
            <button
              type="button"
              className="secondary"
              disabled={bots >= maxBots || hud.players.length >= maxPlayers}
              onClick={() => currentCommand({ t: 'bot', op: 'add' })}
            >
              Add bot
            </button>
          </div>
          <SkillPicker
            value={room.skill}
            onChange={(skill) => currentCommand({ t: 'bot', op: 'skill', skill })}
          />
        </section>
      )}

      {mil ? (
        <section className="room-teams">
          {[0, 1].map((team) => {
            const list = hud.players.filter((player) => player.team === team);
            return (
              <div key={team}>
                <h3>
                  {team === 0 ? 'OPFOR' : 'BLUFOR'} ({list.length})
                </h3>
                <ul className="room-players">{list.map(row)}</ul>
              </div>
            );
          })}
        </section>
      ) : (
        <section>
          <h3>Players</h3>
          <ul className="room-players">{hud.players.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
