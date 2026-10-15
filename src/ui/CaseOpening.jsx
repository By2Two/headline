import { useEffect, useRef, useState } from 'react';
import { inventory, rollFillerItem, rarityOf, itemName, RARITIES } from '../inventory.js';
import { weaponThumb } from './thumbs.js';

const CARD_FALLBACK_PX = 168;
const WIN_AT = 48;
const SPIN_MS = 7000;

function ReelCard({ it: item }) {
  const rarity = rarityOf(item.rarity);
  return (
    <div className="reel-card" style={{ '--rc': rarity.color }}>
      <img src={weaponThumb(item.weapon, item.skin, 200, 100)} alt="" draggable="false" />
      <span>{itemName(item)}</span>
    </div>
  );
}

export default function CaseOpening({ caseId, audio, onEquip, onClose }) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('spin');
  const [prize, setPrize] = useState(null);
  const reelRef = useRef(null);
  const boxRef = useRef(null);

  const [reel, setReel] = useState([]);
  const openedRound = useRef(-1);

  useEffect(() => {
    if (openedRound.current === round) {
      return;
    }
    openedRound.current = round;
    const won = inventory.open(caseId);
    setPrize(won);
    setReel(
      won
        ? Array.from({ length: WIN_AT + 6 }, (_, index) =>
            index === WIN_AT ? won : rollFillerItem(),
          )
        : [],
    );
  }, [round]);

  useEffect(() => {
    if (!prize || !reelRef.current || !boxRef.current) {
      return undefined;
    }
    setPhase('spin');
    const element = reelRef.current;
    const mid = boxRef.current.clientWidth / 2;
    const card =
      element.children.length > 1
        ? element.children[1].offsetLeft - element.children[0].offsetLeft
        : CARD_FALLBACK_PX;
    const jitter = (Math.random() - 0.5) * (card - 40);
    const target = -(WIN_AT * card + card / 2 - mid + jitter);
    element.style.transition = 'none';
    element.style.transform = 'translateX(0px)';
    void element.offsetWidth;
    element.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.08, 0.6, 0.12, 1)`;
    element.style.transform = `translateX(${target}px)`;

    let animationFrame;
    let last = -1;
    const loop = () => {
      const positionX = new DOMMatrix(getComputedStyle(element).transform).m41;
      const index = Math.floor((mid - positionX) / card);
      if (index !== last) {
        last = index;
        audio?.tick();
      }
      animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);
    let isCredited = false;
    const creditDuplicate = () => {
      if (!isCredited && prize.dup) {
        isCredited = true;
        inventory.creditCoins(prize.coins);
      }
    };
    const done = setTimeout(() => {
      cancelAnimationFrame(animationFrame);
      creditDuplicate();
      setPhase('result');
      audio?.reveal(RARITIES.findIndex((rarity) => rarity.id === prize.rarity));
    }, SPIN_MS + 250);
    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(done);
      creditDuplicate();
    };
  }, [prize, round]);

  const left = inventory.get().boxes[caseId] || 0;
  const currentRarity = prize && rarityOf(prize.rarity);
  return (
    <div className="case-overlay" role="dialog" aria-modal="true" aria-label="Opening case">
      <div className="case-box" ref={boxRef}>
        <div className="reel-window">
          <div className="reel" ref={reelRef}>
            {reel.map((item, index) => (
              <ReelCard key={`${round}-${index}`} it={item} />
            ))}
          </div>
          <i className="reel-marker" aria-hidden="true" />
        </div>

        {phase === 'result' && prize && (
          <div className="case-result" style={{ '--rc': currentRarity.color }}>
            <img src={weaponThumb(prize.weapon, prize.skin, 520, 260)} alt={itemName(prize)} />
            <small>{currentRarity.name}</small>
            <b>{itemName(prize)}</b>
            {prize.dup ? (
              <p className="hint dup-coins">
                Duplicate · Converted to <b>+{prize.coins} coins</b>
              </p>
            ) : (
              <p className="hint">Unlocked! It's now in your loadout options.</p>
            )}
            <div className="case-actions">
              {!prize.dup && (
                <button type="button" className="primary" onClick={() => onEquip(prize)}>
                  Equip
                </button>
              )}
              {left > 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRound((count) => count + 1)}
                >
                  Open another ({left})
                </button>
              )}
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
        {phase === 'spin' && (
          <button type="button" className="link case-skip" onClick={onClose} disabled>
            Opening…
          </button>
        )}
      </div>
    </div>
  );
}
