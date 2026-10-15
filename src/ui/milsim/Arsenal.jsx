import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mw, caliberOf, AMMO, ammoFor, ATTACH, attachFor } from '../../../shared/milsim/weapons.js';
import {
  milPrimaries,
  milSecondaries,
  opticsFor,
  OPTICS,
  VESTS,
  HELMETS,
  PACKS,
  ITEMS,
  CLASSES,
  CLASS_IDS,
  sanitizeKit,
  defaultKit,
  kitCost,
  kitWeight,
  weightEffects,
  milClass,
  builtInOptic,
  MIL,
  capacityOf,
  usedSlots,
  encodeGear,
} from '../../../shared/milsim/config.js';
import { OUTFITS, DEFAULT_LOOK } from '../../../shared/look.js';
import { weaponThumb } from '../thumbs.js';
import { CharacterRig } from '../../game/character.js';
import { applyMilGear, attachOptic } from '../../game/milsim/gear.js';
import { attachGear, registerMilBuilders } from '../../game/milsim/items.js';

registerMilBuilders();
const CLASS_NAME = {
  rifle: 'Rifles',
  smg: 'SMGs',
  sniper: 'Sniper rifles',
  mg: 'Machine guns',
  shotgun: 'Shotguns',
};
const byId = (list, id) => list.find((option) => option.id === id);

function CharPreview({ kit, look = DEFAULT_LOOK }) {
  const ref = useRef(null);
  const stateRef = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 3);
    scene.add(key);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    cam.position.set(0, 1.15, 4.3);
    cam.lookAt(0, 0.95, 0);
    const rig = new CharacterRig(look, { lowReady: true });
    scene.add(rig.root);
    stateRef.current = { r: renderer, scene, cam, rig, raf: 0, yaw: Math.PI + 0.35, drag: null };
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const deltaTime = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = stateRef.current;
      state.rig.root.rotation.y = state.yaw;
      state.rig.update(deltaTime, {});
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (
        canvas.width !== Math.round(width * renderer.getPixelRatio()) ||
        canvas.height !== Math.round(height * renderer.getPixelRatio())
      ) {
        renderer.setSize(width, height, false);
        cam.aspect = width / height;
        cam.updateProjectionMatrix();
      }
      renderer.render(scene, cam);
      state.raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(stateRef.current.raf);
      rig.dispose();
      renderer.dispose();
    };
  }, []);
  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    applyMilGear(state.rig, encodeGear({ ...kit, uniform: look.outfit || kit.uniform }), look);
    state.rig.setWeapon(kit.primary.id);
    const weapon = mw(kit.primary.id);
    if (state.rig.weapon && weapon) {
      const muzzleZ = state.rig.muzzle ? state.rig.muzzle.z : -0.6;
      attachOptic(state.rig.weapon, builtInOptic(weapon, kit.primary.optic) || kit.primary.optic, {
        muzzleZ: muzzleZ,
        builtIn: !!builtInOptic(weapon),
      });
      attachGear(state.rig.weapon, kit.primary, new THREE.Vector3(0, 0.012, muzzleZ));
    }
  }, [JSON.stringify(kit), JSON.stringify(look)]);
  const down = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (stateRef.current) {
      stateRef.current.drag = event.clientX;
    }
  };
  const move = (event) => {
    const state = stateRef.current;
    if (!state || (state.drag ?? null) === null) {
      return;
    }
    state.yaw += (event.clientX - state.drag) * 0.012;
    state.drag = event.clientX;
  };
  const handlePointerUp = () => {
    if (stateRef.current) {
      stateRef.current.drag = null;
    }
  };
  return (
    <canvas
      ref={ref}
      className="ars-3d"
      title="Drag to rotate"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ cursor: 'grab', touchAction: 'none' }}
    />
  );
}

