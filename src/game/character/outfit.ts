/*
 * Modular outfits: every character (the player and all NPCs) is the same rig and body, dressed from an
 * Outfit. Pieces can be swapped independently (hair style/colour, top layers, trousers, shoes, hat,
 * glasses, bag, backpack, apron) and the player's outfit is saved in localStorage, ready for a wardrobe
 * or clothes shop.
 */
/** 'swept' = the player's messy chibi hair, 'thin' = short grey elder hair. */
export type HairStyle = 'swept' | 'short' | 'fringe' | 'side' | 'bob' | 'long' | 'ponytail' | 'bun' | 'thin';
export type Outfit = {
  skin: string;
  hairStyle: HairStyle; hair: string; hairLight: string; hairDark: string;
  /** Outer layer: 'jacket' = open zip jacket over the tee (+ hood), 'shirt' = collared shirt, 'tee' = T-shirt only, 'ao-dai' = long tunic. */
  top: 'jacket' | 'shirt' | 'tee' | 'polo';
  tee: string; jacket: string; jacketLight: string; jacketDark: string; jacketTrim: string; hood: string | null;
  pants: string; pantsLight: string; pantsDark: string; pantsCuff: string; cargo: boolean; shorts: boolean; skirt: boolean;
  shoe: string; shoeSole: string; shoeStripe: string;
  sling: boolean; backpack: boolean; apron: string | null;
  hat: 'none' | 'nonla' | 'cap' | 'helmet'; hatColor: string;
  glasses: boolean;
  build: number; // 0.92 slim … 1.1 broad
  height: number; // scale, 1 = 1.70 m
};

/** The main character, after the "Đời Việt – Nhân vật chính" sheet. */
export const PLAYER_OUTFIT: Outfit = {
  skin: '#F1B98B',
  hairStyle: 'swept', hair: '#2a2524', hairLight: '#3d3533', hairDark: '#1c1817',
  top: 'jacket', tee: '#F2EFE8', jacket: '#78836A', jacketLight: '#929D82', jacketDark: '#515C48', jacketTrim: '#444F3F', hood: '#E5DCCC',
  pants: '#35363C', pantsLight: '#484951', pantsDark: '#24252A', pantsCuff: '#616269', cargo: true, shorts: false, skirt: false,
  shoe: '#F2EFE8', shoeSole: '#DDD8CF', shoeStripe: '#35363C',
  sling: true, backpack: false, apron: null,
  hat: 'none', hatColor: '#1d1d1f', glasses: false,
  build: 1, height: 1,
};

const KEY = 'doi-viet-outfit-v2'; // v2: chibi palette
export function loadPlayerOutfit(): Outfit {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s && typeof s === 'object') return { ...PLAYER_OUTFIT, ...s }; } catch { /* ignore */ }
  return PLAYER_OUTFIT;
}
export function savePlayerOutfit(o: Outfit) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } }

/** Colour presets offered in the character panel. */
export const JACKET_PRESETS: { name: string; jacket: string; light: string; dark: string; trim: string }[] = [
  { name: 'Xanh rêu', jacket: '#78836A', light: '#929D82', dark: '#515C48', trim: '#444F3F' },
  { name: 'Be cát', jacket: '#b9a586', light: '#cdbb9d', dark: '#8f7c60', trim: '#6f5f48' },
  { name: 'Xanh navy', jacket: '#3d4d6a', light: '#55668a', dark: '#2a3549', trim: '#202a3a' },
  { name: 'Đen', jacket: '#2e2f33', light: '#45474d', dark: '#1d1e21', trim: '#141517' },
  { name: 'Đỏ đô', jacket: '#7a3434', light: '#944848', dark: '#562323', trim: '#3f1919' },
];
export const HAIR_PRESETS: { name: string; hair: string; light: string; dark: string }[] = [
  { name: 'Đen nâu', hair: '#2a2524', light: '#3d3533', dark: '#1c1817' },
  { name: 'Nâu hạt dẻ', hair: '#5a3d2b', light: '#7a5640', dark: '#3b281c' },
  { name: 'Đen tuyền', hair: '#1c1a1a', light: '#2f2b2a', dark: '#0f0e0e' },
  { name: 'Nâu sáng', hair: '#8a6545', light: '#a8805c', dark: '#5f4430' },
];

