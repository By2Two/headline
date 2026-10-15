import { SKINS } from '../../shared/skins.js';
import { ownsSkin, skinRarity, rarityOf } from '../inventory.js';
import { WEAPONS } from '../../shared/weapons.js';

export default function SkinPicker({ weaponId, skins, onChange, onClose, inv }) {
  const weapon = WEAPONS.find((positionX) => positionX.id === weaponId);
  const current = skins[weaponId] || 'default';
  const pick = (id) => {
    const next = { ...skins };
    if (id === 'default') {
      delete next[weaponId];
    } else {
      next[weaponId] = id;
    }
    onChange(next);
  };
  return (
    <div className="skin-picker">
      <header>
        <button type="button" className="secondary back-btn" onClick={onClose}>
          ← Back
        </button>
        <h3>
          {weapon?.name} <small>skins</small>
        </h3>
      </header>
      <div className="skin-grid" role="radiogroup" aria-label={`${weapon?.name} skin`}>
        {SKINS.map((skin) => {
          const owned = ownsSkin(inv, weaponId, skin.id);
          const rar = skinRarity(skin.id);
          return (
            <button
              key={skin.id}
              type="button"
              role="radio"
              aria-checked={current === skin.id}
              disabled={!owned}
              title={owned ? skin.name : 'Locked: get it from a case'}
              className={`skin-tile ${current === skin.id ? 'on' : ''} ${owned ? '' : 'locked'}`}
              style={rar ? { '--rc': rarityOf(rar).color } : null}
              onClick={() => owned && pick(skin.id)}
            >
              <i style={{ background: skin.swatch }} />
              <span>
                {!owned && '🔒 '}
                {skin.name}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hint">
        Locked skins come from cases. Other players see your skins in the match.
      </p>
    </div>
  );
}
