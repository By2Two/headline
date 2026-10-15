import { BUY_MENU } from '../../shared/econ.js';
import { WEAPONS } from '../../shared/weapons.js';

const byId = (id) =>
  id === 'vest' ? { name: 'Kevlar Vest (+25)' } : WEAPONS.find((weapon) => weapon.id === id);

export default function BuyMenu({ hud, engine }) {
  const info = engine.buyInfo();
  const free = hud.game !== 'comp';
  const side = hud.team === 0 ? 'Terrorists' : 'Counter-Terrorists';
  return (
    <div className="buymenu" role="dialog" aria-label="Buy menu">
      <header>
        <b>{free ? 'Equipment' : 'Buy'}</b>
        <span className={`t${hud.team}`}>{side}</span>
        {free ? (
          <em className="buy-money">You respawn with this</em>
        ) : (
          <em className="buy-money">${hud.money.toLocaleString('en-US')}</em>
        )}
        <button type="button" className="buy-close" onClick={() => engine.closeBuy()}>
          Close <kbd>B</kbd>
        </button>
      </header>
      {!hud.canBuy && <p className="buy-closed">Buy time is over</p>}
      <div className="buy-cols">
        {BUY_MENU.map(([cat, ids]) => {
          const list = ids.filter((id) => info[id]?.side);
          if (!list.length) {
            return null;
          }
          return (
            <section key={cat}>
              <h3>{cat}</h3>
              {list.map((id) => {
                const item = info[id];
                const ok = hud.canBuy && item.afford && !item.owned;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`buy-item ${item.owned ? 'owned' : ''}`}
                    disabled={!ok}
                    onClick={() => engine.buy(id)}
                  >
                    <span>{byId(id)?.name}</span>
                    <b className={item.afford ? '' : 'poor'}>
                      {item.owned
                        ? free
                          ? 'Equipped'
                          : 'Owned'
                        : free
                          ? 'Equip'
                          : `${item.price}`}
                    </b>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
