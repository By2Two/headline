import { MapPicker, SkillPicker } from './Menu.jsx';
import { CopyButton, inviteLink } from './RoomPanel.jsx';
import { getMap } from '../../shared/map.js';

const MAX_BOTS = 10;
const MAX_PLAYERS = 16;
const TEAMS = [
  { id: 0, name: 'Terrorists', short: 'T' },
  { id: 1, name: 'Counter-Terrorists', short: 'CT' },
];

export default function CompLobby({ hud, engine, server }) {
  const room = hud.room;
  const isHost = room.host === hud.myId;
  const currentCommand = (command) => engine.roomCommand(command);
  const bots = hud.players.filter((player) => player.bot).length;
  const full = bots >= MAX_BOTS || hud.players.length >= MAX_PLAYERS;
  const start = () => {
    engine.audio.init();
    currentCommand({ t: 'start' });
    engine.lock();
  };
  return (
    <div className="pause comp-lobby">
      <div className="pause-panel">
        <header>
          <div>
            <small className="lobby-kicker">
              {room.game === 'comp' ? 'Competitive' : 'Team Deathmatch'} · {getMap(room.map).name}
            </small>
            <h2>Lobby</h2>
          </div>
          <div className="pause-actions">
            <button className="secondary" onClick={() => engine.leave()}>
              {isHost ? 'Leave (closes room)' : 'Leave'}
            </button>
            {isHost && (
              <button className="primary" onClick={start} disabled={hud.players.length < 2}>
                Start match
              </button>
            )}
          </div>
        </header>

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

        <section className="lobby-teams">
          {TEAMS.map((team) => {
            const list = hud.players.filter((player) => player.team === team.id);
            const mine = hud.team === team.id;
            return (
              <div key={team.id} className={`lobby-team t${team.id}-side`}>
                <header>
                  <h3>
                    {team.name} <span>{list.length}</span>
                  </h3>
                  {mine ? (
                    <span className="lobby-yours">Your team</span>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => currentCommand({ t: 'team', team: team.id })}
                    >
                      Join {team.short}
                    </button>
                  )}
                </header>
                <ul className="room-players">
                  {list.map((item) => (
                    <li key={item.id} className={item.id === hud.myId ? 'me' : ''}>
                      <span>{item.name}</span>
                      {item.bot && <small className="tag">bot</small>}
                      {item.id === room.host && <small className="tag">host</small>}
                      {item.id === hud.myId && <small className="tag">you</small>}
                      {isHost && item.id !== hud.myId && (
                        <button
                          type="button"
                          className="link"
                          onClick={() => currentCommand({ t: 'kick', id: item.id })}
                        >
                          {item.bot ? 'Remove' : 'Kick'}
                        </button>
                      )}
                    </li>
                  ))}
                  {!list.length && <li className="empty">Empty</li>}
                </ul>
                {isHost && (
                  <button
                    type="button"
                    className="secondary add-bot"
                    disabled={full}
                    onClick={() => currentCommand({ t: 'bot', op: 'add', team: team.id })}
                  >
                    Add bot
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {isHost ? (
          <section className="lobby-settings">
            <div>
              <h3>Map</h3>
              <MapPicker
                value={room.map}
                game={room.game}
                onChange={(map) => currentCommand({ t: 'map', map })}
              />
            </div>
            <div>
              <h3>Bot difficulty</h3>
              <SkillPicker
                value={room.skill}
                onChange={(skill) => currentCommand({ t: 'bot', op: 'skill', skill })}
              />
            </div>
          </section>
        ) : (
          <p className="hint">Waiting for the host to start the match.</p>
        )}
      </div>
    </div>
  );
}
