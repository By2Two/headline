import { HEADGEAR, OUTFITS, FACES, SKINS } from '../../shared/look.js';

const hex = (color) => `#${color.toString(16).padStart(6, '0')}`;

function Choice({ title, list, value, onPick, swatch }) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="chips" role="radiogroup" aria-label={title}>
        {list.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            className={`chip ${value === option.id ? 'on' : ''}`}
            onClick={() => onPick(option.id)}
          >
            {swatch && <i style={{ background: hex(swatch(option)) }} />}
            {option.name}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function CharacterEditor({ look, onChange, hide = [] }) {
  const set = (field) => (id) => onChange({ ...look, [field]: id });
  return (
    <div className="char-editor">
      {!hide.includes('head') && (
        <Choice title="Headgear" list={HEADGEAR} value={look.head} onPick={set('head')} />
      )}
      <Choice
        title="Outfit"
        list={OUTFITS}
        value={look.outfit}
        onPick={set('outfit')}
        swatch={(option) => option.suit}
      />
      <Choice title="Face" list={FACES} value={look.face} onPick={set('face')} />
      <Choice
        title="Skin tone"
        list={SKINS}
        value={look.skin}
        onPick={set('skin')}
        swatch={(option) => option.color}
      />
    </div>
  );
}
