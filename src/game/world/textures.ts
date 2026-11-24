import * as THREE from 'three';

/** Small deterministic RNG so procedural textures look the same on every load. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return [element, element.getContext('2d')!] as const;
}

function finish(element: HTMLCanvasElement, repeat: [number, number] = [1, 1], color = true) {
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key)!;
}

/** Brick-red and grey paving used on Hà Nội lakeside promenades. Texture covers 4 × 4 m. */
export const pavingTexture = () => cached('paving', () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(11);
  const tile = 32;
  for (let y = 0; y < 256; y += tile) for (let x = 0; x < 256; x += tile) {
    const warm = r() < 0.72;
    const v = Math.round((r() - 0.5) * 18);
    ctx.fillStyle = warm ? `rgb(${172 + v},${138 + v},${118 + v})` : `rgb(${168 + v},${164 + v},${156 + v})`;
    ctx.fillRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
  }
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = r() < 0.5 ? '#000' : '#fff'; ctx.fillRect(r() * 256, r() * 256, 2, 2); }
  return finish(c);
});

/** Weathered granite blocks for the lake wall. Covers 4 m along × 1 m high. */
export const graniteTexture = () => cached('granite', () => {
  const [c, ctx] = canvas(512, 128);
  const r = rng(23);
  ctx.fillStyle = '#6f6a60';
  ctx.fillRect(0, 0, 512, 128);
  for (let row = 0; row < 2; row++) {
    let x = row ? -40 : 0;
    while (x < 512) {
      const w = 90 + r() * 70;
      const v = Math.round((r() - 0.5) * 30);
      ctx.fillStyle = `rgb(${150 + v},${145 + v},${132 + v})`;
      ctx.fillRect(x + 3, row * 64 + 3, w - 6, 58);
      x += w;
    }
  }
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 2500; i++) { ctx.fillStyle = r() < 0.5 ? '#2d2a24' : '#fff'; ctx.fillRect(r() * 512, r() * 128, 2, 2); }
  ctx.globalAlpha = 0.35;
  const moss = ctx.createLinearGradient(0, 96, 0, 128);
  moss.addColorStop(0, 'rgba(60,80,40,0)');
  moss.addColorStop(1, 'rgba(60,80,40,1)');
  ctx.fillStyle = moss;
  ctx.fillRect(0, 96, 512, 32);
  return finish(c);
});

