import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { inventory, ownsSkin, ownsWeapon } from './inventory.js';
import { Engine } from './game/engine.js';
import { store } from './game/store.js';
import { loadSettings, saveSettings } from './settings.js';
import Menu, { Settings, Controls, MilControls, WarControls, MilGraphics } from './ui/Menu.jsx';
import RoomPanel from './ui/RoomPanel.jsx';
import CompLobby from './ui/CompLobby.jsx';
import Loadout from './ui/Loadout.jsx';
import { CrosshairEditor } from './ui/Crosshair.jsx';
import Tabs from './ui/Tabs.jsx';
import Hud from './ui/Hud.jsx';
import { teamKey } from '../shared/weapons.js';
import { whenSkinImagesReady } from './game/skins.js';

const MilsimHud = lazy(() => import('./ui/milsim/MilsimHud.jsx'));
const WarfareHud = lazy(() => import('./ui/warfare/WarfareHud.jsx'));

function loadoutStatus(hud, loadout) {
  if (!hud.alive) {
    return { kind: 'ok', text: "You're dead: you'll spawn with this loadout." };
  }
  const equipped = hud.equipped;
  if (
    equipped &&
    (equipped.primary !== loadout.primary ||
      equipped.secondary !== loadout.secondary ||
      equipped.melee !== loadout.melee)
  ) {
    return { kind: 'pending', text: 'Applies on your next respawn.' };
  }
  return { kind: 'ok', text: 'Equipped.' };
}

function MilPause({ hud, engine, settings, setSettings }) {
  const [tab, setTab] = useState('room');
  const isHost = hud.room && hud.room.host === hud.myId;
  const resume = () => {
    engine.audio.init();
    engine.store.set({ milPause: false });
    if (hud.alive) {
      engine.lock();
    }
  };
  return (
    <div className="pause">
      <div className="pause-panel">
        <header>
          <h2>Menu</h2>
          <div className="pause-actions">
            <button className="secondary" onClick={() => engine.leave()}>
              {isHost && !hud.room.solo ? 'Leave (closes room)' : 'Main menu'}
            </button>
            {hud.alive && (
              <button className="secondary" onClick={() => engine.net.send({ t: 'suicide' })}>
                Respawn
              </button>
            )}
            <button className="primary" onClick={resume}>
              {hud.alive ? 'Resume' : 'Back'}
            </button>
          </div>
        </header>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ['room', hud.room?.solo ? 'Bots' : 'Room'],
            ['settings', 'Settings'],
            ['controls', 'Controls'],
          ]}
        />
        <div className="tab-body">
          {tab === 'room' && <RoomPanel hud={hud} engine={engine} server={settings.server} />}
          {tab === 'settings' && (
            <>
              <Settings settings={settings} setSettings={setSettings} />
              <MilGraphics settings={settings} setSettings={setSettings} />
            </>
          )}
          {tab === 'controls' && (hud.game === 'warfare' ? <WarControls /> : <MilControls />)}
        </div>
      </div>
    </div>
  );
}

