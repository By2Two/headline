import { useEffect, useRef } from 'react';
import { DEFAULT_CROSS } from '../settings.js';

const vars = (crosshair, live) => ({
  '--len': `${crosshair.size}px`,
  '--thick': `${crosshair.thick}px`,
  ...(live ? null : { '--gap': `${crosshair.gap}px` }),
  '--c': crosshair.color,
  opacity: crosshair.alpha,
});

export default function Crosshair({ cross, engine }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!engine || !cross.dynamic) {
      return undefined;
    }
    let animationFrame;
    const loop = () => {
      if (ref.current) {
        ref.current.style.setProperty(
          '--gap',
          `${(cross.gap + Math.max(0, engine.crossGap - 4)).toFixed(1)}px`,
        );
      }
      animationFrame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrame);
  }, [engine, cross.dynamic, cross.gap]);
  return (
    <div
      className={`crosshair ${cross.outline ? 'outline' : ''}`}
      ref={ref}
      style={vars(cross, !!engine && cross.dynamic)}
    >
      {cross.size > 0 && (
        <>
          <i />
          <i />
          <i />
          <i />
        </>
      )}
      {cross.dot && <b />}
    </div>
  );
}

const COLORS = ['#7dffd8', '#4dff6a', '#ffd24a', '#ff4d6d', '#4db8ff', '#ffffff'];

export function CrosshairEditor({ cross, onChange }) {
  const set = (key, value) => onChange({ ...cross, [key]: value });
  const slider = (key, label, min, max, step = 1) => (
    <label>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={cross[key]}
        onChange={(event) => set(key, Number(event.target.value))}
      />
      <b>{key === 'alpha' ? `${Math.round(cross[key] * 100)}%` : cross[key]}</b>
    </label>
  );
  const toggle = (key, label) => (
    <label className="toggle">
      <input
        type="checkbox"
        checked={cross[key]}
        onChange={(event) => set(key, event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="cross-editor">
      <div className="cross-preview">
        <Crosshair cross={cross} />
      </div>
      <div className="swatches" role="radiogroup" aria-label="Color">
        {COLORS.map((crosshair) => (
          <button
            key={crosshair}
            type="button"
            role="radio"
            aria-checked={cross.color === crosshair}
            aria-label={crosshair}
            className={cross.color === crosshair ? 'on' : ''}
            style={{ background: crosshair }}
            onClick={() => set('color', crosshair)}
          />
        ))}
        <label className="custom-color" title="Custom color">
          <input
            type="color"
            value={cross.color}
            onChange={(event) => set('color', event.target.value)}
          />
        </label>
      </div>
      <div className="settings">
        {slider('size', 'Length', 0, 20)}
        {slider('thick', 'Thickness', 1, 6)}
        {slider('gap', 'Gap', 0, 16)}
        {slider('alpha', 'Opacity', 0.2, 1, 0.05)}
      </div>
      <div className="toggles">
        {toggle('outline', 'Outline')}
        {toggle('dot', 'Center dot')}
        {toggle('dynamic', 'Dynamic (opens with spread)')}
      </div>
      <button type="button" className="link" onClick={() => onChange({ ...DEFAULT_CROSS })}>
        Reset to default
      </button>
    </div>
  );
}