/** Lawn with mowing stripes and clover. Covers 8 × 8 m. */
export const grassTexture = () => cached('grass', () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(5);
  ctx.fillStyle = '#5d8a3f';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 110 + r() * 60;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.35},0.5)`;
    ctx.fillRect(r() * 256, r() * 256, 1, 2 + r() * 3);
  }
  return finish(c);
});

/** Asphalt with fine aggregate. Covers 6 × 6 m. */
export const asphaltTexture = () => cached('asphalt', () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(31);
  ctx.fillStyle = '#3b3d3e';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 12000; i++) {
    const g = 40 + r() * 50;
    ctx.fillStyle = `rgb(${g},${g},${g + 2})`;
    ctx.fillRect(r() * 256, r() * 256, 1.5, 1.5);
  }
  return finish(c);
});

/** Tileable water normal map built from summed sine waves. */
export const waterNormals = () => cached('waterNormals', () => {
  const size = 256;
  const [c, ctx] = canvas(size, size);
  const image = ctx.createImageData(size, size);
  const r = rng(77);
  const waves = Array.from({ length: 10 }, () => ({ kx: Math.round(1 + r() * 7) * (r() < 0.5 ? -1 : 1), kz: Math.round(1 + r() * 7) * (r() < 0.5 ? -1 : 1), phase: r() * Math.PI * 2, amp: 0.25 + r() }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0;
    let dz = 0;
    for (const w of waves) {
      const a = (2 * Math.PI * (w.kx * x + w.kz * y)) / size + w.phase;
      dx += w.amp * w.kx * Math.cos(a);
      dz += w.amp * w.kz * Math.cos(a);
    }
    const n = new THREE.Vector3(-dx * 0.04, -dz * 0.04, 1).normalize();
    const i = (y * size + x) * 4;
    image.data[i] = (n.x * 0.5 + 0.5) * 255;
    image.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
    image.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return finish(c, [1, 1], false);
});

/** Old timber planks laid across a deck; v runs along the bridge. Covers 2.6 × 1.6 m. */
export const plankTexture = () => cached('plank', () => {
  const [c, ctx] = canvas(128, 256);
  const r = rng(41);
  const plank = 32;
  for (let i = 0; i < 8; i++) {
    const tone = 92 + Math.round(r() * 26);
    ctx.fillStyle = `rgb(${tone + 52},${Math.round(tone * 0.62)},${Math.round(tone * 0.45)})`;
    ctx.fillRect(0, i * plank, 128, plank);
    for (let g = 0; g < 9; g++) {
      ctx.strokeStyle = `rgba(60,25,15,${0.08 + r() * 0.1})`;
      ctx.beginPath();
      const y = i * plank + 3 + r() * (plank - 6);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(40, y + r() * 3 - 1.5, 90, y + r() * 3 - 1.5, 128, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40,18,12,.75)';
    ctx.fillRect(0, i * plank, 128, 2);
  }
  return finish(c, [1 / 2.6, 1 / 1.6]);
});

export type FacadeStyle = 'colonial' | 'tube' | 'modern' | 'shop';
const facadePalettes: Record<FacadeStyle, string[]> = {
  colonial: ['#e8c770', '#efd28a', '#e2b95c', '#f0dca8'],
  tube: ['#e9e1cf', '#d9c7a6', '#c9d6cf', '#e6d2c2', '#d8d8d0'],
  modern: ['#d8dcdc', '#c4ccd0', '#e3e0d8'],
  shop: ['#f2e6cf', '#e8d7b8', '#dcd2c4'],
};
const shopSigns = ['PHỞ BÒ', 'CÀ PHÊ', 'BÁNH MÌ', 'KEM TRÀNG TIỀN', 'NHÀ SÁCH', 'LỤA HÀ ĐÔNG', 'BÚN CHẢ', 'TRÀ ĐÁ', 'MẮT KÍNH', 'VÀNG BẠC', 'NHÀ HÀNG', 'HIỆU THUỐC'];
const signColors = ['#b8231b', '#1f4e8c', '#1d6b45', '#c88a12', '#7b2a6b'];

/**
 * Hà Nội street front: shuttered French windows, balconies and a shop at street level.
 * One texture represents one bay of 4 m width × `floors` storeys of 3.4 m.
 */
export function facadeTexture(style: FacadeStyle, variant: number, floors: number) {
  return cached(`facade-${style}-${variant}-${floors}`, () => {
    const r = rng(100 + variant * 13 + floors * 7 + style.length * 31);
    const W = 128;
    const F = 108;
    const [c, ctx] = canvas(W, F * floors);
    const palette = facadePalettes[style];
    const wall = palette[variant % palette.length];
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, F * floors);
    // grime streaks
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 40; i++) { ctx.fillStyle = '#3a3426'; ctx.fillRect(r() * W, r() * F * floors, 1 + r() * 3, 10 + r() * 60); }
    ctx.globalAlpha = 1;
    const shutter = style === 'colonial' ? '#2f6b4f' : ['#2f6b4f', '#7a4b2b', '#4a6a7a', '#6b6b63'][variant % 4];
    for (let f = 0; f < floors; f++) {
      const top = f * F;
      const ground = f === floors - 1;
      if (ground && style !== 'modern') {
        // shopfront
        ctx.fillStyle = '#2a2724';
        ctx.fillRect(10, top + 34, W - 20, F - 34);
        ctx.fillStyle = '#8a6a3c';
        ctx.fillRect(14, top + 40, W - 28, F - 44);
        ctx.fillStyle = 'rgba(255,214,150,.85)';
        ctx.fillRect(18, top + 44, W - 36, F - 52);
        const sign = signColors[Math.floor(r() * signColors.length)];
        ctx.fillStyle = sign;
        ctx.fillRect(6, top + 8, W - 12, 24);
        ctx.fillStyle = '#fff6dc';
        ctx.font = 'bold 13px "Be Vietnam Pro", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shopSigns[Math.floor(r() * shopSigns.length)], W / 2, top + 20, W - 18);
        continue;
      }
      if (style === 'modern') {
        ctx.fillStyle = '#6f8a96';
        ctx.fillRect(8, top + 16, W - 16, F - 34);
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.fillRect(8, top + 16, (W - 16) / 2, F - 34);
        ctx.fillStyle = '#9aa3a6';
        ctx.fillRect(0, top + F - 14, W, 6);
        continue;
      }
      const windows = style === 'colonial' ? 2 : 1;
      const ww = style === 'colonial' ? 34 : 62;
      for (let w = 0; w < windows; w++) {
        const x = windows === 1 ? (W - ww) / 2 : 18 + w * (W - 36 - ww);
        ctx.fillStyle = '#e9e2d0';
        ctx.fillRect(x - 4, top + 12, ww + 8, F - 30);
        const open = r() < 0.45;
        ctx.fillStyle = open ? '#2c2a26' : shutter;
        ctx.fillRect(x, top + 16, ww, F - 38);
        if (!open) {
          ctx.fillStyle = 'rgba(0,0,0,.25)';
          for (let s = top + 20; s < top + F - 24; s += 6) ctx.fillRect(x + 2, s, ww - 4, 1.5);
          ctx.fillRect(x + ww / 2 - 1, top + 16, 2, F - 38);
        } else if (r() < 0.6) {
          ctx.fillStyle = 'rgba(255,220,160,.7)';
          ctx.fillRect(x + 4, top + 20, ww - 8, F - 46);
        }
        if (style === 'colonial') {
          ctx.fillStyle = '#d9c38a';
          ctx.beginPath();
          ctx.arc(x + ww / 2, top + 14, ww / 2 + 4, Math.PI, 0);
          ctx.fill();
        }
      }
      // balcony with railing and plants
      if (style !== 'colonial' || f % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(0, top + F - 20, W, 4);
        ctx.fillStyle = '#3c3a36';
        ctx.fillRect(6, top + F - 34, W - 12, 3);
        for (let x = 8; x < W - 8; x += 7) ctx.fillRect(x, top + F - 34, 1.5, 16);
        if (r() < 0.6) { ctx.fillStyle = '#4b7d3a'; for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.arc(14 + r() * (W - 28), top + F - 36, 4 + r() * 4, 0, Math.PI * 2); ctx.fill(); } }
      }
      ctx.fillStyle = 'rgba(0,0,0,.1)';
      ctx.fillRect(0, top + F - 3, W, 3);
    }
    return finish(c, [1, 1]);
  });
}

/** Clay roof tiles for pitched roofs. */
export const roofTileTexture = () => cached('roof', () => {
  const [c, ctx] = canvas(128, 128);
  const r = rng(53);
  for (let y = 0; y < 128; y += 10) for (let x = (y / 10) % 2 ? -8 : 0; x < 128; x += 16) {
    const v = Math.round((r() - 0.5) * 30);
    ctx.fillStyle = `rgb(${150 + v},${68 + v / 2},${46 + v / 3})`;
    ctx.fillRect(x, y, 15, 9);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(x, y + 8, 15, 2);
  }
  return finish(c, [1, 1]);
});

/** Old lime-washed masonry with damp stains and moss, for Tháp Rùa and temple walls. Covers 2 × 2 m. */
export const limeStoneTexture = (tint = '#cfc6ae') => cached(`lime-${tint}`, () => {
  const [c, ctx] = canvas(256, 256);
  const r = rng(91);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const g = ctx.createRadialGradient(r() * 256, r() * 256, 0, r() * 256, r() * 256, 20 + r() * 60);
    g.addColorStop(0, `rgba(${70 + r() * 40},${70 + r() * 30},${50},${0.08 + r() * 0.1})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < 256; y += 16) { ctx.fillStyle = '#5a5444'; ctx.fillRect(0, y, 256, 1); for (let x = (y / 16) % 2 ? 0 : 16; x < 256; x += 32) ctx.fillRect(x, y, 1, 16); }
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 260; i++) { ctx.fillStyle = r() < 0.6 ? '#4f5a34' : '#3d3a30'; ctx.fillRect(r() * 256, 200 + r() * 56, 1 + r() * 3, 1 + r() * 6); }
  for (let i = 0; i < 40; i++) { ctx.fillStyle = '#3b3527'; ctx.fillRect(r() * 256, r() * 256, 1, 8 + r() * 30); }
  return finish(c, [0.5, 0.5]);
});

