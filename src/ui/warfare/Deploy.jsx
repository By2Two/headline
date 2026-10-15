import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CLASSES,
  CLASS_IDS,
  OPTICS,
  opticsFor,
  builtInOptic,
  milPrimaries,
  milSecondaries,
  defaultKit,
  sanitizeKit,
  weaponStats,
  ITEMS,
  SQUADS,
  SQUAD_SIZE,
  SQUAD_COLORS,
  TEAM_COLORS,
  TEAM_NAMES,
} from '../../../shared/warfare/config.js';
import { MW, mw, ATTACH, attachFor } from '../../../shared/warfare/weapons.js';
import { BUILDERS } from '../../game/guns.js';
import { attachOptic } from '../../game/warfare/gear.js';
import { MIL_BUILDERS, attachGear } from '../../game/warfare/items.js';
import MilMap from './MilMap.jsx';

const KITS_KEY = 'headline-warfare-kits';
const PRESETS_KEY = 'headline-warfare-presets';
const load = (key, definition) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? definition;
  } catch {
    return definition;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const CLASS_TAG = {
  rifle: 'Assault rifle',
  smg: 'Submachine gun',
  sniper: 'Sniper rifle',
  mg: 'Light machine gun',
  shotgun: 'Shotgun',
  pistol: 'Pistol',
};
const SLOTS = [
  ['optic', 'Optic'],
  ['muzzle', 'Barrel'],
  ['grip', 'Underbarrel'],
  ['mag', 'Magazine'],
  ['rail', 'Side'],
];
const STATS = [
  ['damage', 'Damage'],
  ['accuracy', 'Accuracy'],
  ['control', 'Control'],
  ['range', 'Range'],
  ['rate', 'Fire rate'],
  ['mobility', 'Mobility'],
];

function WeaponPreview({ kit }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe0b0, 1.1);
    rim.position.set(-3, 1, -2);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 30);
    const pivot = new THREE.Group();
    scene.add(pivot);
    const state = {
      renderer,
      scene,
      camera,
      pivot,
      yaw: -Math.PI / 2 + 0.55,
      pitch: 0.12,
      auto: true,
      idle: 0,
      gun: null,
    };
    stateRef.current = state;
    let animationFrame = 0;
    const loop = () => {
      animationFrame = requestAnimationFrame(loop);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (
        width &&
        height &&
        (canvas.width !== Math.round(width * renderer.getPixelRatio()) ||
          canvas.height !== Math.round(height * renderer.getPixelRatio()))
      ) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        state.fit?.();
      }
      if (state.auto) {
        state.yaw += 0.0065;
      } else if (performance.now() - state.idle > 3500) {
        state.auto = true;
      }
      pivot.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
      renderer.render(scene, camera);
    };
    loop();
    let drag = null;
    const down = (event) => {
      drag = { x: event.clientX, y: event.clientY };
      state.auto = false;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event) => {
      if (!drag) {
        return;
      }
      state.yaw += (event.clientX - drag.x) * 0.012;
      state.pitch = Math.max(-0.6, Math.min(0.9, state.pitch + (event.clientY - drag.y) * 0.006));
      drag = { x: event.clientX, y: event.clientY };
      state.idle = performance.now();
    };
    const handlePointerUp = () => {
      drag = null;
      state.idle = performance.now();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    return () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      scene.traverse((object) => object.geometry?.dispose());
      renderer.dispose();
    };
  }, []);
  const sig = JSON.stringify(kit.primary);
  useEffect(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }
    if (state.gun) {
      state.pivot.remove(state.gun);
      state.gun.traverse((object) => object.geometry?.dispose());
      state.gun = null;
    }
    const weapon = mw(kit.primary.id);
    const build = BUILDERS[weapon?.id] || MIL_BUILDERS[weapon?.id];
    if (!weapon || !build) {
      return;
    }
    const built = build(false);
    const group = built.group;
    const optic = builtInOptic(weapon, kit.primary.optic) || kit.primary.optic;
    attachOptic(group, optic, { muzzleZ: built.muzzle.z, builtIn: !!builtInOptic(weapon) });
    attachGear(group, kit.primary, built.muzzle.clone());
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);
    state.gun = group;
    state.pivot.add(group);
    const size = box.getSize(new THREE.Vector3());
    state.fit = () => {
      const half = Math.max(size.z, size.x) / 2 + 0.04;
      const tangent = Math.tan((state.camera.fov * Math.PI) / 360);
      const distance =
        Math.max(
          half / (tangent * Math.max(0.5, state.camera.aspect)),
          (size.y / 2 + 0.05) / tangent,
        ) * 1.18;
      state.camera.position.set(0, 0, distance);
      state.camera.lookAt(0, 0, 0);
    };
    state.fit();
  }, [sig]);
  return <canvas ref={canvasRef} className="wf-dp-canvas" title="Drag to rotate" />;
}

function Bar({ label, v: value }) {
  return (
    <li>
      <span>{label}</span>
      <i>
        <u style={{ width: `${value}%` }} />
      </i>
      <b>{value}</b>
    </li>
  );
}

