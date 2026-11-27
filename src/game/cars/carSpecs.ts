/*
 * Three cars modelled on the Kia New Carnival 2.2D Premium 7S (MPV), New Seltos 1.5L Premium (compact SUV) and New
 * Sorento 2.5G Signature FWD (mid SUV), Vietnam trims, from the owner's vehicle asset bible (dimensions published by
 * Kia Việt Nam, read 27/11/2026). Per the project's brand rule they carry original names, an original emblem and
 * fictional plates: no Kia logo, model lettering or exact trademark details. Body sections, axle positions, track and
 * colours are the bible's game proposals, not manufacturer CAD data.
 *
 * Car frame: metres, Y up, +Z forward, +X is the car's LEFT (driver side, left-hand drive), origin on the road under
 * the middle of the car.
 */
export type ModelId = 'luhanh' | 'phonho' | 'doixa';
export type CarSpec = {
  id: ModelId; name: string; kind: string; basedOn: string; trim: string;
  length: number; width: number; height: number; wheelbase: number; clearance: number;
  /** z of the front and rear axles */
  axleF: number; axleR: number; track: number;
  tyre: [number, number, number]; tankL: number; priceGame: number;
  seats: number[]; doorType: 'slidingRear' | 'hinged';
  /** body sections: t = z/L, half-width ratio of W/2, shoulder (belt) height ratio of H */
  sections: [number, number, number][];
  /** greenhouse: windshield base / top, roof end, tail glass bottom (as t), side glass inset at belt and roof (m) */
  glass: { ws0: number; ws1: number; roof1: number; tail: number; tailY: number };
  /** pillar positions on the side (t) after the A pillar: B, C(, D) */
  pillars: number[];
  /** door cut lines on the side (t): front door, rear door */
  doors: { front: [number, number]; rear: [number, number] };
  interior: string; screens: string; shifter: 'rotary' | 'lever'; roofRails: boolean; spoiler: boolean;
  rearLamps: 'barAndCorners' | 'joinedBar' | 'pairedVertical';
  rim: 'geometric10' | 'double5' | 'sharp20';
  inventorySlots: number; featureFlags: string[];
};
export const tyreRadius = ([w, a, rim]: [number, number, number]) => (rim * 0.0254 + 2 * (w / 1000) * (a / 100)) / 2;

export const CAR_SPECS: Record<ModelId, CarSpec> = {
  luhanh: {
    id: 'luhanh', name: 'Lữ Hành', kind: 'MPV 7 chỗ', basedOn: 'Kia New Carnival', trim: '2.2D Premium 7S',
    length: 5.155, width: 2.01, height: 1.775, wheelbase: 3.09, clearance: 0.172, axleF: 1.608, axleR: -1.482, track: 1.70,
    tyre: [235, 55, 19], tankL: 72, priceGame: 1_499_000_000, seats: [2, 2, 3], doorType: 'slidingRear',
    sections: [[-0.5, 0.90, 0.52], [-0.4, 0.98, 0.56], [-0.22, 1, 0.56], [0, 0.98, 0.56], [0.22, 0.97, 0.56], [0.36, 0.96, 0.54], [0.5, 0.88, 0.48]],
    glass: { ws0: 0.28, ws1: 0.05, roof1: -0.45, tail: -0.49, tailY: 0.58 },
    pillars: [-0.02, -0.25, -0.43], doors: { front: [0.255, 0.04], rear: [0.03, -0.22] },
    interior: '#9B5743', screens: '12,3 + 12,3 inch', shifter: 'rotary', roofRails: false, spoiler: true,
    rearLamps: 'barAndCorners', rim: 'geometric10', inventorySlots: 12, featureFlags: ['slidingDoors', 'powerTailgate', 'vipSeats', 'triZoneAC'],
  },
  phonho: {
    id: 'phonho', name: 'Phố Nhỏ', kind: 'SUV đô thị 5 chỗ', basedOn: 'Kia New Seltos', trim: '1.5L Premium',
    length: 4.365, width: 1.8, height: 1.645, wheelbase: 2.61, clearance: 0.19, axleF: 1.323, axleR: -1.287, track: 1.52,
    tyre: [215, 60, 17], tankL: 50, priceGame: 689_000_000, seats: [2, 3], doorType: 'hinged',
    sections: [[-0.5, 0.82, 0.51], [-0.4, 0.97, 0.58], [-0.22, 1, 0.58], [0, 0.97, 0.58], [0.22, 0.98, 0.58], [0.36, 0.97, 0.55], [0.5, 0.88, 0.49]],
    glass: { ws0: 0.22, ws1: 0.08, roof1: -0.36, tail: -0.47, tailY: 0.62 },
    pillars: [-0.07, -0.30], doors: { front: [0.215, -0.03], rear: [-0.04, -0.26] },
    interior: '#303336', screens: '10,25 + 10,25 inch', shifter: 'lever', roofRails: true, spoiler: true,
    rearLamps: 'joinedBar', rim: 'double5', inventorySlots: 8, featureFlags: ['powerTailgate', 'hud', 'wirelessCharging'],
  },
  doixa: {
    id: 'doixa', name: 'Đồi Xa', kind: 'SUV 7 chỗ', basedOn: 'Kia New Sorento', trim: '2.5G Signature FWD',
    length: 4.815, width: 1.9, height: 1.7, wheelbase: 2.815, clearance: 0.176, axleF: 1.458, axleR: -1.357, track: 1.62,
    tyre: [255, 45, 20], tankL: 67, priceGame: 1_199_000_000, seats: [2, 3, 2], doorType: 'hinged',
    sections: [[-0.5, 0.88, 0.54], [-0.4, 0.98, 0.59], [-0.22, 1, 0.59], [0, 0.98, 0.59], [0.22, 0.99, 0.59], [0.36, 0.97, 0.58], [0.5, 0.89, 0.53]],
    glass: { ws0: 0.23, ws1: 0.09, roof1: -0.40, tail: -0.48, tailY: 0.62 },
    pillars: [-0.06, -0.30, -0.40], doors: { front: [0.225, -0.02], rear: [-0.03, -0.25] },
    interior: '#D0B69B', screens: '12,3 + 12,3 inch', shifter: 'rotary', roofRails: true, spoiler: true,
    rearLamps: 'pairedVertical', rim: 'sharp20', inventorySlots: 10, featureFlags: ['powerTailgate', 'hud', 'thirdRow', 'boseAudio'],
  },
};
/** Palette from the bible (game colours, not paint codes). */
export const CAR_COLORS = [
  { id: 'ivory', name: 'Trắng ngà', hex: '#F1F0EB' }, { id: 'greygreen', name: 'Xanh xám', hex: '#577A80' },
  { id: 'urban', name: 'Xanh đô thị', hex: '#527C70' }, { id: 'navy', name: 'Xanh đậm', hex: '#294D62' }, { id: 'red', name: 'Đỏ', hex: '#B63839' },
];
export const TRIM = { black: '#23262A', silver: '#BCC3C7', tyre: '#17191A', glass: '#263844', ledWhite: '#E5F6FF', ledRed: '#C92C36', amber: '#EFA22F' };