/** Lacquered red timber with lattice (song cửa) for temple walls. Covers 2 × 3 m. */
export const latticeTexture = () => cached('lattice', () => {
  const [c, ctx] = canvas(128, 192);
  ctx.fillStyle = '#8f1f17';
  ctx.fillRect(0, 0, 128, 192);
  ctx.fillStyle = '#6b140f';
  ctx.fillRect(10, 30, 108, 130);
  ctx.strokeStyle = '#b5372a';
  ctx.lineWidth = 3;
  for (let i = -130; i < 130; i += 14) {
    ctx.beginPath(); ctx.moveTo(10 + i, 30); ctx.lineTo(118 + i, 160); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(118 - i, 30); ctx.lineTo(10 - i, 160); ctx.stroke();
  }
  ctx.fillStyle = '#8f1f17';
  ctx.fillRect(0, 0, 10, 192); ctx.fillRect(118, 0, 10, 192); ctx.fillRect(0, 0, 128, 30); ctx.fillRect(0, 160, 128, 32); ctx.fillRect(60, 30, 8, 130);
  ctx.fillStyle = '#c9a24f';
  ctx.fillRect(0, 26, 128, 3); ctx.fillRect(0, 160, 128, 3);
  return finish(c, [0.5, 1 / 3]);
});

/** Painted plaque with gold Vietnamese text on red, e.g. "Đền Ngọc Sơn". */
export function plaqueTexture(text: string, vertical = false) {
  return cached(`plaque-${text}-${vertical}`, () => {
    const [c, ctx] = vertical ? canvas(64, 320) : canvas(512, 128);
    ctx.fillStyle = vertical ? '#efe6cf' : '#9c1d14';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#c9a24f';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.fillStyle = vertical ? '#2b1d14' : '#f6d37a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      ctx.font = 'bold 30px serif';
      [...text].forEach((ch, i) => ctx.fillText(ch, 32, 34 + i * 36));
    } else {
      ctx.font = 'bold 64px "Playfair Display", Georgia, serif';
      ctx.fillText(text, 256, 68, 470);
    }
    const texture = finish(c);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  });
}
