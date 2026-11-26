import { useState } from 'react';
import { DevicePicker } from './MobileControls';
import { AccountForm } from './AccountPanel';
import { accountsReady, signOut, useAccount } from '../game/account';
import { makeCode, MAX_PLAYERS } from '../game/net';

/*
 * The front door of the game: a welcome, a few slides about what there is to do, then "Bắt đầu chơi"
 * → play offline (straight in) or with friends (a private room: copy the link, send it, go in).
 * Anyone arriving through an invite link (?room=CODE) gets a short welcome and goes straight into that room.
 */
const SLIDES: { icon: string; title: string; text: string }[] = [
  { icon: '🗺️', title: 'Hà Nội thật, theo bản đồ thật', text: 'Hồ Gươm, phố cổ, khu phố Pháp và đường tới Lotte được dựng từ dữ liệu OpenStreetMap: hơn 3.700 tuyến đường, 18.000 toà nhà, biển báo và đèn giao thông.' },
  { icon: '🍜', title: 'Ăn bún chả, uống trà đá', text: 'Đói và khát giảm dần khi đi lại. Ghé quán Bún chả Đức Anh bên hồ, gọi món, tự rót nước, ăn từng miếng như ngoài đời.' },
  { icon: '🛵', title: 'Đi làm kiếm tiền', text: 'Nhận việc ship bún chả bằng xe máy của quán, hoặc làm tài xế Đen SM (xe máy hay ô tô), đón khách và nhận cước theo quãng đường.' },
  { icon: '🔑', title: 'Thuê xe, gọi xe', text: 'Thuê xe máy hoặc ô tô 5 chỗ ở Thuê Xe Hồ Gươm, tính tiền theo thời gian. Hoặc mở app Đen SM trên điện thoại để gọi xe đi bất cứ đâu.' },
  { icon: '🏙️', title: 'Lên đỉnh Lotte 65 tầng', text: 'Đi thang máy từ sảnh lên đài quan sát tầng 65 của Lotte Center Hà Nội và ngắm toàn thành phố từ độ cao 260 m.' },
  { icon: '👥', title: 'Chơi cùng bạn bè', text: `Tạo phòng riêng, gửi link cho bạn bè: tối đa ${MAX_PLAYERS} người cùng đi dạo, chở nhau bằng xe máy (2 chỗ) hoặc ô tô (5 chỗ).` },
];
const inviteLink = (code: string) => `${location.origin}${location.pathname}?room=${code}#play`;