function Pause({ hud, engine, settings, setSettings }) {
  const hasLoadout = false;
  const [chosenTab, setTab] = useState(hasLoadout ? 'loadout' : 'room');
  const tab = !hasLoadout && chosenTab === 'loadout' ? 'room' : chosenTab;
  const isHost = hud.room && hud.room.host === hud.myId;
  const side = teamKey(hud.team);
  const set = (key) => (value) => setSettings({ ...settings, [key]: value });
  const resume = () => {
    engine.audio.init();
    engine.lock();
  };
  return (
    <div className="pause">
      <div className="pause-panel">
        <header>
          <h2>Menu</h2>
          <div className="pause-actions">
            <button className="secondary" onClick={() => engine.leave()}>
              {isHost && !hud.room.solo ? 'Leave (closes room)' : 'Main menu'}
            </button>
            <button className="primary" onClick={resume}>
              Resume
            </button>
          </div>
        </header>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ...(hasLoadout ? [['loadout', 'Select weapon']] : []),
            ['room', hud.room?.solo ? 'Bots' : 'Room'],
            ['crosshair', 'Crosshair'],
            ['settings', 'Settings'],
            ['controls', 'Controls'],
          ]}
        />
        <div className="tab-body">
          {tab === 'loadout' && hud.game === 'gungame' && (
            <p className="lo-status pending">
              Gun Game: your weapon comes from your level. Loadout changes apply in Team deathmatch.
            </p>
          )}
          {tab === 'loadout' && (
            <Loadout
              team={side}
              value={settings.loadouts[side]}
              onChange={(loadout) =>
                setSettings({ ...settings, loadouts: { ...settings.loadouts, [side]: loadout } })
              }
              status={loadoutStatus(hud, settings.loadouts[side])}
              inv={inventory.get()}
            />
          )}
          {tab === 'room' && <RoomPanel hud={hud} engine={engine} server={settings.server} />}
          {tab === 'crosshair' && (
            <CrosshairEditor cross={settings.cross} onChange={set('cross')} />
          )}
          {tab === 'settings' && <Settings settings={settings} setSettings={setSettings} />}
          {tab === 'controls' && <Controls />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [settings, setSettings] = useState(() => {
    const storedSettings = loadSettings();
    const params = new URLSearchParams(location.search);
    const code = (params.get('room') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 4);
    if (code) {
      storedSettings.code = code;
    }
    if (params.has('server')) {
      storedSettings.server = params.get('server') || '';
    }
    return storedSettings;
  });
  const hud = useSyncExternalStore(store.subscribe, store.get);
  const inv = useSyncExternalStore(inventory.subscribe, inventory.get);
  useEffect(() => inventory.ensureStarter(), []);
  const [, setSkinsReady] = useState(false);
  useEffect(() => {
    whenSkinImagesReady().then(() => setSkinsReady(true));
  }, []);

  const effective = useMemo(() => {
    const skins = Object.fromEntries(
      Object.entries(settings.skins || {}).filter(([weapon, skin]) => ownsSkin(inv, weapon, skin)),
    );
    const fixKnife = (loadout) =>
      ownsWeapon(inv, loadout.melee) ? loadout : { ...loadout, melee: 'knife' };
    return {
      ...settings,
      skins,
      loadouts: { T: fixKnife(settings.loadouts.T), CT: fixKnife(settings.loadouts.CT) },
    };
  }, [settings, inv]);

  const rewarded = useRef(false);
  useEffect(() => {
    const won = hud.game === 'gungame' ? hud.winId === hud.myId : hud.win === hud.team;
    if (hud.win < 0 || hud.game === 'milsim' || hud.game === 'warfare') {
      rewarded.current = false;
    }
    if (hud.game === 'milsim' || hud.game === 'warfare') {
      return;
    } else if (won && !rewarded.current) {
      rewarded.current = true;
      inventory.addBox('headline');
    }
  }, [hud.win, hud.team, hud.winId, hud.game]);

  const genre =
    settings.genre === 'milsim' ? 'milsim' : settings.genre === 'warfare' ? 'warfare' : 'tactical';
  useEffect(() => {
    let engine = null;
    let cancelled = false;
    (async () => {
      const Cls =
        genre === 'milsim'
          ? (await import('./game/milsim/engine.js')).MilsimEngine
          : genre === 'warfare'
            ? (await import('./game/warfare/engine.js')).WarfareEngine
            : Engine;
      if (cancelled) {
        return;
      }
      engine = new Cls(canvasRef.current, store, loadSettings());
      setEngine(engine);
    })();
    return () => {
      cancelled = true;
      if (engine) {
        engine.dispose();
      }
      setEngine(null);
    };
  }, [genre]);

  useEffect(() => {
    saveSettings(settings);
    if (engine) {
      engine.applySettings(effective);
    }
  }, [settings, effective, engine]);

  const play = (options) => {
    engine.audio.init();
    engine.connect(settings.name.trim(), { ...options, server: settings.server });
    engine.lock();
  };

  const showMenu = hud.phase === 'menu' || hud.phase === 'error' || hud.phase === 'connecting';
  const playing = hud.phase === 'playing';
  const lobby = playing && genre === 'tactical' && !!hud.room?.lobby;

  return (
    <div className="app">
      <canvas key={genre} ref={canvasRef} className="game" />
      {engine && playing && genre === 'tactical' && (
        <Hud hud={hud} engine={engine} cross={settings.cross} />
      )}
      {engine && playing && genre === 'milsim' && (
        <Suspense fallback={null}>
          <MilsimHud hud={hud} engine={engine} />
        </Suspense>
      )}
      {engine && playing && genre === 'warfare' && (
        <Suspense fallback={null}>
          <WarfareHud hud={hud} engine={engine} />
        </Suspense>
      )}
      {showMenu && (
        <Menu
          hud={hud}
          settings={settings}
          setSettings={setSettings}
          onPlay={play}
          disabled={!engine}
          onPreview={(id) => engine?.previewWeapon(id)}
          onRotate={(deltaX) => engine?.rotateLobby(deltaX)}
          inv={inv}
          audio={engine?.audio}
        />
      )}
      {lobby && engine && <CompLobby hud={hud} engine={engine} server={settings.server} />}
      {playing && genre === 'tactical' && !lobby && !hud.locked && !hud.buyOpen && (
        <Pause hud={hud} engine={engine} settings={settings} setSettings={setSettings} />
      )}
      {playing &&
        (genre === 'milsim' || genre === 'warfare') &&
        engine &&
        ((hud.alive && !hud.locked && !hud.milUiOpen && !hud.mil?.mapOpen && !hud.mil?.downed) ||
          hud.milPause) && (
          <MilPause hud={hud} engine={engine} settings={settings} setSettings={setSettings} />
        )}
    </div>
  );
}
