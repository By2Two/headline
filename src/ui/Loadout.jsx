import { useEffect, useState } from 'react';
import {
  PRIMARIES,
  SECONDARIES,
  MELEES,
  GRENADES,
  WEAPONS,
  allowedFor,
} from '../../shared/weapons.js';
import { skinOfId } from '../../shared/skins.js';
import { ownsWeapon } from '../inventory.js';

const CATEGORIES = [
  ['rifle', 'Rifles', 'primary', (weapon) => weapon.class === 'rifle'],
  ['sniper', 'Snipers', 'primary', (weapon) => weapon.class === 'sniper'],
  ['smg', 'SMGs', 'primary', (weapon) => weapon.class === 'smg'],
  ['shotgun', 'Shotguns', 'primary', (weapon) => weapon.class === 'shotgun'],
  ['mg', 'Heavy', 'primary', (weapon) => weapon.class === 'mg'],
  ['pistol', 'Pistols', 'secondary', () => true],
  ['melee', 'Knife', 'melee', () => true],
  ['grenade', 'Grenades', 'grenade', () => true],
];
const POOL = { primary: PRIMARIES, secondary: SECONDARIES, melee: MELEES, grenade: GRENADES };
const SIDES = [
  ['T', 'TR', 'Terrorists'],
  ['CT', 'CT', 'Counter-Terrorists'],
];
const SLOT_KEY = { primary: 1, secondary: 2, melee: 3, grenade: 4 };

const stats = (weapon) =>
  weapon.grenade
    ? [
        ['Damage', weapon.dmg / 100],
        ['Area', weapon.grenade === 'smoke' ? 0.85 : 0.65],
        ['Duration', weapon.grenade === 'smoke' ? 1 : 0.08],
        ['Throw', 0.8],
      ]
    : weapon.melee
      ? [
          ['Damage', weapon.dmg / 100],
          ['Speed', 0.5 / (60 / weapon.rpm)],
          ['Mobility', (weapon.moveMult - 0.75) / 0.33],
          ['Reach', weapon.reach / 3],
        ]
      : [
          ['Damage', Math.min(1, (weapon.dmg * (weapon.pellets ? weapon.pellets * 0.6 : 1)) / 115)],
          ['Fire rate', Math.min(1, weapon.rpm / 860)],
          ['Mobility', Math.max(0.05, (weapon.moveMult - 0.75) / 0.27)],
          ['Magazine', Math.min(1, Math.log2(weapon.mag + 1) / Math.log2(151))],
        ];

function WeaponCard({ w: weapon, selected, onSelect, skin, onSkin }) {
  const skinInfo = skinOfId(skin);
  return (
    <div className="wcard-wrap">
      <button
        type="button"
        className={`wcard ${selected ? 'on' : ''}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="wcard-head">
          <b>{weapon.name}</b>
          {selected && <em className="equipped-tag">Equipped</em>}
        </span>
        <span className="wdesc">{weapon.desc}</span>
        <span className="wbars">
          {stats(weapon).map(([label, value]) => (
            <span key={label} className="wbar">
              <small>{label}</small>
              <i>
                <i style={{ width: `${Math.round(Math.max(0.04, Math.min(1, value)) * 100)}%` }} />
              </i>
            </span>
          ))}
        </span>
      </button>
      {onSkin && (
        <button
          type="button"
          className="skin-btn"
          style={{ background: skinInfo.swatch }}
          title={`Skin: ${skinInfo.name}`}
          aria-label={`Customize ${weapon.name} skin (${skinInfo.name})`}
          onClick={() => onSkin(weapon.id)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13.5 1.5l1 1-6.5 6.5-1.6.6.6-1.6 6.5-6.5zM5 10.5c1.4 0 2 1 2 2 0 1.6-1.6 2-3.5 2-.9 0-1.5-.2-2-.5.8-.4 1-1 1.1-1.7.2-1 .9-1.8 2.4-1.8z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Loadout({
  value,
  onChange,
  status,
  skins = {},
  onSkin,
  team = 'T',
  onTeam,
  onView,
  inv,
  skinsOnly = false,
}) {
  const [preview, setPreview] = useState(null);
  const byId = (id) => WEAPONS.find((weapon) => weapon.id === id);
  const [cat, setCat] = useState(
    () =>
      CATEGORIES.find(
        ([, , slot, filter]) =>
          slot === 'primary' && byId(value.primary) && filter(byId(value.primary)),
      )?.[0] || 'rifle',
  );
  const [, , slot, filter] = CATEGORIES.find((category) => category[0] === cat);
  const list = POOL[slot].filter(
    (weapon) => filter(weapon) && allowedFor(weapon, team) && (!inv || ownsWeapon(inv, weapon.id)),
  );
  const pickable = !skinsOnly || slot === 'melee';
  const viewing = pickable
    ? value[slot]
    : list.some((weapon) => weapon.id === preview)
      ? preview
      : list[0]?.id;
  useEffect(() => {
    onView?.(viewing);
  }, [viewing]);
  const equippedCat = ([, , slot, filter]) => {
    const weapon = byId(value[slot]);
    return !!weapon && filter(weapon) && (!skinsOnly || slot === 'melee');
  };
  return (
    <div className={`loadout side-${team}`}>
      <div className="team-tabs" role="tablist" aria-label="Side">
        {SIDES.map(([id, short, long]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={team === id}
            className={`side-tab ${id} ${team === id ? 'on' : ''}`}
            disabled={!onTeam && team !== id}
            title={!onTeam && team !== id ? 'You are playing on the other side' : long}
            onClick={() => onTeam?.(id)}
          >
            <b>{short}</b>
            <span>{long}</span>
          </button>
        ))}
      </div>

      {skinsOnly ? (
        <p className="hint">
          Pick a weapon to change its skin. Weapons are chosen in-game with <kbd>B</kbd>.
        </p>
      ) : (
        <div className="equipped">
          {['primary', 'secondary', 'melee', 'grenade'].map((slot) => (
            <span key={slot}>
              <kbd>{SLOT_KEY[slot]}</kbd>
              {byId(value[slot])?.name}
            </span>
          ))}
        </div>
      )}

      <div className="cat-tabs" role="tablist" aria-label="Weapon type">
        {CATEGORIES.map((category) => (
          <button
            key={category[0]}
            type="button"
            role="tab"
            aria-selected={cat === category[0]}
            className={cat === category[0] ? 'on' : ''}
            onClick={() => setCat(category[0])}
          >
            {category[1]}
            {equippedCat(category) && <i className="cat-dot" aria-label="equipped" />}
          </button>
        ))}
      </div>

      <div className="wgrid">
        {list.map((weapon) => (
          <WeaponCard
            key={weapon.id}
            w={weapon}
            selected={pickable && value[slot] === weapon.id}
            onSelect={() => {
              if (pickable) {
                onChange({ ...value, [slot]: weapon.id });
              } else {
                setPreview(weapon.id);
                onSkin?.(weapon.id);
              }
            }}
            skin={skins[weapon.id]}
            onSkin={onSkin}
          />
        ))}
        {!list.length && <p className="hint">No weapons of this type for this side.</p>}
      </div>
      {status && <p className={`lo-status ${status.kind}`}>{status.text}</p>}
    </div>
  );
}