type Stage = 'welcome' | 'slides' | 'account' | 'choose' | 'friends';
export function Welcome({ playerName, invite, onRename, onStart }: {
  playerName: string; invite: string; onRename: () => void;
  /** Enter the game; `room` = join that private room, null = offline. */
  onStart: (room: string | null) => void;
}) {
  const [stage, setStageRaw] = useState<Stage>('welcome');
  const user = useAccount((s) => s.user);
  const name = useAccount((s) => s.name);
  const guest = useAccount((s) => s.guest);
  // before choosing how to play: sign in / sign up, unless already signed in or playing as a guest
  const setStage = (s: Stage) => setStageRaw(s === 'choose' && accountsReady && !user && !guest ? 'account' : s);
  const [slide, setSlide] = useState(0);
  const [code] = useState(() => makeCode());
  const [copied, setCopied] = useState(false);
  const copy = (c: string) => { void navigator.clipboard?.writeText(inviteLink(c)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); };

  if (invite) return <div className="welcome">
    <div className="welcome-card">
      <span className="welcome-kicker">ĐỜI VIỆT · HÀ NỘI 3D</span>
      <h1>Chào mừng, {playerName}!</h1>
      <p>Bạn được mời vào phòng chơi riêng <b className="welcome-code">{invite}</b>. Bạn bè trong phòng đang đợi bên Hồ Gươm.</p>
      <button className="welcome-primary" onClick={() => onStart(invite)}>Vào phòng chơi cùng bạn bè →</button>
      <button className="welcome-link" onClick={() => onStart(null)}>Chơi một mình (offline)</button>
      <button className="welcome-link small" onClick={onRename}>Đổi tên</button>
    </div>
  </div>;

  return <div className="welcome">
    {stage === 'welcome' && <div className="welcome-card hero">
      <span className="welcome-kicker">XIN CHÀO, {playerName.toUpperCase()}</span>
      <h1>Chào mừng đến với<br /><em>ĐỜI VIỆT – Hà Nội 3D</em></h1>
      <p>Một ngày ở Hà Nội: dạo quanh Hồ Gươm, ăn bún chả, chạy xe máy qua phố cổ, đi làm kiếm tiền và lên đỉnh Lotte, một mình hoặc cùng bạn bè.</p>
      <button className="welcome-primary" onClick={() => setStage('slides')}>Khám phá →</button>
      <button className="welcome-link" onClick={() => setStage('choose')}>Bỏ qua giới thiệu</button>
      <button className="welcome-link small" onClick={onRename}>Đổi tên</button>
    </div>}

    {stage === 'slides' && <div className="welcome-card">
      <div className="welcome-slide" key={slide}>
        <div className="welcome-icon">{SLIDES[slide].icon}</div>
        <h2>{SLIDES[slide].title}</h2>
        <p>{SLIDES[slide].text}</p>
      </div>
      <div className="welcome-dots">{SLIDES.map((_, i) => <button key={i} className={i === slide ? 'on' : ''} aria-label={`Trang ${i + 1}`} onClick={() => setSlide(i)} />)}</div>
      <div className="welcome-nav">
        <button className="welcome-ghost" disabled={slide === 0} onClick={() => setSlide(slide - 1)}>← Trước</button>
        {slide < SLIDES.length - 1
          ? <button className="welcome-ghost" onClick={() => setSlide(slide + 1)}>Tiếp →</button>
          : <button className="welcome-primary inline" onClick={() => setStage('choose')}>Bắt đầu chơi</button>}
      </div>
      <button className="welcome-link" onClick={() => setStage('choose')}>Bỏ qua</button>
    </div>}

    {stage === 'account' && <div className="welcome-card">
      <span className="welcome-kicker">TÀI KHOẢN</span>
      <h2>Đăng nhập / Đăng ký</h2>
      <p>Có tài khoản thì tên của bạn hiện trong phòng chơi chung. Không muốn cũng được, chơi luôn không cần tài khoản.</p>
      <AccountForm onDone={() => setStageRaw('choose')} onGuest={() => setStageRaw('choose')} />
    </div>}

    {stage === 'choose' && <div className="welcome-card">
      {user && <p className="welcome-account">Đã đăng nhập: <b>{name}</b> · <button className="welcome-link small inline" onClick={() => void signOut()}>Đăng xuất</button></p>}
      <span className="welcome-kicker">BẮT ĐẦU CHƠI</span>
      <h2>Bạn muốn chơi thế nào?</h2>
      <div className="welcome-choices">
        <button onClick={() => setStage('friends')}><span>👥</span><b>Chơi với bạn bè</b><small>Tạo phòng riêng, gửi link mời, tối đa {MAX_PLAYERS} người</small></button>
        <button onClick={() => onStart(null)}><span>🎮</span><b>Chơi offline</b><small>Vào game ngay, chơi một mình</small></button>
      </div>
      <DevicePicker />
      <button className="welcome-link" onClick={() => setStage('slides')}>← Xem lại giới thiệu</button>
    </div>}

    {stage === 'friends' && <div className="welcome-card">
      <span className="welcome-kicker">PHÒNG RIÊNG CỦA BẠN</span>
      <h2>Mời bạn bè cùng chơi</h2>
      <p>Gửi link này cho bạn bè. Ai mở link sẽ vào thẳng phòng của bạn.</p>
      <div className="welcome-room"><span>Mã phòng</span><strong>{code}</strong></div>
      <div className="welcome-linkbox"><input readOnly value={inviteLink(code)} onFocus={(e) => e.target.select()} /><button onClick={() => copy(code)}>{copied ? 'Đã sao chép ✓' : 'Sao chép link'}</button></div>
      <button className="welcome-primary" onClick={() => onStart(code)}>Vào phòng →</button>
      <button className="welcome-link" onClick={() => setStage('choose')}>← Quay lại</button>
      <small className="welcome-note">Các máy nối trực tiếp với nhau (WebRTC). Một số mạng wifi công ty/trường học có thể chặn kết nối này.</small>
    </div>}
  </div>;
}
