import { CharacterPreview } from './CharacterPreview';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { project, VN_MAP, vietnamIslands, vietnamPath } from '../data/vietnamMap';
import { cities, type City } from './cities';
import { greetingFor, useVietnamClock } from './vietnamTime';

function Clock({ compact = false }: { compact?: boolean }) {
  const { time, date } = useVietnamClock();
  return <div className={`vn-clock ${compact ? 'compact' : ''}`} aria-live="off">
    <span className="vn-clock-label"><i className="vn-flag" aria-hidden="true">★</i> GIỜ VIỆT NAM · GMT+7</span>
    <strong>{time}</strong>
    <small>{date}</small>
  </div>;
}

export function NameEntry({ initialName, onSubmit }: { initialName: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed.slice(0, 24));
  };
  return <section className="entry-screen name-screen">
    <div className="entry-backdrop" aria-hidden="true" />
    <header className="entry-top">
      <div className="brand"><span className="brand-stamp">ĐV</span><span>ĐỜI VIỆT<small>VIETNAM LIFE SIMULATOR</small></span></div>
      <Clock compact />
    </header>
    <form className="name-card" onSubmit={submit}>
      <span className="eyebrow"><span className="eyebrow-line" /> CHÀO MỪNG ĐẾN VỚI ĐỜI VIỆT</span>
      <h1>Chúng mình nên<br /><em>gọi bạn là gì?</em></h1>
      <p>Tên này sẽ hiện trong game và trên hành trình khám phá Việt Nam của bạn.</p>
      <label className="name-field">
        <span>Tên của bạn</span>
        <input ref={inputRef} value={name} maxLength={24} autoComplete="nickname" placeholder="Ví dụ: Đức Anh" onChange={(event) => setName(event.target.value)} />
      </label>
      <button className="primary-button" type="submit" disabled={!trimmed}>Tiếp tục <span>→</span></button>
    </form>
  </section>;
}

export function VietnamMap({ playerName, onEnter, onRename, onAbout }: { playerName: string; onEnter: (city: City) => void; onRename: () => void; onAbout: () => void }) {
  const [selected, setSelected] = useState<City>(cities[0]);
  const [toast, setToast] = useState<string | null>(null);
  const { now } = useVietnamClock();
  const toastTimer = useRef<number>(0);
  const placed = useMemo(() => cities.map((city) => {
    const [x, y] = project(city.lon, city.lat);
    return { city, left: (x / VN_MAP.width) * 100, top: (y / VN_MAP.height) * 100 };
  }), []);
  const islands = (lon: number, lat: number) => { const [x, y] = project(lon, lat); return { left: `${(x / VN_MAP.width) * 100}%`, top: `${(y / VN_MAP.height) * 100}%` }; };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const choose = (city: City) => {
    setSelected(city);
    if (!city.open) {
      setToast(city.id);
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 2200);
    }
  };

  return <section className="entry-screen map-screen">
    <div className="entry-backdrop" aria-hidden="true" />
    <header className="entry-top">
      <div className="brand"><span className="brand-stamp">ĐV</span><span>ĐỜI VIỆT<small>VIETNAM LIFE SIMULATOR</small></span></div>
      <nav className="entry-nav"><button onClick={onAbout}>Dự án</button><button onClick={onRename}>Đổi tên</button></nav>
    </header>

    <aside className="map-panel">
      <span className="eyebrow"><span className="eyebrow-line" /> {greetingFor(now).toUpperCase()}</span>
      <h1>Xin chào,<br /><em>{playerName}.</em></h1>
      <p>Chọn điểm đến đầu tiên trên bản đồ. Hiện tại Hà Nội đã mở; các tỉnh thành khác sẽ lần lượt ra mắt.</p>
      <Clock />
      <div className={`destination-card ${selected.open ? 'open' : 'locked'}`}>
        <span className="destination-region">{selected.region}{selected.open ? ' · ĐÃ MỞ' : ' · SẮP RA MẮT'}</span>
        <h2>{selected.name}</h2>
        <p>{selected.blurb}</p>
        {selected.open
          ? <button className="primary-button" onClick={() => onEnter(selected)}>Vào {selected.name} <span>↗</span></button>
          : <div className="coming-soon-note"><LockIcon /> Khu vực này sắp ra mắt</div>}
      </div>
      <div className="map-legend"><span><i className="legend-open" /> Đã mở</span><span><i className="legend-locked" /> Sắp ra mắt</span></div>
    </aside>

    <CharacterPreview name={playerName} />
    <div className="map-stage">
      <div className="vn-map" style={{ aspectRatio: `${VN_MAP.width} / ${VN_MAP.height}` }}>
        <svg viewBox={`0 0 ${VN_MAP.width.toFixed(1)} ${VN_MAP.height.toFixed(1)}`} role="img" aria-label="Bản đồ Việt Nam">
          <defs>
            <linearGradient id="vn-land" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#3f6b55" />
              <stop offset="1" stopColor="#2a5446" />
            </linearGradient>
            <filter id="vn-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <path d={vietnamPath} fill="#d9b678" opacity="0.18" filter="url(#vn-glow)" />
          <path d={vietnamPath} fill="url(#vn-land)" stroke="#e3c48f" strokeWidth="1.3" strokeLinejoin="round" />
          {vietnamIslands.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="2.2" fill="#e3c48f" />)}
          <text x="700" y="520" className="sea-label">BIỂN ĐÔNG</text>
        </svg>
        <span className="archipelago" style={islands(111.2, 17.3)}>QĐ. Hoàng Sa</span>
        <span className="archipelago" style={islands(113.6, 11.75)}>QĐ. Trường Sa</span>
        {placed.map(({ city, left, top }) => <div key={city.id} className={`city-marker ${city.open ? 'open' : 'locked'} label-${city.label} ${selected.id === city.id ? 'selected' : ''}`} style={{ left: `${left}%`, top: `${top}%` }}>
          <button aria-label={city.open ? `${city.name}, đã mở` : `${city.name}, sắp ra mắt`} onClick={() => choose(city)} onDoubleClick={() => city.open && onEnter(city)}>
            <span className="city-dot">{city.open ? null : <LockIcon />}</span>
            <span className="city-name">{city.name}</span>
          </button>
          {toast === city.id && <div className="coming-soon-toast" role="status"><LockIcon /> Sắp ra mắt</div>}
        </div>)}
      </div>
    </div>
  </section>;
}

function LockIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