function Tile({ on, onClick, children, title, disabled }) {
  return (
    <button
      type="button"
      className={`ars-tile ${on ? 'on' : ''}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Count({ label, value, max, onChange, note }) {
  return (
    <div className="ars-count">
      <span>
        {label}
        {note && <em>{note}</em>}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label={`fewer ${label}`}
        disabled={value <= 0}
      >
        −
      </button>
      <b>{value}</b>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label={`more ${label}`}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}

export default function Arsenal({ mil, src: source, onClose, onEquip, onResupply, look }) {
  const team = mil?.team ?? 0;
  const [kit, setKit] = useState(() =>
    sanitizeKit(source === 'spawn' ? mil?.nextKit : mil?.kit || mil?.nextKit, team),
  );
  const [tab, setTab] = useState('class');
  const upd = (patch) => setKit((option) => sanitizeKit({ ...option, ...patch }, team));
  const prim = mw(kit.primary.id);
  const sec = kit.secondary ? mw(kit.secondary.id) : null;
  const groups = useMemo(() => {
    const groups = {};
    for (const weapon of milPrimaries(team, kit.cls)) {
      (groups[weapon.class] ||= []).push(weapon);
    }
    return groups;
  }, [team, kit.cls]);
  const cost = kitCost(kit);
  const weight = kitWeight(kit);
  const effects = weightEffects(weight);
  const cap = capacityOf(kit);
  const used = usedSlots(kit);
  const area = mil?.area;
  const free = source === 'main';
  const store = source === 'crate' ? (area?.store ?? 0) : null;
  const afford = free || source === 'spawn' || store >= cost;
  const classInfo = milClass(prim);
  const builtIn = builtInOptic(prim);
  const classId = CLASSES[kit.cls];
  const addMag = (weapon, ammo) =>
    upd({ mags: [...kit.mags, { w: weapon.id, ammo: ammo || ammoFor(weapon)[0] }] });
  const setItem = (key, count) => upd({ items: { ...kit.items, [key]: count } });
  const itemMax = (key) => {
    const item = ITEMS[key];
    if (item.cls && item.cls !== kit.cls) {
      return 0;
    }
    if (key === 'he' && classId.extra?.he) {
      return classId.extra.he;
    }
    if (key === 'rocket' && !kit.launcher) {
      return 0;
    }
    return item.max;
  };

  const slot = (id, label, value, cls2, onClick) => (
    <button
      type="button"
      className={`doll-slot ${cls2} ${tab === id ? 'on' : ''}`}
      onClick={onClick || (() => setTab(id))}
    >
      <small>{label}</small>
      <b>{value}</b>
    </button>
  );

  return (
    <div className="arsenal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="ars2">
        <header>
          <div>
            <h2>Arsenal · {classId.name}</h2>
            <p className="hint">
              {source === 'main' && 'Main base: everything is free.'}
              {source === 'crate' &&
                `Ammo crate at ${area?.name || 'this base'} · Gear costs supply (${Math.round(store ?? 0)} available)`}
              {source === 'spawn' &&
                `Kit for your next spawn · Away from the main base it costs supply (+${MIL.spawnCost} per spawn)`}
            </p>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close <kbd>Esc</kbd>
          </button>
        </header>

        <div className="ars2-body">
          <section className="doll">
            <svg viewBox="0 0 200 360" className="doll-svg" aria-hidden="true">
              <circle cx="100" cy="42" r="24" />
              <rect x="70" y="72" width="60" height="110" rx="14" />
              <rect x="40" y="80" width="22" height="100" rx="10" />
              <rect x="138" y="80" width="22" height="100" rx="10" />
              <rect x="74" y="182" width="22" height="140" rx="10" />
              <rect x="104" y="182" width="22" height="140" rx="10" />
            </svg>
            {slot('gear', 'Helmet', byId(HELMETS, kit.helmet).name, 's-head')}
            {slot('gear', 'NVG', kit.items.nvg ? 'Night vision' : 'None', 's-nvg', () =>
              setTab('items'),
            )}
            {slot('gear', 'Vest', byId(VESTS, kit.vest).name, 's-vest')}
            {slot('gear', 'Backpack', byId(PACKS, kit.pack).name, 's-pack')}
            {slot(
              'gear',
              'Uniform',
              `${OUTFITS.find((option) => option.id === (look?.outfit || kit.uniform))?.name || ''}${kit.ghillie ? ' + ghillie' : ' (menu)'}`,
              's-legs',
            )}
            <div className={`doll-slot s-prim ${tab === 'weapons' ? 'on' : ''}`}>
              <button type="button" className="doll-main" onClick={() => setTab('weapons')}>
                <small>Primary</small>
                <img src={weaponThumb(prim.id, 'default', 150, 60)} alt="" />
                <b>{prim.name}</b>
              </button>
              <div className="doll-att">
                {['optic', 'muzzle', 'rail', 'grip'].map((state) => (
                  <button
                    key={state}
                    type="button"
                    className={`att ${tab === 'attach' ? 'on' : ''}`}
                    onClick={() => setTab('attach')}
                    title={state}
                  >
                    <small>{state}</small>
                    <b>
                      {state === 'optic'
                        ? builtIn
                          ? 'built-in'
                          : byId(OPTICS, kit.primary.optic).name.replace(' sights', '')
                        : byId(ATTACH[state], kit.primary[state])?.name || 'None'}
                    </b>
                  </button>
                ))}
              </div>
            </div>
            {slot('sidearm', 'Sidearm', sec ? sec.name : 'None', 's-sec')}
            {classId.launcher &&
              slot('launcher', 'Back', kit.launcher ? 'RPG-7' : 'None', 's-back')}
          </section>

          <section className="ars2-pick">
            <nav className="tabs ars2-tabs">
              {[
                ['class', 'Class'],
                ['weapons', 'Primary'],
                ['attach', 'Attachments'],
                ['ammo', 'Magazines'],
                ['sidearm', 'Sidearm'],
                ...(classId.launcher ? [['launcher', 'Launcher']] : []),
                ['gear', 'Gear'],
                ['items', 'Items'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={tab === id ? 'on' : ''}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="ars2-tab">
              {tab === 'class' && (
                <div className="ars-classes">
                  {CLASS_IDS.map((id) => (
                    <Tile
                      key={id}
                      on={kit.cls === id}
                      onClick={() =>
                        setKit(
                          sanitizeKit(
                            {
                              ...defaultKit(team, id),
                              uniform: kit.uniform,
                              helmet: kit.helmet,
                              vest: kit.vest,
                              pack: kit.pack,
                            },
                            team,
                          ),
                        )
                      }
                    >
                      <b>{CLASSES[id].name}</b>
                      <span>{CLASSES[id].desc}</span>
                    </Tile>
                  ))}
                </div>
              )}
              {tab === 'weapons' && (
                <>
                  {Object.entries(groups).map(([key, list]) => (
                    <div key={key} className="ars-group">
                      <small>{CLASS_NAME[key] || key}</small>
                      <div className="ars-guns">
                        {list.map((weapon) => (
                          <Tile
                            key={weapon.id}
                            on={kit.primary.id === weapon.id}
                            onClick={() =>
                              upd({
                                primary: { ...kit.primary, id: weapon.id },
                                mags: [
                                  ...kit.mags.filter(
                                    (magnitude) => caliberOf(magnitude.w) !== caliberOf(prim.id),
                                  ),
                                  ...kit.mags
                                    .filter(
                                      (magnitude) => caliberOf(magnitude.w) === caliberOf(prim.id),
                                    )
                                    .map((magnitude) => ({ ...magnitude, w: weapon.id })),
                                ],
                              })
                            }
                          >
                            <img src={weaponThumb(weapon.id, 'default', 150, 60)} alt="" />
                            <span>{weapon.name}</span>
                            <em>{caliberOf(weapon.id)}</em>
                          </Tile>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="ars-stats">
                    <span>
                      Muzzle velocity <b>{classInfo.v} m/s</b>
                    </span>
                    <span>
                      Weight <b>{classInfo.kg} kg</b>
                    </span>
                    <span>
                      Effective range <b>{classInfo.range} m</b>
                    </span>
                    <span>
                      Zeroing{' '}
                      <b>
                        {classInfo.zero
                          ? `${classInfo.zero[0]} to ${classInfo.zero[classInfo.zero.length - 1]} m`
                          : 'None'}
                      </b>
                    </span>
                  </div>
                  <p className="hint">Add optics and attachments in the Attachments tab.</p>
                </>
              )}
              {tab === 'attach' && (
                <>
                  <h3>Optic</h3>
                  {builtIn && opticsFor(prim).length === 1 ? (
                    <p className="hint">Built-in optic: {byId(OPTICS, builtIn).name}.</p>
                  ) : (
                    <div className="ars-choices">
                      {OPTICS.filter((option) => opticsFor(prim).includes(option.id)).map(
                        (option) => (
                          <Tile
                            key={option.id}
                            on={kit.primary.optic === option.id}
                            onClick={() => upd({ primary: { ...kit.primary, optic: option.id } })}
                          >
                            <b>{option.name}</b>
                            <em>
                              {option.cost ? `${option.cost} supply` : 'free'}
                              {option.mag
                                ? ` · ${option.zoomRange ? `${option.zoomRange[0]}–${option.zoomRange[1]}x` : `${option.zoom}x`}`
                                : ''}
                            </em>
                          </Tile>
                        ),
                      )}
                    </div>
                  )}
                  {['muzzle', 'rail', 'grip'].map((state) => (
                    <div key={state}>
                      <h3>
                        {state === 'rail' ? 'Rail' : state === 'muzzle' ? 'Muzzle' : 'Underbarrel'}
                      </h3>
                      <div className="ars-choices">
                        {ATTACH[state]
                          .filter((attachment) => attachFor(prim, state).includes(attachment.id))
                          .map((attachment) => (
                            <Tile
                              key={attachment.id}
                              on={kit.primary[state] === attachment.id}
                              onClick={() =>
                                upd({ primary: { ...kit.primary, [state]: attachment.id } })
                              }
                              title={attachment.desc}
                            >
                              <b>{attachment.name}</b>
                              <em>{attachment.cost ? `${attachment.cost} supply` : 'free'}</em>
                            </Tile>
                          ))}
                      </div>
                    </div>
                  ))}
                  {sec && (
                    <>
                      <h3>Sidearm rail</h3>
                      <div className="ars-choices">
                        {ATTACH.rail.map((attachment) => (
                          <Tile
                            key={attachment.id}
                            on={kit.secondary.rail === attachment.id}
                            onClick={() =>
                              upd({ secondary: { ...kit.secondary, rail: attachment.id } })
                            }
                          >
                            <b>{attachment.name}</b>
                          </Tile>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {tab === 'ammo' && (
                <>
                  {[prim, sec].filter(Boolean).map((weapon) => (
                    <div key={weapon.id} className="ars-ammo">
                      <h3>
                        {weapon.name} · {caliberOf(weapon.id)} · {weapon.mag}-round magazine
                      </h3>
                      <div className="ars-addmag">
                        {ammoFor(weapon).map((attachment) => (
                          <button
                            key={attachment}
                            type="button"
                            className="secondary"
                            onClick={() => addMag(weapon, attachment)}
                            disabled={used >= cap}
                            title={AMMO[attachment].name}
                          >
                            + {AMMO[attachment].short}
                          </button>
                        ))}
                      </div>
                      <div className="ars-mags">
                        {kit.mags.map((magnitude, index) =>
                          caliberOf(magnitude.w) === caliberOf(weapon.id) ? (
                            <div key={index} className="ars-mag">
                              <select
                                value={magnitude.ammo}
                                onChange={(event) =>
                                  upd({
                                    mags: kit.mags.map((positionX, key) =>
                                      key === index
                                        ? { ...positionX, ammo: event.target.value }
                                        : positionX,
                                    ),
                                  })
                                }
                              >
                                {ammoFor(weapon).map((attachment) => (
                                  <option key={attachment} value={attachment}>
                                    {AMMO[attachment].name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  upd({ mags: kit.mags.filter((_, key) => key !== index) })
                                }
                                aria-label="remove magazine"
                              >
                                ×
                              </button>
                            </div>
                          ) : null,
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="hint">
                    FMJ: Standard · AP: Pierces armor · Tracer: Visible shots · HP: More damage to
                    unarmored targets · Subsonic: Quiet with a suppressor
                  </p>
                </>
              )}
              {tab === 'sidearm' && (
                <div className="ars-guns small">
                  <Tile
                    on={!kit.secondary}
                    onClick={() =>
                      upd({
                        secondary: null,
                        mags: kit.mags.filter(
                          (magnitude) => caliberOf(magnitude.w) === caliberOf(prim.id),
                        ),
                      })
                    }
                  >
                    <span>None</span>
                  </Tile>
                  {milSecondaries(team).map((weapon) => (
                    <Tile
                      key={weapon.id}
                      on={kit.secondary?.id === weapon.id}
                      onClick={() =>
                        upd({
                          secondary: { id: weapon.id, rail: kit.secondary?.rail || 'none' },
                          mags: [
                            ...kit.mags.filter(
                              (magnitude) => !sec || caliberOf(magnitude.w) !== caliberOf(sec.id),
                            ),
                            { w: weapon.id, ammo: 'fmj' },
                            { w: weapon.id, ammo: 'fmj' },
                          ],
                        })
                      }
                    >
                      <img src={weaponThumb(weapon.id, 'default', 110, 50)} alt="" />
                      <span>{weapon.name}</span>
                      <em>{caliberOf(weapon.id)}</em>
                    </Tile>
                  ))}
                </div>
              )}
              {tab === 'launcher' && (
                <>
                  <div className="ars-choices">
                    <Tile
                      on={!kit.launcher}
                      onClick={() => upd({ launcher: '', items: { ...kit.items, rocket: 0 } })}
                    >
                      <b>None</b>
                    </Tile>
                    <Tile
                      on={kit.launcher === 'rpg'}
                      onClick={() =>
                        upd({
                          launcher: 'rpg',
                          items: { ...kit.items, rocket: Math.max(1, kit.items.rocket) },
                        })
                      }
                    >
                      <b>RPG-7</b>
                      <em>15 supply · 6.3 kg · 4 slots</em>
                    </Tile>
                  </div>
                  {kit.launcher && (
                    <Count
                      label="HEAT rockets"
                      note=" (3 slots each)"
                      value={kit.items.rocket}
                      max={itemMax('rocket')}
                      onChange={(value) => setItem('rocket', value)}
                    />
                  )}
                  <p className="hint">One rocket is loaded in the launcher.</p>
                </>
              )}
              {tab === 'gear' && (
                <>
                  <h3>Helmet</h3>
                  <div className="ars-choices">
                    {HELMETS.map((option) => (
                      <Tile
                        key={option.id}
                        on={kit.helmet === option.id}
                        onClick={() => upd({ helmet: option.id })}
                      >
                        <b>{option.name}</b>
                        <em>
                          {option.kg} kg · {option.cost ? `${option.cost} supply` : 'free'}
                        </em>
                      </Tile>
                    ))}
                  </div>
                  <h3>Body armor</h3>
                  <div className="ars-choices">
                    {VESTS.map((option) => (
                      <Tile
                        key={option.id}
                        on={kit.vest === option.id}
                        onClick={() => upd({ vest: option.id })}
                      >
                        <b>{option.name}</b>
                        <em>
                          {option.kg} kg · +{option.slots} slots ·{' '}
                          {option.cost ? `${option.cost} supply` : 'free'}
                        </em>
                      </Tile>
                    ))}
                  </div>
                  <h3>Backpack</h3>
                  <div className="ars-choices">
                    {PACKS.map((option) => (
                      <Tile
                        key={option.id}
                        on={kit.pack === option.id}
                        onClick={() => upd({ pack: option.id })}
                      >
                        <b>{option.name}</b>
                        <em>
                          +{option.slots} slots · {option.kg} kg
                        </em>
                      </Tile>
                    ))}
                  </div>
                  {kit.cls === 'sniper' && (
                    <>
                      <h3>Ghillie suit</h3>
                      <div className="ars-choices">
                        <Tile on={!kit.ghillie} onClick={() => upd({ ghillie: false })}>
                          <b>No ghillie</b>
                          <em>Just the uniform</em>
                        </Tile>
                        <Tile on={!!kit.ghillie} onClick={() => upd({ ghillie: true })}>
                          <b>Ghillie suit</b>
                          <em>Sniper only · 2.5 kg · Blends into grass</em>
                        </Tile>
                      </div>
                    </>
                  )}
                  <p className="hint">Your uniform is set in the main menu.</p>
                </>
              )}
              {tab === 'items' && (
                <div className="ars-items">
                  {Object.entries(ITEMS)
                    .filter(([key]) => key !== 'rocket')
                    .map(([key, item]) => {
                      const max = itemMax(key);
                      const locked = max === 0;
                      return (
                        <div key={key} className={locked ? 'locked' : ''}>
                          {item.max > 1 ? (
                            <Count
                              label={item.name}
                              note={
                                locked
                                  ? ` (${CLASSES[item.cls]?.name} only)`
                                  : item.size
                                    ? ` · ${item.size} slot${item.size > 1 ? 's' : ''}`
                                    : ''
                              }
                              value={kit.items[key]}
                              max={max}
                              onChange={(value) => setItem(key, value)}
                            />
                          ) : (
                            <label className="ars-check">
                              <input
                                type="checkbox"
                                disabled={locked}
                                checked={!!kit.items[key]}
                                onChange={(event) => setItem(key, event.target.checked ? 1 : 0)}
                              />{' '}
                              {item.name}
                              {locked && <em> ({CLASSES[item.cls]?.name} only)</em>}
                            </label>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="ars-inv">
              <div className="ars-inv-head">
                <b>Inventory</b>
                <span className={used > cap ? 'warn' : ''}>
                  {used} / {cap} slots
                </span>
                <div className="mbar">
                  <i style={{ width: `${Math.min(100, Math.round((used / cap) * 100))}%` }} />
                </div>
              </div>
              <div className="ars-inv-grid">
                {kit.mags.map((magnitude, index) => (
                  <button
                    key={`m${index}`}
                    type="button"
                    className="inv-cell mag"
                    title={`${mw(magnitude.w)?.name} magazine · ${AMMO[magnitude.ammo]?.name} (click to remove)`}
                    onClick={() => upd({ mags: kit.mags.filter((_, key) => key !== index) })}
                  >
                    <small>{caliberOf(magnitude.w)}</small>
                    <b>{AMMO[magnitude.ammo]?.short}</b>
                  </button>
                ))}
                {Object.entries(kit.items).flatMap(([key, count]) =>
                  ITEMS[key]?.size
                    ? Array.from({ length: count }, (_, innerIndex) => (
                        <button
                          key={`${key}${innerIndex}`}
                          type="button"
                          className={`inv-cell it-${key}`}
                          style={{ gridColumn: `span ${Math.min(3, ITEMS[key].size)}` }}
                          title={`${ITEMS[key].name} (click to remove)`}
                          onClick={() => setItem(key, count - 1)}
                        >
                          <b>{ITEMS[key].name}</b>
                        </button>
                      ))
                    : [],
                )}
                {kit.launcher && (
                  <button
                    type="button"
                    className="inv-cell it-rpg"
                    style={{ gridColumn: 'span 4' }}
                    onClick={() => upd({ launcher: '', items: { ...kit.items, rocket: 0 } })}
                    title="RPG-7 (click to remove)"
                  >
                    <b>RPG-7</b>
                  </button>
                )}
              </div>
              <div className="ars-quickmag">
                <button
                  type="button"
                  className="secondary"
                  disabled={used >= cap}
                  onClick={() => addMag(prim)}
                >
                  + Magazine for {prim.name}
                </button>
                {sec && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={used >= cap}
                    onClick={() => addMag(sec)}
                  >
                    + Magazine for {sec.name}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="ars2-char">
            <CharPreview kit={kit} look={look} />
            <div className="ars-total">
              <span>
                Cost <b>{free ? 'free' : `${cost} supply`}</b>
              </span>
              <span>
                Weight <b className={weight > 30 ? 'heavy' : ''}>{weight} kg</b>
              </span>
              <span>
                Speed <b>{Math.round(effects.speed * 100)}%</b>
              </span>
              <span>
                Stamina use <b>{Math.round(effects.drain * 100)}%</b>
              </span>
            </div>
            <div className="ars-actions">
              {source === 'crate' && (
                <button type="button" className="secondary" onClick={onResupply}>
                  Just resupply ({MIL.resupplyCost})
                </button>
              )}
              <button
                type="button"
                className="primary"
                disabled={!afford}
                onClick={() => onEquip(kit)}
              >
                {source === 'spawn' ? 'Use this kit' : afford ? 'Equip' : 'Not enough supply'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
