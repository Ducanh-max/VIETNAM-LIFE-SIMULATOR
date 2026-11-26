import { useEffect, useState } from 'react';
import { bagStore, eatSeconds, itemOf, kindOf, putAway, seatState, standUp, takeOut, useBag, type BagItem } from '../game/bag';
import { BOOK_PAGES } from '../game/books';
import { shopById } from '../game/shops';
import { formatVnd, game, player } from '../game/state';

const ICON: Record<string, string> = { food: '🍜', drink: '🥤', book: '📖' };
const icon = (b: BagItem) => (shopById(b.shop).kind === 'banhmi' && b.item !== 'suadau' ? '🥖' : shopById(b.shop).kind === 'coffee' ? '☕' : ICON[kindOf(b)]);

/** The balo button (also B) and what is inside: take things out to eat, drink or read. */
export function Backpack() {
  const open = useBag((s) => s.open);
  const items = useBag((s) => s.items);
  const held = useBag((s) => s.held);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyB' || e.repeat || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (document.pointerLockElement) document.exitPointerLock();
      bagStore.set({ open: !bagStore.get().open });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // group identical things: "Bánh mì pate × 2"
  const groups = new Map<string, BagItem[]>();
  for (const b of items) { const k = `${b.shop}:${b.item}`; groups.set(k, [...(groups.get(k) ?? []), b]); }
  return <>
    <button className="bag-button" aria-label="Mở balo (B)" onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); bagStore.set({ open: !open }); }}>
      <span aria-hidden="true">🎒</span>{items.length > 0 && <i>{items.length}</i>}<small>B</small>
    </button>
    {open && <div className="bag-panel" role="dialog" aria-label="Balo">
      <header><strong>🎒 Balo</strong><span>{items.length} món</span><button aria-label="Đóng balo" onClick={() => bagStore.set({ open: false })}>✕</button></header>
      {held && <div className="bag-held">
        <span>Đang cầm: <b>{itemOf(held).name}</b></span>
        <button onClick={() => putAway()}>Cất vào balo</button>
      </div>}
      {items.length === 0 && <p className="bag-empty">Balo trống. Mua bánh mì, phở, cà phê hay sách ở các quán phố Đinh Tiên Hoàng (cạnh Bún chả Đức Anh), hoặc đặt app Food: đồ mua sẽ được cất vào đây.</p>}
      <ul>{[...groups.values()].map((list) => {
        const b = list[0]; const it = itemOf(b); const k = kindOf(b); const holding = held?.uid !== undefined && list.some((x) => x.uid === held.uid);
        return <li key={`${b.shop}:${b.item}`}>
          <span className="bag-icon" aria-hidden="true">{icon(b)}</span>
          <span className="bag-name"><strong>{it.name}{list.length > 1 && ` × ${list.length}`}</strong><small>{k === 'book' ? (BOOK_PAGES[b.item]?.author ?? '') : `${shopById(b.shop).name} · ${it.hunger ? `+${it.hunger} no ` : ''}${it.thirst ? `+${it.thirst} nước` : ''}`}</small></span>
          <button disabled={holding} onClick={() => takeOut((list.find((x) => x.uid !== held?.uid) ?? b).uid)}>{k === 'book' ? 'Lấy ra đọc' : k === 'drink' ? 'Uống' : 'Ăn'}</button>
        </li>;
      })}</ul>
      <footer>Sách: lấy ra rồi lại gần ghế đá / ghế đẩu, bấm E để ngồi đọc. Ăn uống: lấy ra là ăn ngay ({held && held.kind !== 'book' ? `${eatSeconds(held)} giây` : 'vài giây'}).</footer>
    </div>}
    <Reader />
  </>;
}

/** Reading a book sitting down: the pages from books.ts, turned with the arrows. */
function Reader() {
  const held = useBag((s) => s.held);
  const page = useBag((s) => s.page);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 300); return () => clearInterval(t); }, []);
  if (!held || held.kind !== 'book' || !player.seat) return null;
  const book = BOOK_PAGES[held.item]; if (!book) return null;
  const it = itemOf(held);
  const last = book.pages.length - 1;
  const go = (d: number) => bagStore.set({ page: Math.max(0, Math.min(last, page + d)) });
  return <div className="reader" role="dialog" aria-label={`Đọc ${it.name}`}>
    <span className="reader-kicker">{book.author.toUpperCase()}</span>
    <h3>{it.name}</h3>
    <p className="reader-page">{book.pages[page]}</p>
    <div className="reader-nav">
      <button disabled={page === 0} onClick={() => go(-1)}>‹ Trang trước</button>
      <span>{page + 1} / {book.pages.length}</span>
      <button disabled={page === last} onClick={() => go(1)}>Trang sau ›</button>
    </div>
    <div className="reader-actions">
      <button onClick={() => { putAway(); game.toast(`Đã cất "${it.name}" vào balo.`); }}>Gấp sách, cất vào balo</button>
      {seatState.mine && <button onClick={() => standUp()}>Đứng dậy</button>}
    </div>
    <small>Giá {formatVnd(it.price)} · ngồi ghế đá bên hồ đọc là đẹp nhất</small>
  </div>;
}
