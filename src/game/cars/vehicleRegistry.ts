import { CAR_COLORS, CAR_SPECS, type ModelId } from './carSpecs';

/*
 * VehicleRegistry / VehicleConfig (master vehicle spec, sections 16–17): one data model for every car of ĐỜI VIỆT,
 * whatever brand or segment. Real-world reference data (referenceModel, referenceSources) is internal research only
 * and is never shown in the game; players see the fictional brand and model names.
 *
 * rightsStatus gates release: only ORIGINAL_DESIGN and LICENSED assets may ship. It is set by a person after review,
 * never changed automatically.
 */
export enum RightsStatus {
  ORIGINAL_DESIGN = 'ORIGINAL_DESIGN',
  LICENSED = 'LICENSED',
  REFERENCE_ONLY = 'REFERENCE_ONLY',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  BLOCKED_FOR_RELEASE = 'BLOCKED_FOR_RELEASE',
}
export const releasable = (s: RightsStatus) => s === RightsStatus.ORIGINAL_DESIGN || s === RightsStatus.LICENSED;

export type Brand = {
  brandId: string; displayBrand: string; emblem: string; colours: { primary: string; accent: string };
  designLanguage: string; interiorLanguage: string; naming: string; segments: string[]; story: string;
  /** a new brand name must be checked before a commercial release */
  nameCheck: RightsStatus;
};
export const BRANDS: Record<string, Brand> = {
  senviet: {
    brandId: 'senviet', displayBrand: 'Sen Việt', emblem: 'Vòng tròn với nụ sen ba cánh',
    colours: { primary: '#1b1d20', accent: '#e6eaec' },
    designLanguage: '"Đường sen": dải LED ban ngày liền một nét cong lên ở hai đầu như cánh sen, lưới tản nhiệt "nụ cười" thấp, mui nổi với khung kính đen, mâm 5 cánh sen kép, đèn hậu một thanh ngang có đuôi cánh hoa.',
    interiorLanguage: 'Táp-lô nằm ngang, hai màn hình chung một tấm kính, ốp gỗ và dải bạc, đèn viền vàng ấm, ghế da có đường chỉ.',
    naming: 'Tên dòng xe bằng tiếng Việt gợi hành trình và nơi chốn: Lữ Hành, Phố Nhỏ, Đồi Xa…',
    segments: ['MPV', 'SUV đô thị', 'SUV cỡ trung'],
    story: 'Thương hiệu ô tô hư cấu của thế giới ĐỜI VIỆT, lấy hình hoa sen làm biểu tượng cho sự bền bỉ và thanh lịch của Hà Nội.',
    nameCheck: RightsStatus.REVIEW_REQUIRED,
  },
};

export type VehicleConfig = {
  vehicleId: ModelId; brandId: string; displayBrand: string; displayModel: string;
  /** internal research only, never displayed */
  referenceModel: string; modelYear: number; trim: string; vehicleClass: string;
  dimensions: { length: number; width: number; height: number }; wheelbase: number; wheelRadius: number;
  seatCount: number; seatLayout: number[]; doorType: 'hinged' | 'slidingRear';
  powertrain: string; drivetrain: 'FWD' | 'RWD' | 'AWD'; fuelType: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  fuelCapacity: number; batteryCapacity: number | null;
  maxSpeedInGame: number; accelerationInGame: number; brakingInGame: number; handlingInGame: number;
  priceInGame: number; cargoCapacity: number; availableColors: string[];
  /** GLB files (LOD0 near / LOD1 / LOD2 far) under public/, or null while the car is still procedural */
  assetPaths: { lod0: string; lod1: string; lod2: string; meta: string } | null;
  animationMap: Record<string, string>; nodeMap: Record<string, string>; lodDistances: [number, number, number];
  rightsStatus: RightsStatus; referenceSources: string[]; assetLicense: string;
};