export default function Deploy({ hud, engine, mil }) {
  const team = mil.team;
  const spawns = mil.spawns || [];
  const [picked, setPicked] = useState('main');
  const [kit, setKit] = useState(() => mil.nextKit);
  const [presets, setPresets] = useState(() => load(PRESETS_KEY, [null, null, null, null]));
  const [primaryIndex, setPi] = useState(0);
  const firstKit = useRef(true);
  useEffect(() => {
    if (JSON.stringify(mil.nextKit) !== JSON.stringify(kit)) {
      setKit(mil.nextKit);
    }
  }, [JSON.stringify(mil.nextKit)]);
  useEffect(() => {
    if (!spawns.find((spawn) => spawn.id === picked && spawn.ok)) {
      setPicked(
        spawns.find((spawn) => spawn.kind === 'main' && spawn.ok)?.id ||
          spawns.find((spawn) => spawn.ok)?.id ||
          'main',
      );
    }
  }, [spawns.map((spawn) => `${spawn.id}${spawn.ok}`).join()]);
  useEffect(() => {
    if (firstKit.current) {
      firstKit.current = false;
      return;
    }
    const memory = load(KITS_KEY, {});
    memory[kit.cls] = kit;
    save(KITS_KEY, memory);
  }, [JSON.stringify(kit)]);

  const weapon = mw(kit.primary.id);
  const optic = builtInOptic(weapon, kit.primary.optic) || kit.primary.optic;
  const stats = weaponStats(weapon, kit.primary, optic);
  const edit = (callback) => {
    const next = sanitizeKit(callback(JSON.parse(JSON.stringify(kit))), team);
    setKit(next);
    engine.setNextKit(next);
  };
  const pickClass = (id) => {
    if (id === kit.cls) {
      return;
    }
    engine.setClass(id);
    const saved = load(KITS_KEY, {})[id];
    if (saved) {
      const next = sanitizeKit({ ...saved, uniform: kit.uniform }, team);
      setKit(next);
      engine.setNextKit(next);
    }
  };
  const can = mil.respawnIn <= 0 && hud.win < 0;
  const groups = [
    ['Base', spawns.filter((spawn) => spawn.kind === 'main')],
    ['Flags', spawns.filter((spawn) => spawn.kind === 'sector')],
    ['Squad', spawns.filter((spawn) => spawn.kind === 'squad')],
    ['Beacons', spawns.filter((spawn) => spawn.kind === 'beacon')],
    ['Vehicles', spawns.filter((spawn) => spawn.kind === 'veh')],
  ];
  const prims = milPrimaries(team, kit.cls);
  const secs = milSecondaries(team);
  const options = (slot) => {
    if (slot === 'optic') {
      const currentBuiltInOptic = builtInOptic(weapon);
      return currentBuiltInOptic && weapon.class !== 'sniper'
        ? []
        : opticsFor(weapon).map((id) => OPTICS.find((object) => object.id === id));
    }
    return attachFor(weapon, slot).map((id) => ATTACH[slot].find((option) => option.id === id));
  };
  const nameOf = (slot, id) =>
    slot === 'optic'
      ? OPTICS.find((object) => object.id === id)?.name
      : ATTACH[slot].find((option) => option.id === id)?.name;
  const descOf = (slot, id) =>
    slot === 'optic'
      ? `${OPTICS.find((object) => object.id === id)?.zoom}× view`
      : ATTACH[slot].find((option) => option.id === id)?.desc;
  const gadgets = Object.entries(kit.items)
    .filter(
      ([id, count]) =>
        count > 0 &&
        [
          'he',
          'smoke',
          'medkit',
          'ammobag',
          'medbag',
          'beacon',
          'shovel',
          'rocket',
          'binos',
        ].includes(id),
    )
    .map(([id, count]) => `${count}× ${ITEMS[id].name}`);
  if (kit.launcher) {
    gadgets.push('RPG-7');
  }
  if (kit.cls === 'engineer') {
    gadgets.push('Repair tool');
  }

  return (
    <div className="wf-deploy">
      <header className="wf-dp-head">
        <h2>Deploy</h2>
        <span className="wf-dp-side-tag" style={{ background: TEAM_COLORS[team] }}>
          {TEAM_NAMES[team]}
        </span>
        <span className="wf-dp-tk">
          Tickets <b>{mil.tickets?.[team] ?? 0}</b> · Enemy <b>{mil.tickets?.[1 - team] ?? 0}</b>
        </span>
        <button
          type="button"
          className="secondary"
          onClick={() => engine.store.set({ milPause: true })}
        >
          Menu
        </button>
      </header>
      <div className="wf-dp-cols">
        <section className="wf-dp-map">
          <div className="wf-dp-mapbox">
            <MilMap mil={mil} spawns={spawns} picked={picked} onPick={setPicked} compact />
          </div>
          <div className="wf-dp-spawns">
            {groups.map(
              ([title, list]) =>
                list.length > 0 && (
                  <div key={title}>
                    <h4>{title}</h4>
                    <ul>
                      {list.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={picked === item.id ? 'on' : ''}
                            disabled={!item.ok}
                            onClick={() => setPicked(item.id)}
                          >
                            <b>{item.name}</b>
                            <span>{item.ok ? '' : item.why}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        </section>

        <section className="wf-dp-kit">
          <nav className="wf-dp-classes" aria-label="Class">
            {CLASS_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={kit.cls === id ? 'on' : ''}
                onClick={() => pickClass(id)}
              >
                <b>{CLASSES[id].name}</b>
                <small>
                  {CLASSES[id].weapons.map((center) => CLASS_TAG[center] || center).join(' · ')}
                </small>
              </button>
            ))}
          </nav>
          <div className="wf-dp-main">
            <div className="wf-dp-view">
              <WeaponPreview kit={kit} />
              <div className="wf-dp-wname">
                <b>{weapon?.name}</b>
                <small>{CLASS_TAG[weapon?.class]}</small>
              </div>
            </div>
            <ul className="wf-dp-stats">
              {STATS.map(([key, label]) => (
                <Bar key={key} label={label} v={stats?.[key] ?? 0} />
              ))}
            </ul>
          </div>
          <div className="wf-dp-weapons" role="radiogroup" aria-label="Primary weapon">
            {prims.map((prim) => (
              <button
                key={prim.id}
                type="button"
                role="radio"
                aria-checked={kit.primary.id === prim.id}
                className={kit.primary.id === prim.id ? 'on' : ''}
                onClick={() =>
                  edit((key) => {
                    key.primary = {
                      id: prim.id,
                      optic: key.primary.optic,
                      muzzle: 'none',
                      rail: 'none',
                      grip: 'none',
                      mag: 'none',
                    };
                    return key;
                  })
                }
              >
                {prim.name}
              </button>
            ))}
          </div>
          <div className="wf-dp-att">
            {SLOTS.map(([slot, label]) => {
              const list = options(slot);
              const current = slot === 'optic' ? optic : kit.primary[slot];
              return (
                <div key={slot} className="wf-dp-slot">
                  <h4>{label}</h4>
                  {list.length === 0 ? (
                    <p className="wf-dp-fixed">{nameOf('optic', optic)} (built in)</p>
                  ) : (
                    <div className="wf-dp-chips" role="radiogroup" aria-label={label}>
                      {list.map((object) => (
                        <button
                          key={object.id}
                          type="button"
                          role="radio"
                          aria-checked={current === object.id}
                          className={current === object.id ? 'on' : ''}
                          title={descOf(slot, object.id)}
                          onClick={() =>
                            edit((key) => {
                              key.primary[slot] = object.id;
                              return key;
                            })
                          }
                        >
                          {object.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="wf-dp-desc">{list.length ? descOf(slot, current) : ''}</p>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="wf-dp-side">
          <h4>Sidearm</h4>
          <div className="wf-dp-chips">
            {secs.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className={kit.secondary?.id === sec.id ? 'on' : ''}
                onClick={() =>
                  edit((key) => {
                    key.secondary = { id: sec.id, rail: 'none' };
                    return key;
                  })
                }
              >
                {sec.name}
              </button>
            ))}
          </div>
          <h4>Gear</h4>
          <p className="wf-dp-gear">{gadgets.join(' · ') || 'Standard issue'}</p>
          {mil.squad && (
            <>
              <h4>Squad</h4>
              <div className="wf-dp-sq" role="radiogroup" aria-label="Squad">
                {mil.squad.squads.map((squad, index) => (
                  <button
                    key={squad.name}
                    type="button"
                    role="radio"
                    aria-checked={index === mil.squad.sq}
                    className={index === mil.squad.sq ? 'on' : ''}
                    style={{ borderBottomColor: SQUAD_COLORS[index] }}
                    onClick={() => engine.joinSquad(index)}
                  >
                    {SQUADS[index]}
                    <small>
                      {squad.n}/{SQUAD_SIZE}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
          <h4>Presets</h4>
          <ul className="wf-dp-presets">
            {presets.map((preset, index) => (
              <li key={index} className={primaryIndex === index ? 'on' : ''}>
                <button
                  type="button"
                  className="load"
                  disabled={!preset}
                  onClick={() => {
                    setPi(index);
                    const next = sanitizeKit({ ...preset.kit, uniform: kit.uniform }, team);
                    setKit(next);
                    engine.setNextKit(next);
                  }}
                >
                  {preset ? preset.name : `Slot ${index + 1} · empty`}
                </button>
                <button
                  type="button"
                  className="save"
                  onClick={() => {
                    const name = `${CLASSES[kit.cls].name} · ${weapon.name}`;
                    const next = presets.map((positionX, key) =>
                      key === index ? { name, kit } : positionX,
                    );
                    setPresets(next);
                    save(PRESETS_KEY, next);
                    setPi(index);
                  }}
                >
                  Save
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="primary wf-dp-go"
            disabled={!can}
            onClick={() => engine.deploy(picked)}
          >
            {hud.win >= 0 ? 'Battle over' : can ? 'Deploy' : `Deploy in ${mil.respawnIn}s`}
          </button>
        </aside>
      </div>
    </div>
  );
}

void defaultKit;
void MW;