// ---- NPC variety -----------------------------------------------------------
function rnd(seed: number) { let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 233280) || 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
const pick = <T,>(r: () => number, list: T[]) => list[Math.floor(r() * list.length) % list.length];
const SKINS = ['#F1B98B', '#FFD2AD', '#DFA077', '#f3c7a0', '#d39a72', '#c48a64'];
const HAIRS = [['#2a2422', '#3f3532', '#1a1615'], ['#1c1a1a', '#2f2b2a', '#0f0e0e'], ['#4a3426', '#634837', '#2f2118'], ['#8d8a86', '#a8a5a0', '#6d6a66'], ['#d8d4cc', '#ece8e0', '#b9b4aa']];
const TOPS = ['#f2efe8', '#d9e4ef', '#e9d3c4', '#c84b3c', '#3f6e9e', '#2f5d50', '#e0b04a', '#6a5a8c', '#f4f4f2', '#2b2b2e', '#a7c7a1', '#e88a7a'];
const PANTS = [['#35363C', '#484951', '#24252A'], ['#2b3a55', '#3d4f70', '#1d2840'], ['#6b5b47', '#85735c', '#4f4334'], ['#d8d0bf', '#e8e1d2', '#b8b0a0'], ['#1f1f22', '#333338', '#141416']];

export type NpcRole = 'youngMan' | 'youngWoman' | 'student' | 'office' | 'vendor' | 'owner' | 'waiter' | 'cook' | 'middleAged' | 'elder' | 'delivery' | 'tourist' | 'jogger' | 'shopper' | 'clerk';

/** A plausible Hà Nội outfit for an NPC of a given role, varied by seed. */
export function npcOutfit(role: NpcRole, seed: number, overrides: Partial<Outfit> = {}): Outfit {
  const r = rnd(seed + role.length * 17);
  const female = role === 'youngWoman' || (role !== 'youngMan' && role !== 'cook' && r() < 0.45 && role !== 'owner' && role !== 'waiter');
  const elder = role === 'elder';
  const [hair, hairLight, hairDark] = elder ? pick(r, HAIRS.slice(3)) : pick(r, HAIRS.slice(0, 3));
  const [pants, pantsLight, pantsDark] = pick(r, PANTS);
  const tee = pick(r, TOPS);
  const jacketBase = pick(r, JACKET_PRESETS);
  const o: Outfit = {
    ...PLAYER_OUTFIT,
    skin: pick(r, SKINS), hair, hairLight, hairDark,
    hairStyle: female ? (elder ? 'bun' : pick(r, ['bob', 'ponytail', 'long', 'bun', 'fringe'] as HairStyle[])) : elder ? 'thin' : pick(r, ['short', 'swept', 'fringe', 'side', 'short'] as HairStyle[]),
    top: r() < 0.25 ? 'jacket' : r() < 0.5 ? 'shirt' : r() < 0.75 ? 'polo' : 'tee',
    tee, jacket: jacketBase.jacket, jacketLight: jacketBase.light, jacketDark: jacketBase.dark, jacketTrim: jacketBase.trim, hood: r() < 0.5 ? '#e5dccc' : null,
    pants, pantsLight, pantsDark, pantsCuff: pantsLight, cargo: r() < 0.25, shorts: role === 'jogger' || role === 'tourist' && r() < 0.6, skirt: female && r() < 0.3,
    shoe: pick(r, ['#f4f1ea', '#2b2b2e', '#c9b79c', '#e9e6df']), shoeSole: '#e9e2d4', shoeStripe: pick(r, ['#3a3b40', '#c84b3c', '#3f6e9e']),
    sling: role === 'tourist' || role === 'shopper' ? true : r() < 0.15, backpack: role === 'student' || role === 'tourist' && r() < 0.5,
    apron: null, hat: role === 'tourist' && r() < 0.5 ? 'cap' : 'none', hatColor: pick(r, ['#c84b3c', '#2b2b2e', '#f2efe8', '#3f6e9e']),
    glasses: role === 'office' || role === 'tourist' ? r() < 0.6 : r() < 0.15,
    build: 0.94 + r() * 0.14, height: female ? 0.94 + r() * 0.04 : 0.98 + r() * 0.05,
  };
  if (role === 'office') { o.top = 'shirt'; o.tee = pick(r, ['#f4f4f2', '#d9e4ef', '#e8e0f0']); o.pants = '#2b2d33'; o.pantsLight = '#3c3f47'; o.pantsDark = '#1d1f24'; o.shoe = '#2a221e'; o.shoeSole = '#1c1715'; }
  if (role === 'student') { o.top = 'shirt'; o.tee = '#f4f4f2'; o.pants = '#2b3a55'; o.pantsLight = '#3d4f70'; o.pantsDark = '#1d2840'; o.skirt = female && r() < 0.5; }
  if (role === 'jogger') { o.top = 'tee'; o.shorts = true; }
  if (role === 'elder') { o.top = 'shirt'; o.tee = pick(r, ['#e9e3d4', '#c8d3c4', '#d8cfe0']); o.build = 0.98; }
  if (role === 'delivery') { o.top = 'jacket'; o.jacket = '#16a34a'; o.jacketLight = '#3cc06a'; o.jacketDark = '#0f7a37'; o.jacketTrim = '#0b5e2a'; o.hat = 'helmet'; o.hatColor = '#16a34a'; o.hood = null; }
  return { ...o, ...overrides };
}