const BASE = import.meta.env.BASE_URL;
const assets = (brand: string, id: string) => ({ lod0: `${BASE}assets/vehicles/${brand}/${id}/${id}_lod0.glb`, lod1: `${BASE}assets/vehicles/${brand}/${id}/${id}_lod1.glb`, lod2: `${BASE}assets/vehicles/${brand}/${id}/${id}_lod2.glb`, meta: `${BASE}assets/vehicles/${brand}/${id}/${id}.json` });
const NODES = {
  root: 'VehicleRoot', body: 'BodyShell', glass: 'Glass', trunk: 'Trunk_Pivot', doorFL: 'Door_FL_Pivot', doorFR: 'Door_FR_Pivot', doorRL: 'Door_RL_Pivot', doorRR: 'Door_RR_Pivot',
  wheelFLSteer: 'Wheel_FL_Steer', wheelFRSteer: 'Wheel_FR_Steer', wheelFL: 'Wheel_FL_Spin', wheelFR: 'Wheel_FR_Spin', wheelRL: 'Wheel_RL_Spin', wheelRR: 'Wheel_RR_Spin',
  steering: 'SteeringWheel_Pivot', interior: 'Interior', lights: 'Lights', anchors: 'Anchors', seatFold: 'SeatFold_R3',
};
const ANIM = { doorHinged: 'rotate Y about the pivot (−side × 1,05 rad)', doorSliding: 'out 0,12 m then back 0,85 m', trunk: 'rotate X −1,2 rad', seatFold: 'rotate X +1,35 rad', wheelSpin: 'rotate X by distance / radius', steer: 'rotate Y ±0,55 rad' };

function cfg(id: ModelId, extra: Partial<VehicleConfig>): VehicleConfig {
  const s = CAR_SPECS[id];
  return {
    vehicleId: id, brandId: 'senviet', displayBrand: BRANDS.senviet.displayBrand, displayModel: s.name, referenceModel: s.basedOn, modelYear: 2026, trim: s.trim,
    vehicleClass: s.kind, dimensions: { length: s.length, width: s.width, height: s.height }, wheelbase: s.wheelbase,
    wheelRadius: (s.tyre[2] * 0.0254 + 2 * s.tyre[0] / 1000 * s.tyre[1] / 100) / 2, seatCount: s.seats.reduce((a, b) => a + b, 0), seatLayout: s.seats, doorType: s.doorType,
    powertrain: '', drivetrain: 'FWD', fuelType: 'petrol', fuelCapacity: s.tankL, batteryCapacity: null,
    maxSpeedInGame: 140, accelerationInGame: 0.6, brakingInGame: 0.7, handlingInGame: 0.6, priceInGame: s.priceGame, cargoCapacity: s.inventorySlots,
    availableColors: CAR_COLORS.map((c) => c.hex), assetPaths: null, animationMap: ANIM, nodeMap: NODES, lodDistances: [0, 18, 50],
    rightsStatus: RightsStatus.ORIGINAL_DESIGN, referenceSources: [], assetLicense: 'Thiết kế gốc của ĐỜI VIỆT', ...extra,
  };
}
export const VEHICLES: Record<ModelId, VehicleConfig> = {
  luhanh: cfg('luhanh', {
    powertrain: '2.2 diesel · 199 hp · 8AT', fuelType: 'diesel', maxSpeedInGame: 150, accelerationInGame: 0.5, handlingInGame: 0.5,
    assetPaths: assets('senviet', 'luhanh'),
    referenceSources: ['Kích thước phân khúc MPV 7 chỗ (5,155 × 2,01 × 1,775 m, chiều dài cơ sở 3,09 m) lấy từ số liệu công bố của một mẫu MPV cùng phân khúc; hình dáng do ĐỜI VIỆT tự thiết kế'],
  }),
  // Phố Nhỏ and Đồi Xa are still the procedural cars until their Blender models pass the quality gate
  phonho: cfg('phonho', { powertrain: '1.5 xăng · 113 hp · CVT', maxSpeedInGame: 150, accelerationInGame: 0.55, handlingInGame: 0.75 }),
  doixa: cfg('doixa', { powertrain: '2.5 xăng · 177 hp · 6AT', maxSpeedInGame: 165, accelerationInGame: 0.65, handlingInGame: 0.6 }),
};
/** Only releasable model files are ever loaded. */
export const modelAsset = (id: ModelId) => { const v = VEHICLES[id]; return v.assetPaths && releasable(v.rightsStatus) ? v.assetPaths : null; };
