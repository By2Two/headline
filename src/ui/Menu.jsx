import { MIL_MAPS } from '../../shared/milsim/maps.js';
import { MIL_MAPS as WAR_MAPS } from '../../shared/warfare/maps.js';
import { useEffect, useState } from 'react';
import SkinPicker from './SkinPicker.jsx';
import CaseOpening from './CaseOpening.jsx';
import {
  CASES,
  RARITIES,
  rarityOf,
  itemName,
  ownsSkin,
  inventory,
  CASE_PRICE,
} from '../inventory.js';
import { weaponThumb } from './thumbs.js';
import Loadout from './Loadout.jsx';
import CharacterEditor from './CharacterEditor.jsx';
import { CrosshairEditor } from './Crosshair.jsx';
import Tabs from './Tabs.jsx';
import { WEAPONS } from '../../shared/weapons.js';
import { MAPS } from '../../shared/map.js';
import { SENS_MIN, SENS_MAX } from '../settings.js';

export const mapsFor = (game) => (game === 'comp' ? MAPS.filter((map) => map.sites) : MAPS);
export const mapFor = (game, map) =>
  mapsFor(game).some((currentMap) => currentMap.id === map) ? map : mapsFor(game)[0].id;

export function MapPicker({ value, onChange, game }) {
  const list = mapsFor(game);
  const current = list.find((map) => map.id === value) || list[0];
  return (
    <div className="map-picker">
      <div className="map-chips" role="radiogroup" aria-label="Map">
        {list.map((map) => (
          <button
            key={map.id}
            type="button"
            role="radio"
            aria-checked={current.id === map.id}
            className={current.id === map.id ? 'on' : ''}
            onClick={() => onChange(map.id)}
          >
            <i
              style={{
                background: `linear-gradient(135deg, #${map.theme.sky.toString(16).padStart(6, '0')} 0 50%, ${map.theme.floor[0]} 50%)`,
              }}
            />
            {map.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const TAC_GFX = [
  ['high', 'High'],
  ['medium', 'Medium (simple shadows)'],
  ['low', 'Low (no shadows)'],
];

export function Settings({ settings, setSettings }) {
  const set = (key, value) => setSettings({ ...settings, [key]: value });
  return (
    <div className="settings">
      <label>
        <span>Sensitivity</span>
        <input
          type="range"
          min={SENS_MIN}
          max={SENS_MAX}
          step="0.01"
          value={settings.sens}
          onChange={(event) => set('sens', Number(event.target.value))}
        />
        <input
          type="number"
          className="settings-number"
          aria-label="Sensitivity value"
          min={SENS_MIN}
          max={SENS_MAX}
          step="0.01"
          value={settings.sens}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value >= SENS_MIN && value <= SENS_MAX) {
              set('sens', value);
            }
          }}
        />
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.rawInput !== false}
          onChange={(event) => set('rawInput', event.target.checked)}
        />
        <span>Raw mouse input (ignores the Windows pointer speed)</span>
      </label>
      {settings.genre !== 'milsim' && (
        <label>
          <span>Graphics</span>
          <select
            value={settings.tacGfx ?? 'high'}
            onChange={(event) => set('tacGfx', event.target.value)}
          >
            {TAC_GFX.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
          <b />
        </label>
      )}
      <label>
        <span>Field of view</span>
        <input
          type="range"
          min="60"
          max="110"
          step="1"
          value={settings.fov}
          onChange={(event) => set('fov', Number(event.target.value))}
        />
        <b>{settings.fov}°</b>
      </label>
      <label>
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          onChange={(event) => set('volume', Number(event.target.value))}
        />
        <b>{Math.round(settings.volume * 100)}%</b>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.fullscreen}
          onChange={(event) => set('fullscreen', event.target.checked)}
        />
        <span>Fullscreen while playing (lets Ctrl crouch without closing the tab)</span>
      </label>
    </div>
  );
}

const MIL_GFX = [
  ['auto', 'Auto'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
  ['ultra', 'Ultra'],
];
const MIL_RES = [0.5, 0.67, 0.75, 0.85, 1];
export function MilGraphics({ settings, setSettings }) {
  const set = (key, value) => setSettings({ ...settings, [key]: value });
  const gfx = settings.milGfx || 'auto';
  const result = MIL_RES.includes(settings.milRes) ? settings.milRes : 1;
  return (
    <div className="settings">
      <label>
        <span>Graphics quality</span>
        <select value={gfx} onChange={(event) => set('milGfx', event.target.value)}>
          {MIL_GFX.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <b />
      </label>
      <label>
        <span>Resolution scale</span>
        <input
          type="range"
          min="0"
          max={MIL_RES.length - 1}
          step="1"
          value={MIL_RES.indexOf(result)}
          onChange={(event) => set('milRes', MIL_RES[Number(event.target.value)])}
        />
        <b>{Math.round(result * 100)}%</b>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={!!settings.milDynRes}
          onChange={(event) => set('milDynRes', event.target.checked)}
        />
        <span>Dynamic resolution (lowers resolution when FPS drops)</span>
      </label>
      <p className="hint">
        Lower settings only reduce visual detail. Players, trees and cover look the same on every
        setting. Press F8 to see performance.
      </p>
    </div>
  );
}

const CONTROLS = [
  ['W A S D', 'Move'],
  ['Shift', 'Walk silently'],
  ['Ctrl / C', 'Crouch'],
  ['Space / Wheel', 'Jump (time it on landing to bunny hop)'],
  ['Left click', 'Shoot or slash'],
  ['Right click', 'Scope or zoom · Knife: heavy stab · R8: fan the hammer'],
  ['R', 'Reload'],
  ['F', 'Inspect weapon'],
  ['1 · 2 · 3', 'Primary, pistol, melee'],
  ['Q', 'Last weapon'],
  ['4', 'Grenade (left click throws, right click lobs)'],
  ['5', 'Bomb (Competitive, Terrorists)'],
  ['B', 'Buy menu (Competitive)'],
  ['E', 'Pick up a weapon (Competitive)'],
  ['G', 'Drop the item in your hand (Competitive)'],
  ['M (hold)', 'Full map'],
  ['Tab', 'Scoreboard'],
  ['T', 'Chat'],
  ['Esc', 'Menu'],
];

const MIL_CONTROLS = [
  ['W A S D', 'Move'],
  ['Shift', 'Sprint · While aiming: hold breath'],
  ['C / Ctrl', 'Crouch or stand up'],
  ['Z', 'Go prone or get up'],
  ['Q / E (prone)', 'Roll'],
  ['Space', 'Jump or climb low walls'],
  ['Q / E (hold)', 'Lean left or right'],
  ['V (hold)', 'Free look'],
  ['Left click', 'Fire'],
  ['Right click (tap)', 'Aim down sights'],
  ['Right click (hold)', 'Focus zoom'],
  ['Alt + Wheel', 'Scope magnification'],
  ['PgUp / PgDn', 'Zeroing'],
  ['X', 'Fire mode (single or auto)'],
  ['R', 'Reload (uses your fullest magazine)'],
  ['1-9', 'Primary, sidearm, launcher, HE, smoke, bandage, medkit, shovel, knife'],
  ['Weapon key again', 'Raise or lower the weapon'],
  ['E / F', 'Interact (vehicle, tent, arsenal, crate, MG, mortar)'],
  ['E / F (hold)', 'Revive (medic) or repair (engineer)'],
  ['B', 'Binoculars'],
  ['M', 'Map'],
  ['L', 'Flashlight · In a truck: load supply'],
  ['N', 'Night vision'],
  ['G', 'Build (engineer)'],
  ['Car: W / S', 'Throttle and brake'],
  ['Car: A / D', 'Steer'],
  ['Car: Q / E', 'Gear down or up'],
  ['Helicopter: Shift / C', 'Climb or descend'],
  ['Helicopter: W A S D', 'Tilt'],
  ['Helicopter: Q / E', 'Turn'],
  ['Vehicle: X', 'Start or stop the engine'],
  ['Vehicle: F', 'Open the door or get out · Double tap: eject'],
  ['Vehicle: H', 'First or third person'],
  ['Vehicle: 1-9', 'Change seat'],
  ['Vehicle: L / U', 'Load or unload supply'],
  ['Caps Lock (hold)', 'Local voice (enemies nearby can hear)'],
  ['J (hold)', 'Squad radio'],
  ['K (hold)', 'Command radio (squad leaders)'],
  ['O', 'Squad menu'],
  ['F8', 'Performance overlay'],
  ['Tab · T · Esc', 'Scoreboard · Chat · Menu'],
];

export function MilControls() {
  return (
    <dl className="controls">
      {MIL_CONTROLS.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const WAR_CONTROLS = [
  ['W A S D', 'Move'],
  ['Shift', 'Sprint (weapon turns sideways) · Sprint + C: slide'],
  ['C / Ctrl', 'Crouch'],
  ['Z', 'Go prone or get up'],
  ['Space', 'Jump or vault low obstacles'],
  ['Left click', 'Fire'],
  ['Right click (hold)', 'Aim down sights'],
  ['R', 'Reload'],
  ['X', 'Fire mode · Tank: coaxial machine gun'],
  ['1-9', 'Primary, sidearm, launcher, frag, smoke, bandage, medkit, class gadget (8), knife'],
  [
    'Gadget (8) + left click',
    'Assault: ammo bag · Medic: medical bag · Recon: spawn beacon · Engineer: hold F by a vehicle with the torch',
  ],
  ['Q', 'Spot the enemy in your sights (visible to the squad for a few seconds)'],
  ['F', 'Enter vehicle or get in a seat · Hold on a downed ally: revive (medic)'],
  ['E', 'Interact · Engineer: repair vehicle'],
  ['M', 'Full map'],
  ['Car: W / S · A / D', 'Throttle and brake · Steer'],
  ['Helicopter: W A S D', 'Tilt (stabilized)'],
  ['Helicopter: Shift / C', 'Climb or descend'],
  ['Vehicle: F', 'Get out'],
  ['Vehicle: 1-9', 'Change seat'],
  ['Tab · T · Esc', 'Scoreboard · Chat · Menu'],
];

export function WarControls() {
  return (
    <dl className="controls">
      {WAR_CONTROLS.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Controls() {
  return (
    <dl className="controls">
      {CONTROLS.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const SKILLS = [
  ['easy', 'Easy'],
  ['normal', 'Normal'],
  ['hard', 'Hard'],
];

export function SkillPicker({ value, onChange }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Bot difficulty">
      {SKILLS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="stepper" aria-label={label}>
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <b>{value}</b>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function NameField({ settings, set }) {
  return (
    <label className="name">
      <span>Your name</span>
      <input
        type="text"
        maxLength={16}
        placeholder="Player"
        value={settings.name}
        onChange={(event) => set('name')(event.target.value)}
      />
    </label>
  );
}

function ScreenHead({ title, onBack }) {
  return (
    <header className="screen-head">
      <button type="button" className="secondary back-btn" onClick={onBack}>
        ← Back
      </button>
      <h2>{title}</h2>
    </header>
  );
}

function MenuItem({ title, sub, onClick, soon, badge }) {
  return (
    <button type="button" className="menu-item" onClick={onClick} disabled={soon}>
      <b>
        {title}
        {soon && <em className="soon-tag">Soon</em>}
        {badge > 0 && <em className="count-badge">{badge}</em>}
      </b>
      <span>{sub}</span>
      {!soon && <i aria-hidden="true">›</i>}
    </button>
  );
}

const MODES = [
  ['tdm', 'Team deathmatch', true],
  ['gungame', 'Gun Game', true],
  ['comp', 'Competitive', true],
];

function ModePicker({ value, onChange }) {
  return (
    <>
      <div className="seg mode-seg" role="radiogroup" aria-label="Game mode">
        {MODES.map(([id, label, on]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            className={value === id ? 'on' : ''}
            disabled={!on}
            title={on ? '' : 'Coming soon'}
            onClick={() => onChange(id)}
          >
            {label}
            {!on && <em className="soon-tag">Soon</em>}
          </button>
        ))}
      </div>
      <p className="hint map-desc">
        {value === 'gungame'
          ? 'Free for all. Every 5 kills you get the next weapon, from the AWP down to the knife. A knife kill wins.'
          : value === 'comp'
            ? 'Bomb defusal on Dunes. No respawns. Terrorists plant at A or B, Counter-Terrorists defuse. First to 13 rounds wins, sides switch after 12.'
            : 'Two teams. First to 100 kills wins.'}
      </p>
    </>
  );
}

function QuickScreen({ settings, set, onPlay, busy, back }) {
  return (
    <div className="screen">
      <ScreenHead title="Quick play" onBack={back} />
      <NameField settings={settings} set={set} />
      <section className="play-box">
        <h3>Game mode</h3>
        <ModePicker value={settings.game} onChange={set('game')} />
      </section>
      <section className="play-box">
        <h3>Map</h3>
        <MapPicker value={settings.map} onChange={set('map')} game={settings.game} />
      </section>
      <section className="play-box">
        <h3>Bots</h3>
        <div className="play-opts">
          <SkillPicker value={settings.skill} onChange={set('skill')} />
          <label className="inline">
            <span>Bots</span>
            <Stepper label="bots" value={settings.bots} min={1} max={10} onChange={set('bots')} />
          </label>
        </div>
      </section>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          onPlay({
            mode: 'quick',
            bots: settings.bots,
            skill: settings.skill,
            map: mapFor(settings.game, settings.map),
            game: settings.game,
          })
        }
      >
        {busy ? 'Connecting…' : 'Play'}
      </button>
    </div>
  );
}

function HostScreen({ settings, set, onPlay, busy, back }) {
  const code = settings.code.toUpperCase();
  return (
    <div className="screen">
      <ScreenHead title="Host a game" onBack={back} />
      <NameField settings={settings} set={set} />
      <section className="play-box">
        <h3>Map</h3>
        <MapPicker value={settings.map} onChange={set('map')} game={settings.game} />
      </section>
      <section className="play-box">
        <h3>Game mode</h3>
        <ModePicker value={settings.game} onChange={set('game')} />
      </section>
      <section className="play-box">
        <h3>Bots</h3>
        <div className="play-opts">
          <SkillPicker value={settings.skill} onChange={set('skill')} />
          <label className="inline">
            <span>Bots</span>
            <Stepper
              label="bots"
              value={settings.hostBots}
              min={0}
              max={10}
              onChange={set('hostBots')}
            />
          </label>
        </div>
      </section>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          onPlay({
            mode: 'host',
            bots: settings.hostBots,
            skill: settings.skill,
            map: mapFor(settings.game, settings.map),
            game: settings.game,
          })
        }
      >
        {busy ? 'Connecting…' : 'Create room'}
      </button>

      <section className="play-box">
        <h3>Join a friend</h3>
        <form
          className="play-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 4 && !busy) {
              onPlay({ mode: 'code', code });
            }
          }}
        >
          <input
            type="text"
            placeholder="ROOM CODE"
            maxLength={4}
            value={code}
            aria-label="Room code"
            onChange={(event) => set('code')(event.target.value.replace(/[^a-z0-9]/gi, ''))}
          />
          <button type="submit" className="secondary" disabled={busy || code.length !== 4}>
            Join
          </button>
        </form>
        <details className="fold server-fold" open={!!settings.server}>
          <summary>Server</summary>
          <label className="name">
            <span className="hint">
              Leave empty to play on this site, or paste a friend&apos;s tunnel address.
            </span>
            <input
              type="text"
              placeholder="e.g. something.trycloudflare.com"
              value={settings.server}
              onChange={(event) => set('server')(event.target.value.trim())}
            />
          </label>
        </details>
      </section>
    </div>
  );
}

function BoxesScreen({ inv, back, onOpen }) {
  const recent = [...inv.history].reverse().slice(0, 6);
  return (
    <div className="screen">
      <ScreenHead title="Boxes" onBack={back} />
      <div className="coins-row">
        <span className="coins">
          <i aria-hidden="true" /> {(inv.coins || 0).toLocaleString('en-US')} coins
        </span>
        <button
          type="button"
          className="secondary"
          disabled={(inv.coins || 0) < CASE_PRICE}
          onClick={() => inventory.buyBox('headline')}
        >
          Buy a case · {CASE_PRICE.toLocaleString('en-US')} coins
        </button>
      </div>
      <p className="hint">Duplicates turn into coins. Use coins to buy more cases.</p>
      {CASES.map((crate) => {
        const count = inv.boxes[crate.id] || 0;
        return (
          <div key={crate.id} className="case-card" style={{ '--cc': crate.color }}>
            <div className="case-icon" aria-hidden="true" />
            <div>
              <b>{crate.name}</b>
              <span>
                {count > 0 ? `${count} in your inventory` : 'None yet: win a match to earn one'}
              </span>
            </div>
            <button
              type="button"
              className="primary"
              disabled={count === 0}
              onClick={() => onOpen(crate.id)}
            >
              Open
            </button>
          </div>
        );
      })}
      <section className="play-box">
        <h3>Drop chances</h3>
        <ul className="odds">
          {RARITIES.map((rarity) => (
            <li key={rarity.id} style={{ '--rc': rarity.color }}>
              <i />
              <span>{rarity.name}</span>
              <b>{(rarity.chance * 100).toFixed(2)}%</b>
            </li>
          ))}
        </ul>
      </section>
      {recent.length > 0 && (
        <section className="play-box">
          <h3>Your last drops</h3>
          <div className="drops">
            {recent.map((item) => (
              <div
                key={item.at}
                className="drop"
                style={{ '--rc': rarityOf(item.rarity).color }}
                title={itemName(item)}
              >
                <img src={weaponThumb(item.weapon, item.skin, 160, 80)} alt="" />
                <span>{itemName(item)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SettingsScreen({ settings, setSettings, back, milsim, war }) {
  return (
    <div className="screen">
      <ScreenHead title="Settings" onBack={back} />
      <Settings settings={settings} setSettings={setSettings} />
      {milsim && (
        <>
          <hr className="sep" />
          <h3 className="controls-title">{war ? 'Graphics' : 'MilSim graphics'}</h3>
          <MilGraphics settings={settings} setSettings={setSettings} />
        </>
      )}
      <hr className="sep" />
      <h3 className="controls-title">Controls</h3>
      {war ? <WarControls /> : milsim ? <MilControls /> : <Controls />}
    </div>
  );
}

function MilSidePicker({ value, onChange }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Side">
      {[
        ['T', 'OPFOR (north)'],
        ['CT', 'BLUFOR (south)'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const MIL_CLASSES = [
  ['assault', 'Assault', 'Rifles · MG · RPG'],
  ['medic', 'Medic', 'SMGs · revives'],
  ['engineer', 'Engineer', 'Shotguns · SMGs · builds'],
  ['sniper', 'Sniper', 'Sniper rifles'],
];
const WAR_CLASSES = [
  ['assault', 'Assault', 'Rifles · grenades'],
  ['medic', 'Medic', 'SMGs · revives'],
  ['engineer', 'Engineer', 'Repair · anti-armor'],
  ['support', 'Support', 'LMG · ammo'],
  ['sniper', 'Recon', 'Sniper · spotting'],
];
function MilClassPicker({ value, onChange, classes = MIL_CLASSES }) {
  return (
    <div className="seg mil-cls" role="radiogroup" aria-label="Class">
      {classes.map(([id, label, note]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {label}
          <small>{note}</small>
        </button>
      ))}
    </div>
  );
}

const MIL_MAP_NOTES = {
  kestrel: '4 sectors · open conquest',
  ironpass: '7 sectors · frontline',
  frontier: '5 flags · conquest',
};
function MilMapPicker({ value, onChange, maps = MIL_MAPS }) {
  return (
    <div className="seg mil-cls" role="radiogroup" aria-label="Map">
      {maps.map((map) => (
        <button
          key={map.id}
          type="button"
          role="radio"
          aria-checked={value === map.id}
          className={value === map.id ? 'on' : ''}
          onClick={() => onChange(map.id)}
        >
          {map.name}
          <small>{MIL_MAP_NOTES[map.id] || ''}</small>
        </button>
      ))}
    </div>
  );
}

function MilBrief({ settings, set, war = false }) {
  if (war) {
    const selected = WAR_MAPS.find((map) => map.id === settings.warMap) || WAR_MAPS[0];
    return (
      <section className="play-box">
        <h3>Map</h3>
        <MilMapPicker value={selected.id} onChange={set('warMap')} maps={WAR_MAPS} />
        <p className="hint map-desc">
          {selected.desc} Conquest: hold more flags than the enemy to drain their tickets. Respawn
          fast, jump into vehicles and keep the pressure on.
        </p>
      </section>
    );
  }
  const selected = MIL_MAPS.find((map) => map.id === settings.milMap) || MIL_MAPS[0];
  return (
    <section className="play-box">
      <h3>Map · 2 × 2 km</h3>
      <MilMapPicker value={selected.id} onChange={set('milMap')} />
      <p className="hint map-desc">
        {selected.desc} 24 players per team in squads of six. Hold every sector for 3 minutes to
        win. Enemies inside a sector pause the timer.
      </p>
      {selected.id === 'ironpass' && (
        <p className="hint">
          Frontline order for OPFOR: A, F, B, D, C, E, G. BLUFOR goes the other way. Capture a
          sector to unlock the next.
        </p>
      )}
    </section>
  );
}

function MilQuickScreen({ settings, set, onPlay, busy, back, war = false }) {
  const bots = (war ? settings.warBots : settings.milBots) ?? 16;
  return (
    <div className="screen">
      <ScreenHead title={war ? 'Warfare · Quick play' : 'MilSim · Quick play'} onBack={back} />
      <NameField settings={settings} set={set} />
      <MilBrief settings={settings} set={set} war={war} />
      <section className="play-box">
        <h3>Class</h3>
        {war ? (
          <MilClassPicker
            value={settings.warCls || 'assault'}
            onChange={set('warCls')}
            classes={WAR_CLASSES}
          />
        ) : (
          <MilClassPicker value={settings.milCls || 'assault'} onChange={set('milCls')} />
        )}
      </section>
      <section className="play-box">
        <h3>Side</h3>
        <MilSidePicker value={settings.team} onChange={set('team')} />
      </section>
      <section className="play-box">
        <h3>Bots</h3>
        <div className="play-opts">
          <SkillPicker value={settings.skill} onChange={set('skill')} />
          <label className="inline">
            <span>Bots</span>
            <Stepper
              label="bots"
              value={bots}
              min={0}
              max={war ? 63 : 47}
              onChange={set(war ? 'warBots' : 'milBots')}
            />
          </label>
        </div>
      </section>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          onPlay({
            mode: 'quick',
            bots,
            skill: settings.skill,
            map: war ? settings.warMap || WAR_MAPS[0].id : settings.milMap || 'kestrel',
            game: war ? 'warfare' : 'milsim',
          })
        }
      >
        {busy ? 'Connecting…' : 'Deploy'}
      </button>
    </div>
  );
}

function MilHostScreen({ settings, set, onPlay, busy, back, war = false }) {
  const code = settings.code.toUpperCase();
  const bots = (war ? settings.warHostBots : settings.milHostBots) ?? 8;
  return (
    <div className="screen">
      <ScreenHead title={war ? 'Warfare · Host a game' : 'MilSim · Host a game'} onBack={back} />
      <NameField settings={settings} set={set} />
      <MilBrief settings={settings} set={set} war={war} />
      <section className="play-box">
        <h3>Class</h3>
        {war ? (
          <MilClassPicker
            value={settings.warCls || 'assault'}
            onChange={set('warCls')}
            classes={WAR_CLASSES}
          />
        ) : (
          <MilClassPicker value={settings.milCls || 'assault'} onChange={set('milCls')} />
        )}
      </section>
      <section className="play-box">
        <h3>Side</h3>
        <MilSidePicker value={settings.team} onChange={set('team')} />
      </section>
      <section className="play-box">
        <h3>Bots</h3>
        <div className="play-opts">
          <SkillPicker value={settings.skill} onChange={set('skill')} />
          <label className="inline">
            <span>Bots</span>
            <Stepper
              label="bots"
              value={bots}
              min={0}
              max={war ? 63 : 47}
              onChange={set(war ? 'warHostBots' : 'milHostBots')}
            />
          </label>
        </div>
      </section>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          onPlay({
            mode: 'host',
            bots,
            skill: settings.skill,
            map: war ? settings.warMap || WAR_MAPS[0].id : settings.milMap || 'kestrel',
            game: war ? 'warfare' : 'milsim',
          })
        }
      >
        {busy ? 'Connecting…' : 'Create room'}
      </button>
      <section className="play-box">
        <h3>Join a friend</h3>
        <form
          className="play-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === 4 && !busy) {
              onPlay({ mode: 'code', code, game: war ? 'warfare' : 'milsim' });
            }
          }}
        >
          <input
            type="text"
            placeholder="ROOM CODE"
            maxLength={4}
            value={code}
            aria-label="Room code"
            onChange={(event) => set('code')(event.target.value.replace(/[^a-z0-9]/gi, ''))}
          />
          <button type="submit" className="secondary" disabled={busy || code.length !== 4}>
            Join
          </button>
        </form>
        <details className="fold server-fold" open={!!settings.server}>
          <summary>Server</summary>
          <label className="name">
            <span className="hint">
              Leave empty to play on this site, or paste a friend&apos;s tunnel address.
            </span>
            <input
              type="text"
              placeholder="e.g. something.trycloudflare.com"
              value={settings.server}
              onChange={(event) => set('server')(event.target.value.trim())}
            />
          </label>
        </details>
      </section>
    </div>
  );
}

const GENRES = [
  ['tactical', 'Tactical', 'Rounds, bomb sites and economy. Every bullet counts.', true],
  ['milsim', 'MilSim', 'Large maps, realistic ballistics, vehicles, logistics and building.', true],
  ['warfare', 'Warfare', 'Conquest: flags, tickets, tanks, helicopters and fast respawns.', true],
];

function GenreScreen({ onPick }) {
  return (
    <div className="screen">
      <h1>Headline</h1>
      <p className="hint">Choose how you want to play</p>
      <nav className="genres" aria-label="Game type">
        {GENRES.map(([id, name, desc, on]) => (
          <button
            key={id}
            type="button"
            className={`genre g-${id}`}
            disabled={!on}
            onClick={() => onPick(id)}
          >
            <b>{name}</b>
            <span>{desc}</span>
            {!on && <em className="soon-tag">Coming soon</em>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function JoinByCode({ settings, set, onPlay, busy, game }) {
  const code = settings.code.toUpperCase();
  return (
    <section className="play-box">
      <h3>Join with code</h3>
      <form
        className="play-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 4 && !busy) {
            onPlay(game ? { mode: 'code', code, game } : { mode: 'code', code });
          }
        }}
      >
        <input
          type="text"
          placeholder="ROOM CODE"
          maxLength={4}
          value={code}
          aria-label="Room code"
          onChange={(event) => set('code')(event.target.value.replace(/[^a-z0-9]/gi, ''))}
        />
        <button type="submit" className="secondary" disabled={busy || code.length !== 4}>
          {busy ? 'Connecting…' : 'Join'}
        </button>
      </form>
      <details className="fold server-fold" open={!!settings.server}>
        <summary>Server</summary>
        <label className="name">
          <span className="hint">
            Leave empty to play on this site, or paste a friend&apos;s tunnel address.
          </span>
          <input
            type="text"
            placeholder="e.g. something.trycloudflare.com"
            value={settings.server}
            onChange={(event) => set('server')(event.target.value.trim())}
          />
        </label>
      </details>
    </section>
  );
}

function LeftColumn({ hud, settings, setSettings, onPlay, busy, inv, onOpenCase }) {
  const [screen, setScreen] = useState(() =>
    new URLSearchParams(location.search).has('room')
      ? 'host'
      : settings.genre === 'tactical' || settings.genre === 'milsim' || settings.genre === 'warfare'
        ? 'main'
        : 'genre',
  );
  const set = (key) => (value) => setSettings({ ...settings, [key]: value });
  const back = () => setScreen('main');
  const error =
    hud.phase === 'error' && hud.message ? <p className="error">{hud.message}</p> : null;
  if (screen === 'genre') {
    return (
      <GenreScreen
        onPick={(id) => {
          setSettings({ ...settings, genre: id });
          setScreen('main');
        }}
      />
    );
  }
  const war = settings.genre === 'warfare';
  const mil = settings.genre === 'milsim' || war;
  if (screen === 'quick') {
    return (
      <>
        {error}
        {mil ? (
          <MilQuickScreen
            settings={settings}
            set={set}
            onPlay={onPlay}
            busy={busy}
            back={back}
            war={war}
          />
        ) : (
          <QuickScreen settings={settings} set={set} onPlay={onPlay} busy={busy} back={back} />
        )}
      </>
    );
  }
  if (screen === 'host') {
    return (
      <>
        {error}
        {mil ? (
          <MilHostScreen
            settings={settings}
            set={set}
            onPlay={onPlay}
            busy={busy}
            back={back}
            war={war}
          />
        ) : (
          <HostScreen settings={settings} set={set} onPlay={onPlay} busy={busy} back={back} />
        )}
      </>
    );
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        setSettings={setSettings}
        back={back}
        milsim={mil}
        war={war}
      />
    );
  }
  if (screen === 'boxes') {
    return <BoxesScreen inv={inv} back={back} onOpen={onOpenCase} />;
  }
  const boxes = Object.values(inv.boxes).reduce((accumulator, item) => accumulator + item, 0);
  return (
    <div className="screen">
      <h1>Headline</h1>
      <button
        type="button"
        className="genre-chip"
        onClick={() => setScreen('genre')}
        title="Change game type"
      >
        {war ? 'Warfare' : mil ? 'MilSim' : 'Tactical'} <small>change</small>
      </button>
      {error}
      <nav className="main-menu" aria-label="Main menu">
        <MenuItem
          title="Quick play"
          sub={
            war
              ? 'You and bots in a Conquest battle'
              : mil
                ? 'You and bots on Kestrel Valley'
                : 'You against bots'
          }
          onClick={() => setScreen('quick')}
        />
        <MenuItem
          title="Host a game"
          sub="Create a room for your friends"
          onClick={() => setScreen('host')}
        />
        {!mil && (
          <MenuItem
            title="Boxes"
            sub={
              boxes > 0
                ? `${boxes} case${boxes > 1 ? 's' : ''} to open`
                : 'Open cases for skins and knives'
            }
            badge={boxes}
            onClick={() => setScreen('boxes')}
          />
        )}
        <MenuItem
          title="Settings"
          sub="Mouse, video, audio and controls"
          onClick={() => setScreen('settings')}
        />
      </nav>
      <JoinByCode
        settings={settings}
        set={set}
        onPlay={onPlay}
        busy={busy}
        game={war ? 'warfare' : mil ? 'milsim' : null}
      />
    </div>
  );
}

export default function Menu({
  hud,
  settings,
  setSettings,
  onPlay,
  disabled,
  onPreview,
  onRotate,
  inv,
  audio,
}) {
  const [opening, setOpening] = useState(null);
  const equip = (item) => {
    if (item.skin === 'default') {
      setSettings({
        ...settings,
        loadouts: {
          T: { ...settings.loadouts.T, melee: item.weapon },
          CT: { ...settings.loadouts.CT, melee: item.weapon },
        },
      });
    } else {
      setSettings({ ...settings, skins: { ...settings.skins, [item.weapon]: item.skin } });
    }
    setOpening(null);
  };
  const [tab, setTab] = useState('loadout');
  const [skinFor, setSkinFor] = useState(null);
  const [viewing, setViewing] = useState(null);
  const picking = tab === 'loadout' ? skinFor : null;
  const shown = picking || (tab === 'loadout' ? viewing : null);
  useEffect(() => {
    onPreview?.(shown);
    return () => onPreview?.(null);
  }, [shown]);
  const connecting = hud.phase === 'connecting';
  const set = (key) => (value) => setSettings({ ...settings, [key]: value });
  return (
    <div className="menu">
      <div className="start">
        <div className="start-main">
          <LeftColumn
            hud={hud}
            settings={settings}
            setSettings={setSettings}
            onPlay={onPlay}
            busy={disabled || connecting}
            inv={inv}
            onOpenCase={(id) => {
              audio?.init();
              setOpening(id);
            }}
          />
        </div>
        <div
          className="start-center"
          title="Drag to rotate"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset.x = event.clientX;
          }}
          onPointerMove={(event) => {
            const last = event.currentTarget.dataset.x;
            if (last === undefined || last === '') {
              return;
            }
            onRotate?.(event.clientX - Number(last));
            event.currentTarget.dataset.x = event.clientX;
          }}
          onPointerUp={(event) => {
            event.currentTarget.dataset.x = '';
            onRotate?.(null);
          }}
          onPointerCancel={(event) => {
            event.currentTarget.dataset.x = '';
            onRotate?.(null);
          }}
        >
          {settings.genre === 'milsim' || settings.genre === 'warfare' ? (
            <span className="stage-label">
              <small>{settings.genre === 'warfare' ? 'Warfare' : 'MilSim'}</small>
              {settings.team === 'CT' ? 'BLUFOR' : 'OPFOR'}
            </span>
          ) : (
            <span className="stage-label">
              <small>
                {picking
                  ? 'Skin preview'
                  : { primary: 'Primary', secondary: 'Pistol', melee: 'Knife' }[
                      WEAPONS.find(
                        (weapon) =>
                          weapon.id === (shown || settings.loadouts[settings.team].primary),
                      )?.slot
                    ] || 'Primary'}
              </small>
              {
                WEAPONS.find(
                  (weapon) => weapon.id === (shown || settings.loadouts[settings.team].primary),
                )?.name
              }
            </span>
          )}
        </div>
        {settings.genre === 'milsim' || settings.genre === 'warfare' ? (
          <div className="start-side">
            <Tabs
              className="side-tabs"
              value="character"
              onChange={() => {}}
              tabs={[['character', 'Character']]}
            />
            <p className="hint">
              {settings.genre === 'warfare'
                ? 'Choose your uniform, face and skin tone. Weapons and attachments are picked on the deploy screen.'
                : 'Choose your uniform, face and skin tone. Weapons and gear are picked in-game at the arsenal.'}
            </p>
            <CharacterEditor look={settings.look} onChange={set('look')} hide={['head']} />
          </div>
        ) : (
          <div className="start-side">
            <Tabs
              className="side-tabs"
              value={tab}
              onChange={setTab}
              tabs={[
                ['loadout', 'Skins'],
                ['character', 'Character'],
                ['crosshair', 'Crosshair'],
              ]}
            />
            {tab === 'loadout' &&
              (picking ? (
                <SkinPicker
                  weaponId={picking}
                  skins={settings.skins}
                  onChange={set('skins')}
                  onClose={() => setSkinFor(null)}
                  inv={inv}
                />
              ) : (
                <Loadout
                  team={settings.team}
                  onTeam={set('team')}
                  value={settings.loadouts[settings.team]}
                  onChange={(loadout) =>
                    setSettings({
                      ...settings,
                      loadouts: { ...settings.loadouts, [settings.team]: loadout },
                    })
                  }
                  skins={Object.fromEntries(
                    Object.entries(settings.skins).filter(([weapon, skin]) =>
                      ownsSkin(inv, weapon, skin),
                    ),
                  )}
                  onSkin={setSkinFor}
                  onView={setViewing}
                  inv={inv}
                />
              ))}
            {tab === 'character' && <CharacterEditor look={settings.look} onChange={set('look')} />}
            {tab === 'crosshair' && (
              <CrosshairEditor cross={settings.cross} onChange={set('cross')} />
            )}
          </div>
        )}
      </div>
      {opening && (
        <CaseOpening
          caseId={opening}
          audio={audio}
          onEquip={equip}
          onClose={() => setOpening(null)}
        />
      )}
    </div>
  );
}
