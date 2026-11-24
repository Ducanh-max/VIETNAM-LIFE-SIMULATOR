export type City = {
  id: string;
  name: string;
  region: string;
  lon: number;
  lat: number;
  label: 'left' | 'right';
  open?: boolean;
  blurb: string;
};

/** Destinations on the entry map. Only Hà Nội is playable for now. */
export const cities: City[] = [
  { id: 'ha-noi', name: 'Hà Nội', region: 'Miền Bắc', lon: 105.8542, lat: 21.0285, label: 'left', open: true, blurb: 'Hồ Hoàn Kiếm, Tháp Rùa, Cầu Thê Húc và Đền Ngọc Sơn.' },
  { id: 'ha-giang', name: 'Hà Giang', region: 'Miền Bắc', lon: 104.9836, lat: 22.8233, label: 'right', blurb: 'Cao nguyên đá và những cung đèo.' },
  { id: 'sa-pa', name: 'Sa Pa', region: 'Miền Bắc', lon: 103.8438, lat: 22.3364, label: 'left', blurb: 'Ruộng bậc thang và đỉnh Fansipan.' },
  { id: 'ha-long', name: 'Hạ Long', region: 'Miền Bắc', lon: 107.0425, lat: 20.9599, label: 'right', blurb: 'Vịnh di sản với hàng nghìn đảo đá.' },
  { id: 'ninh-binh', name: 'Ninh Bình', region: 'Miền Bắc', lon: 105.9745, lat: 20.2506, label: 'right', blurb: 'Tràng An, Tam Cốc và cố đô Hoa Lư.' },
  { id: 'vinh', name: 'Vinh', region: 'Miền Trung', lon: 105.6813, lat: 18.6796, label: 'left', blurb: 'Cửa ngõ xứ Nghệ.' },
  { id: 'hue', name: 'Huế', region: 'Miền Trung', lon: 107.5909, lat: 16.4637, label: 'left', blurb: 'Đại Nội, sông Hương và lăng tẩm.' },
  { id: 'da-nang', name: 'Đà Nẵng', region: 'Miền Trung', lon: 108.2022, lat: 16.0544, label: 'right', blurb: 'Cầu Rồng, biển Mỹ Khê và Bà Nà.' },
  { id: 'quy-nhon', name: 'Quy Nhơn', region: 'Miền Trung', lon: 109.2197, lat: 13.782, label: 'right', blurb: 'Biển xanh và tháp Chăm.' },
  { id: 'nha-trang', name: 'Nha Trang', region: 'Miền Trung', lon: 109.1967, lat: 12.2388, label: 'right', blurb: 'Vịnh biển và các đảo san hô.' },
  { id: 'buon-ma-thuot', name: 'Buôn Ma Thuột', region: 'Tây Nguyên', lon: 108.05, lat: 12.6667, label: 'left', blurb: 'Thủ phủ cà phê Tây Nguyên.' },
  { id: 'da-lat', name: 'Đà Lạt', region: 'Tây Nguyên', lon: 108.4583, lat: 11.9404, label: 'left', blurb: 'Thành phố sương mù và rừng thông.' },
  { id: 'tp-hcm', name: 'TP. Hồ Chí Minh', region: 'Miền Nam', lon: 106.7009, lat: 10.7769, label: 'right', blurb: 'Nhà thờ Đức Bà, Bến Thành và sông Sài Gòn.' },
  { id: 'can-tho', name: 'Cần Thơ', region: 'Miền Nam', lon: 105.7469, lat: 10.0452, label: 'right', blurb: 'Chợ nổi Cái Răng giữa miền Tây.' },
  { id: 'phu-quoc', name: 'Phú Quốc', region: 'Miền Nam', lon: 103.984, lat: 10.2899, label: 'left', blurb: 'Đảo ngọc và hoàng hôn trên biển.' },
  { id: 'con-dao', name: 'Côn Đảo', region: 'Miền Nam', lon: 106.6, lat: 8.6833, label: 'right', blurb: 'Quần đảo hoang sơ phía nam.' },
];
